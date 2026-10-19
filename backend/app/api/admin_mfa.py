"""Segundo fator (TOTP) do painel admin: login em 2 passos e gestão do MFA.

Fluxo: `POST /login` (senha) devolve `mfa_required` + `mfa_token` quando o
admin tem MFA ativo; `POST /login/mfa` troca o `mfa_token` + código pelo token
de sessão. Setup/enable/disable/recovery-codes exigem sessão e, para as
ações sensíveis, a senha atual (mesmo padrão de `change-password`).
"""

from datetime import datetime, timezone

from flask import Blueprint, g, request
from sqlalchemy import Text, type_coerce
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import AdminUser
from ..utils import mfa
from ..utils.auth import TOKEN_MAX_AGE_SECONDS, issue_token, require_admin, verify_mfa_token
from ..utils.mfa_limits import mfa_limited
from ..utils.password_policy import MAX_PASSWORD_LENGTH
from .admin_auth import _audit, mark_login

bp = Blueprint("admin_mfa", __name__, url_prefix="/api/admin")

# Rate limit (IP, conta+IP, teto por conta; só falhas, escopos compartilhados
# com as ações sensíveis que pedem `code`): ver utils/mfa_limits.py.
_session_limited = mfa_limited("session")
_mfa_token_limited = mfa_limited("mfa")


def _json_body():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else None


def _session_response(admin: AdminUser) -> dict:
    """Sessão nova (tv já incrementado): o MFA mudou, então as sessões
    anteriores caem e o painel recebe um token fresco."""
    return {"token": issue_token(admin), "expires_in": TOKEN_MAX_AGE_SECONDS}


def _password_ok(payload: dict) -> bool:
    current_password = payload.get("current_password")
    return (
        isinstance(current_password, str)
        and len(current_password) <= MAX_PASSWORD_LENGTH
        and check_password_hash(g.admin_user.password_hash, current_password)
    )


# ------------------------------------------------------------ login passo 2 --

@bp.post("/login/mfa")
@_mfa_token_limited
def login_mfa():
    payload = _json_body()
    if payload is None:
        return {"error": "invalid_json"}, 400

    admin = verify_mfa_token(payload.get("mfa_token"))
    if admin is None:
        _audit("mfa_login_failed", reason="invalid_mfa_token")
        return {"error": "invalid_mfa_token"}, 401

    kind = mfa.verify_second_factor(admin, payload.get("code"), payload.get("recovery_code"))
    if kind is None:
        _audit("mfa_login_failed", admin=f"#{admin.id}", reason="invalid_code")
        return {"error": "invalid_code"}, 401

    if kind == "recovery":
        _audit(
            "mfa_recovery_code_used",
            admin=f"#{admin.id}",
            remaining=mfa.recovery_codes_remaining(admin),
        )
    mark_login(admin)
    _audit("mfa_login_success", admin=f"#{admin.id}", method=kind)
    return {
        "token": issue_token(admin),
        "expires_in": TOKEN_MAX_AGE_SECONDS,
        "email": admin.email,
    }, 200


# ------------------------------------------------------------------ gestão --

