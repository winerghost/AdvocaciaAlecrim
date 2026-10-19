import hashlib
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, request
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.auth import (
    MFA_TOKEN_MAX_AGE_SECONDS,
    TOKEN_MAX_AGE_SECONDS,
    issue_mfa_token,
    issue_token,
    require_admin,
    revoke_tokens,
)
from ..utils.mfa import recovery_codes_remaining, second_factor_gate
from ..utils.mfa_limits import flagged_failure, mfa_limited
from ..utils.password_policy import MAX_PASSWORD_LENGTH, password_problem
from ..utils.audit import actor_from_fields, clean_detail, persist_audit
from ..utils.sanitize import sanitize_text
from ..services.avatar import AVATAR_PRESETS, avatar_payload

bp = Blueprint("admin_auth", __name__, url_prefix="/api/admin")

MAX_EMAIL_LENGTH = 255

# Limites do login (três camadas):
# 1. por IP (chave padrão do limiter), qualquer e-mail;
# 2. por CONTA + IP: a cota de quem erra a senha de um e-mail é do PRÓPRIO
#    IP dele - um terceiro errando de outro IP gasta o balde dele, não o do
#    admin legítimo (antes, 10 erros de qualquer lugar travavam o admin por
#    1 h). A espera é progressiva: rajada curta pela camada 1, teto por hora
#    aqui;
# 3. teto por CONTA, qualquer IP e bem mais alto: segura ataque distribuído
#    (muitos IPs, um e-mail) sem tornar o bloqueio trivial. Quando estoura,
#    o log registra `rate_limited` - é o sinal para investigar.
LOGIN_IP_RATE_LIMIT = "5 per 15 minutes"
LOGIN_ACCOUNT_IP_RATE_LIMIT = "10 per hour"
LOGIN_ACCOUNT_CEILING_RATE_LIMIT = "30 per hour"

# Hash "dummy" fixo, gerado uma única vez na importação do módulo (nunca a
# partir de dado de request). Usado só para dar a `check_password_hash` algo
# para comparar quando o e-mail não existe - ver comentário em `login()`.
_DUMMY_PASSWORD_HASH = generate_password_hash("timing-attack-mitigation-dummy")

# Prefixo "método:parâmetros" (ex. "scrypt:32768:8:1") que o Werkzeug usa
# HOJE por padrão - derivado do hash acima, não escrito à mão, para acompanhar
# o default da versão instalada. Hash de admin com prefixo diferente é legado
# e é regravado no próximo login bem-sucedido.
_CURRENT_HASH_METHOD = _DUMMY_PASSWORD_HASH.split("$", 1)[0]


def _normalize_login_email(raw_email) -> str | None:
    """E-mail do login já normalizado, ou `None` se nem dá para usar
    (ausente, não-texto, grande demais ou vazio).

    Mesma sanitização usada em `LeadSchema` (reutiliza `utils/sanitize.py`)
    - nunca confia em entrada crua vinda do cliente.
    """
    if not isinstance(raw_email, str) or len(raw_email) > MAX_EMAIL_LENGTH:
        return None
    return sanitize_text(raw_email, allow_newline=False).strip().lower() or None


def _login_account_key() -> str:
    """Chave do limite por conta: o e-mail normalizado do corpo do request.

    É o MESMO valor que `login()` usa para buscar o admin, então variar
    maiúsculas/espaços não abre um balde novo. Vai como SHA-256 para a chave
    ter tamanho fixo e não levar texto do cliente para o storage do limiter.

    Não consulta o banco: o limite vale igual para e-mail que existe e que
    não existe, senão o 429 viraria um jeito de descobrir quais existem.

    Sem e-mail utilizável (JSON inválido, tipo errado, grande demais) não há
    conta para proteger - cai num balde por IP, separado pelo prefixo.
    Nunca levanta exceção: quem responde a request ruim é a própria view.
    """
    try:
        payload = request.get_json(silent=True)
        raw_email = payload.get("email") if isinstance(payload, dict) else None
        email = _normalize_login_email(raw_email)
    except Exception:
        email = None
    if email is None:
        return f"login-sem-email:{get_remote_address()}"
    return "login-conta:" + hashlib.sha256(email.encode("utf-8")).hexdigest()


