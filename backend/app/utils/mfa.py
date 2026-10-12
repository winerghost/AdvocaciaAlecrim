"""Segundo fator (TOTP, RFC 6238) do painel admin.

Só a parte criptográfica/de estado; as rotas ficam em `api/admin_mfa.py`.
O segredo é cifrado em repouso pelo próprio tipo da coluna
(`AdminUser.totp_secret_enc` -> `EncryptedText`) e nunca sai daqui em log.
"""

import json
import re
import secrets
import time

import pyotp
from cryptography.fernet import InvalidToken
from flask import g
from sqlalchemy import Text, or_, select, type_coerce
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import AdminUser
from .crypto import cipher

ISSUER = "Advocacia Alecrim"
TOTP_DIGITS = 6
TOTP_INTERVAL = 30
# Tolerância de relógio: aceita o passo anterior e o seguinte (+-30 s).
TOTP_WINDOW = 1

RECOVERY_CODE_COUNT = 10
# Sem caracteres ambíguos (0/o, 1/l/i).
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_RECOVERY_RE = re.compile(r"^[a-z0-9]{4}-[a-z0-9]{4}$")
_TOTP_RE = re.compile(r"^[0-9]{6}$")


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(email: str, secret: str) -> str:
    return pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL).provisioning_uri(
        name=email, issuer_name=ISSUER
    )


def normalize_totp(raw) -> str | None:
    """Código TOTP normalizado (6 dígitos), ou `None` se não tem esse formato."""
    if not isinstance(raw, str) or len(raw) > 32:
        return None
    code = "".join(raw.split())
    return code if _TOTP_RE.fullmatch(code) else None


def normalize_recovery(raw) -> str | None:
    """Código de recuperação em minúsculas, sem espaços e com hífen."""
    if not isinstance(raw, str) or len(raw) > 32:
        return None
    code = "".join(raw.split()).lower()
    if len(code) == 8:
        code = f"{code[:4]}-{code[4:]}"
    return code if _RECOVERY_RE.fullmatch(code) else None


def matching_step(secret: str, code: str, now: float | None = None) -> int | None:
    """Passo (contador) cujo código bate com `code` dentro da janela, ou
    `None`. Compara em tempo constante e percorre a janela inteira.
    """
    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
    current = int((time.time() if now is None else now) // TOTP_INTERVAL)
    matched = None
    for step in range(current - TOTP_WINDOW, current + TOTP_WINDOW + 1):
        if secrets.compare_digest(totp.generate_otp(step), code):
            matched = step
    return matched


def claim_step(admin_id: int, step: int, extra_where=(), **extra) -> bool:
    """Marca `step` como usado, de forma atômica.

    UPDATE condicional: só vale se o último passo aceito for menor. Duas
    requisições simultâneas com o mesmo código disputam a mesma linha e só
    uma tem `rowcount == 1`. `extra` entra no mesmo UPDATE (ex. habilitar) e
    `extra_where` acrescenta condições ao WHERE. Faz commit quando consegue.
    """
    result = db.session.execute(
        db.update(AdminUser)
        .where(
            AdminUser.id == admin_id,
            or_(AdminUser.totp_last_step.is_(None), AdminUser.totp_last_step < step),
            *extra_where,
        )
        .values(totp_last_step=step, **extra)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.session.rollback()
        return False
    db.session.commit()
    return True


def pending_secret(admin_id: int) -> tuple[str | None, str | None]:
    """(texto cifrado como está no banco, segredo decifrado) do admin.

    O texto cifrado serve de condição do UPDATE do enable: o Fernet não é
    determinístico, então comparar o segredo em claro no SQL não funciona.
    """
    raw = db.session.execute(
        select(type_coerce(AdminUser.totp_secret_enc, Text)).where(AdminUser.id == admin_id)
    ).scalar_one_or_none()
    if not raw:
        return None, None
    try:
        return raw, cipher().decrypt(raw.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return raw, None


def verify_totp(admin: AdminUser, code, **extra) -> bool:
    """Valida e consome (anti-replay) um código TOTP do admin."""
    normalized = normalize_totp(code)
    secret = admin.totp_secret_enc
    if normalized is None or not secret:
        return False
    step = matching_step(secret, normalized)
    if step is None:
        return False
    return claim_step(admin.id, step, **extra)


# --------------------------------------------------- códigos de recuperação --

def generate_recovery_codes() -> list[str]:
    def one() -> str:
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(8))
        return f"{raw[:4]}-{raw[4:]}"

    codes: set[str] = set()
    while len(codes) < RECOVERY_CODE_COUNT:
        codes.add(one())
    return sorted(codes, key=lambda _c: secrets.randbits(32))


def hash_recovery_codes(codes: list[str]) -> str:
    return json.dumps([generate_password_hash(code) for code in codes])


def _load_hashes(admin: AdminUser) -> list[str]:
    try:
        data = json.loads(admin.recovery_codes_hash or "[]")
    except ValueError:
        return []
    return [h for h in data if isinstance(h, str)] if isinstance(data, list) else []


def recovery_codes_remaining(admin: AdminUser) -> int:
    return len(_load_hashes(admin))


def consume_recovery_code(admin: AdminUser, raw_code) -> bool:
    """Valida e remove (uso único) um código de recuperação.

    Confere TODOS os hashes sem parar no primeiro acerto (tempo não revela a
    posição). A remoção é um UPDATE condicional no valor lido: dois usos
    simultâneos do mesmo código não passam os dois. Faz commit.
    """
    code = normalize_recovery(raw_code)
    stored = admin.recovery_codes_hash
    hashes = _load_hashes(admin)
    if code is None or not hashes:
        return False

    matched = None
    for index, hashed in enumerate(hashes):
        if check_password_hash(hashed, code) and matched is None:
            matched = index
    if matched is None:
        return False

    remaining = [h for i, h in enumerate(hashes) if i != matched]
    result = db.session.execute(
        db.update(AdminUser)
        .where(AdminUser.id == admin.id, AdminUser.recovery_codes_hash == stored)
        .values(recovery_codes_hash=json.dumps(remaining))
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.session.rollback()
        return False
    db.session.commit()
    return True


def verify_second_factor(admin: AdminUser, code, recovery_code=None) -> str | None:
    """Confere TOTP ou código de recuperação. Devolve "totp", "recovery" ou
    `None`. Um `code` fora do formato de 6 dígitos é tentado como código de
    recuperação (o painel usa o mesmo campo para os dois).
    """
    if isinstance(recovery_code, str) and recovery_code:
        return "recovery" if consume_recovery_code(admin, recovery_code) else None
    if normalize_totp(code) is not None:
        return "totp" if verify_totp(admin, code) else None
    if isinstance(code, str) and consume_recovery_code(admin, code):
        return "recovery"
    return None


def second_factor_gate(admin: AdminUser, payload: dict):
    """Exige o 2º fator em ações sensíveis (criar/excluir admin, trocar senha)
    quando o admin tem MFA ativo. Devolve `None` (liberado: sem MFA, ou código
    válido e consumido) ou `((corpo, status), motivo)`.

    Código errado marca `g.mfa_failed`: só essa falha gasta a cota dos
    limites compartilhados (ver utils/mfa_limits.py).
    """
    if not admin.totp_enabled:
        return None
    code = payload.get("code")
    recovery = payload.get("recovery_code")
    if code in (None, "") and recovery in (None, ""):
        return ({"error": "mfa_code_required"}, 400), "mfa_code_required"
    if verify_second_factor(admin, code, recovery) is None:
        g.mfa_failed = True
        return ({"error": "invalid_code"}, 400), "invalid_code"
    return None