@bp.post("/mfa/setup")
@require_admin
@_session_limited
def mfa_setup():
    payload = _json_body()
    if payload is None:
        return {"error": "invalid_json"}, 400
    admin = g.admin_user

    if not _password_ok(payload):
        _audit("mfa_setup_failed", admin=f"#{admin.id}", reason="invalid_current_password")
        return {"error": "invalid_current_password"}, 400
    if admin.totp_enabled:
        return {"error": "mfa_already_enabled"}, 409

    # Segredo novo a cada setup: refazer descarta um setup pendente anterior.
    # UPDATE condicional em totp_enabled = false: um enable concorrente não
    # tem o segredo trocado por baixo.
    secret = mfa.new_secret()
    result = db.session.execute(
        db.update(AdminUser)
        .where(AdminUser.id == admin.id, AdminUser.totp_enabled.is_(False))
        .values(
            totp_secret_enc=secret,
            totp_last_step=None,
            recovery_codes_hash=None,
            updated_at=datetime.now(timezone.utc),
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.session.rollback()
        return {"error": "mfa_already_enabled"}, 409
    db.session.commit()
    _audit("mfa_setup_started", admin=f"#{admin.id}")

    return {"secret": secret, "otpauth_uri": mfa.provisioning_uri(admin.email, secret)}, 200


@bp.post("/mfa/enable")
@require_admin
@_session_limited
def mfa_enable():
    payload = _json_body()
    if payload is None:
        return {"error": "invalid_json"}, 400
    admin = g.admin_user

    if admin.totp_enabled:
        return {"error": "mfa_already_enabled"}, 409
    raw_secret, secret = mfa.pending_secret(admin.id)
    if not secret:
        return {"error": "mfa_not_setup"}, 400

    code = mfa.normalize_totp(payload.get("code"))
    step = mfa.matching_step(secret, code) if code is not None else None
    if step is None:
        _audit("mfa_enable_failed", admin=f"#{admin.id}", reason="invalid_code")
        return {"error": "invalid_code"}, 400

    codes = mfa.generate_recovery_codes()
    # Habilita e consome o passo no mesmo UPDATE condicional (atômico), só se
    # ainda desabilitado e com o MESMO segredo que foi validado acima. Sobe a
    # versão do token: sessões e mfa_tokens anteriores caem.
    if not mfa.claim_step(
        admin.id,
        step,
        extra_where=(
            AdminUser.totp_enabled.is_(False),
            type_coerce(AdminUser.totp_secret_enc, Text) == raw_secret,
        ),
        totp_enabled=True,
        token_version=AdminUser.token_version + 1,
        recovery_codes_hash=mfa.hash_recovery_codes(codes),
        updated_at=datetime.now(timezone.utc),
    ):
        _audit("mfa_enable_failed", admin=f"#{admin.id}", reason="invalid_code")
        return {"error": "invalid_code"}, 400

    _audit("mfa_enabled", admin=f"#{admin.id}")
    return {"recovery_codes": codes, **_session_response(admin)}, 200


def _confirm_sensitive(admin: AdminUser, payload: dict, action: str):
    """Senha atual + segundo fator, com MFA ativo. Devolve a resposta de erro
    (corpo, status) ou `None` quando tudo confere.
    """
    if not _password_ok(payload):
        _audit(f"mfa_{action}_failed", admin=f"#{admin.id}", reason="invalid_current_password")
        return {"error": "invalid_current_password"}, 400
    if not admin.totp_enabled:
        return {"error": "mfa_not_enabled"}, 400
    kind = mfa.verify_second_factor(admin, payload.get("code"), payload.get("recovery_code"))
    if kind is None:
        _audit(f"mfa_{action}_failed", admin=f"#{admin.id}", reason="invalid_code")
        return {"error": "invalid_code"}, 400
    return None


@bp.post("/mfa/disable")
@require_admin
@_session_limited
def mfa_disable():
    payload = _json_body()
    if payload is None:
        return {"error": "invalid_json"}, 400
    admin = g.admin_user

    error = _confirm_sensitive(admin, payload, "disable")
    if error is not None:
        return error

    AdminUser.query.filter_by(id=admin.id).update(
        {
            AdminUser.totp_enabled: False,
            AdminUser.totp_secret_enc: None,
            AdminUser.totp_last_step: None,
            AdminUser.recovery_codes_hash: None,
            AdminUser.token_version: AdminUser.token_version + 1,
            AdminUser.updated_at: datetime.now(timezone.utc),
        },
        synchronize_session=False,
    )
    db.session.commit()
    _audit("mfa_disabled", admin=f"#{admin.id}")
    return {"ok": True, **_session_response(admin)}, 200


@bp.post("/mfa/recovery-codes")
@require_admin
@_session_limited
def mfa_regenerate_recovery_codes():
    payload = _json_body()
    if payload is None:
        return {"error": "invalid_json"}, 400
    admin = g.admin_user

    error = _confirm_sensitive(admin, payload, "recovery_codes")
    if error is not None:
        return error

    codes = mfa.generate_recovery_codes()
    AdminUser.query.filter_by(id=admin.id).update(
        {
            AdminUser.recovery_codes_hash: mfa.hash_recovery_codes(codes),
            AdminUser.token_version: AdminUser.token_version + 1,
            AdminUser.updated_at: datetime.now(timezone.utc),
        },
        synchronize_session=False,
    )
    db.session.commit()
    _audit("mfa_recovery_codes_regenerated", admin=f"#{admin.id}")
    return {"recovery_codes": codes, **_session_response(admin)}, 200