def _login_account_ip_key() -> str:
    """Chave do limite por conta + IP (ver `_login_account_key`)."""
    return f"{_login_account_key()}|{get_remote_address()}"


def _is_failed_login(response) -> bool:
    return response.status_code == 401


def _email_tag(email: str | None) -> str:
    """Identificador curto de um e-mail digitado no login, para o log.

    Nunca o texto cru: é entrada de quem NÃO está autenticado (PII de
    terceiros e vetor de log injection). O hash curto basta para ver que
    várias tentativas miram a mesma conta.
    """
    if email is None:
        return "-"
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


def iso_utc(value: datetime | None) -> str | None:
    """Datas saem do banco sem tzinfo, mas são sempre UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def mark_login(admin: AdminUser) -> None:
    """Registra a hora do login que abriu sessão (senha, ou senha + MFA)."""
    admin.last_login_at = datetime.now(timezone.utc)
    db.session.commit()


def _audit(event: str, **fields) -> None:
    """Linha de auditoria de autenticação (stdout -> `docker compose logs
    backend`). `warning` porque o logger do Flask descarta `info` fora do
    modo debug. Segue o formato `AUDIT <evento> chave=valor` do resto do app.
    """
    parts = " ".join(f"{key}={value}" for key, value in fields.items())
    current_app.logger.warning("AUDIT %s %s ip=%s", event, parts, request.remote_addr)
    persist_audit(
        event,
        actor_id=actor_from_fields(fields),
        detail=clean_detail({k: v for k, v in fields.items() if k != "admin"}),
    )


@bp.post("/login")
@limiter.limit(LOGIN_IP_RATE_LIMIT)
# Só tentativa FALHA (401) gasta a cota da conta: o admin entrando certo
# várias vezes na mesma hora não se bloqueia sozinho. Estourada a cota, até
# a senha certa leva 429 até a janela andar.
@limiter.limit(
    LOGIN_ACCOUNT_IP_RATE_LIMIT,
    key_func=_login_account_ip_key,
    deduct_when=_is_failed_login,
    scope="login-conta-ip",
)
@limiter.limit(
    LOGIN_ACCOUNT_CEILING_RATE_LIMIT,
    key_func=_login_account_key,
    deduct_when=_is_failed_login,
    scope="login-conta-teto",
)
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    raw_email = payload.get("email")
    password = payload.get("password")

    email = _normalize_login_email(raw_email)
    if email is None or not isinstance(password, str):
        _audit("login_failed", reason="malformed", email=_email_tag(email))
        return {"error": "invalid_credentials"}, 401
    if len(password) > MAX_PASSWORD_LENGTH:
        _audit("login_failed", reason="malformed", email=_email_tag(email))
        return {"error": "invalid_credentials"}, 401

    admin = AdminUser.query.filter_by(email=email).first()

    # `check_password_hash` roda de propósito devagar (scrypt) - se só
    # chamássemos ela quando `admin` existe (ex.: `admin is None or not
    # check_password_hash(...)`, que faz curto-circuito), um e-mail
    # inexistente responderia bem mais rápido que um e-mail existente com
    # senha errada. Mesmo devolvendo a mesma mensagem/status, isso vaza via
    # TEMPO de resposta se o e-mail existe (timing attack de enumeração).
    # Por isso comparamos sempre contra um hash de verdade - o do admin
    # encontrado, ou um hash dummy fixo quando não há admin - mantendo o
    # custo (e portanto o tempo) igual nos dois casos.
    password_hash = admin.password_hash if admin is not None else _DUMMY_PASSWORD_HASH
    password_ok = check_password_hash(password_hash, password)

    # Mesma mensagem genérica pros dois casos (e-mail inexistente ou senha
    # errada) - nunca revela se o e-mail existe.
    if admin is None or not password_ok:
        # O log não distingue "e-mail inexistente" de "senha errada": o
        # operador não precisa dessa diferença, e assim ela nunca vaza.
        _audit("login_failed", reason="invalid_credentials", email=_email_tag(email))
        return {"error": "invalid_credentials"}, 401

    # Hash legado (método/custo diferente do default atual do Werkzeug) é
    # regravado agora, que a senha em texto está em mãos. Só acontece uma vez
    # por conta; o fingerprint do token muda junto, então sessões antigas
    # desse admin caem (aceitável, é uma migração única).
    if admin.password_hash.split("$", 1)[0] != _CURRENT_HASH_METHOD:
        admin.password_hash = generate_password_hash(password)
        admin.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        _audit("password_rehashed", admin=f"#{admin.id}")

    # MFA ativo: a senha sozinha NÃO abre sessão. Só aqui (senha já correta)
    # o cliente fica sabendo que a conta tem MFA - antes disso a resposta é
    # a mesma de qualquer falha. Segundo passo em api/admin_mfa.py.
    if admin.totp_enabled:
        if not admin.totp_secret_enc:
            # Segredo ilegível (FIELD_ENCRYPTION_KEY trocada?): o TOTP vai
            # falhar fechado; só o código de recuperação ainda entra.
            _audit("mfa_secret_unreadable", admin=f"#{admin.id}")
        _audit("login_password_ok", admin=f"#{admin.id}", mfa="required")
        return {
            "mfa_required": True,
            "mfa_token": issue_mfa_token(admin),
            "expires_in": MFA_TOKEN_MAX_AGE_SECONDS,
        }, 200

    mark_login(admin)
    _audit("login_success", admin=f"#{admin.id}")
    token = issue_token(admin)
    return {
        "token": token,
        "expires_in": TOKEN_MAX_AGE_SECONDS,
        "email": admin.email,
    }, 200


@bp.get("/me")
@require_admin
def me():
    admin = g.admin_user
    return {
        "id": admin.id,
        "email": admin.email,
        "name": admin.name or "",
        "mfa_enabled": bool(admin.totp_enabled),
        "recovery_codes_remaining": recovery_codes_remaining(admin),
        "created_at": iso_utc(admin.created_at),
        "last_login_at": iso_utc(admin.last_login_at),
        "password_changed_at": iso_utc(admin.password_changed_at),
        "avatar": avatar_payload(admin.avatar),
        "avatar_presets": list(AVATAR_PRESETS),
    }, 200


@bp.post("/logout")
@require_admin
def logout():
    # Sem isso o "Sair" só apagava o cookie no navegador, e um token
    # copiado antes continuava valendo até expirar sozinho (até 4h).
    revoke_tokens(g.admin_user)
    _audit("logout", admin=f"#{g.admin_user.id}")
    return {"ok": True}, 200


@bp.post("/change-password")
@require_admin
@limiter.limit("5 per 15 minutes")
@mfa_limited("session", flagged_failure)
def change_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    current_password = payload.get("current_password")
    new_password = payload.get("new_password")

    admin = g.admin_user

    if (
        not isinstance(current_password, str)
        or len(current_password) > MAX_PASSWORD_LENGTH
        or not check_password_hash(admin.password_hash, current_password)
    ):
        # Já autenticado (passou por `require_admin`), então 400 aqui não
        # vaza enumeração de usuário - é só "você errou a senha atual".
        _audit("password_change_failed", admin=f"#{admin.id}", reason="invalid_current_password")
        return {"error": "invalid_current_password"}, 400

    # MFA ativo: trocar a senha também exige o 2º fator (sessão roubada +
    # senha vazada não bastam).
    gate = second_factor_gate(admin, payload)
    if gate is not None:
        _audit("password_change_failed", admin=f"#{admin.id}", reason=gate[1])
        return gate[0]

    # Regra única de senha - ver utils/password_policy.py.
    problem = password_problem(new_password, admin.email)
    if problem is not None:
        return {"error": problem[0]}, 400

    admin.password_hash = generate_password_hash(new_password)
    admin.updated_at = datetime.now(timezone.utc)
    admin.password_changed_at = admin.updated_at
    db.session.commit()
    _audit("password_changed", admin=f"#{admin.id}")

    # A senha nova muda o fingerprint `pv`, o que derruba TODAS as sessões,
    # inclusive esta. Devolvemos um token novo (com o `pv` novo) para quem
    # acabou de trocar a senha continuar logado; as outras sessões caem.
    return {"ok": True, "token": issue_token(admin), "expires_in": TOKEN_MAX_AGE_SECONDS}, 200
