"""Conta do admin logado e trilha de atividade (menu Configurações).

- `PUT  /api/admin/me`: nome e e-mail. Trocar o e-mail (que é o login)
  exige senha atual + 2º fator; o nome não.
- `POST /api/admin/sessions/revoke-others`: encerra as sessões em outros
  dispositivos e devolve um token novo para esta continuar.
- `GET  /api/admin/me/activity`: acessos e mudanças de segurança da PRÓPRIA
  conta (Configurações > Atividade, "Seus acessos").
- `GET  /api/admin/audit`: trilha de todo o painel, paginada. Sem papéis
  (todo admin tem o mesmo nível), qualquer admin vê tudo.
"""

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, g, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from ..extensions import db, limiter
from ..models import AdminUser, AuditEvent
from ..utils.auth import TOKEN_MAX_AGE_SECONDS, issue_token, require_admin, revoke_tokens
from ..utils.mfa import second_factor_gate
from ..utils.mfa_limits import flagged_failure, mfa_limited
from ..utils.sanitize import sanitize_text
from .admin_auth import MAX_EMAIL_LENGTH, _audit
from .admin_users import _current_password_ok

bp = Blueprint("admin_account", __name__, url_prefix="/api/admin")

MAX_NAME_LENGTH = 120

# Eventos que contam como "acesso / segurança da conta".
ACCESS_EVENTS = (
    "login_success",
    "login_password_ok",
    "mfa_login_success",
    "mfa_login_failed",
    "mfa_recovery_code_used",
    "logout",
    "password_changed",
    "password_change_failed",
    "mfa_enabled",
    "mfa_disabled",
    "mfa_recovery_codes_regenerated",
    "sessions_revoked_others",
    "profile_updated",
    "rate_limited",
)

# Filtros da tela de atividade do painel: grupo -> prefixos de evento.
AUDIT_GROUPS = {
    "access": ("login", "mfa_", "logout", "password_", "sessions_", "profile_", "rate_limited"),
    "content": ("article_", "media_", "service_", "testimonial_", "faq_"),
    "leads": ("lead",),
    "users": ("admin_user_",),
    "settings": ("settings_",),
}


def _int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


# ------------------------------------------------------------------ perfil --

@bp.put("/me")
@require_admin
@limiter.limit("20 per hour")
@mfa_limited("session", flagged_failure)
def update_profile():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    admin = g.admin_user
    changes: dict = {}
    errors: dict = {}

    if "name" in payload:
        raw = payload["name"]
        if not isinstance(raw, str) or len(raw) > MAX_NAME_LENGTH * 4:
            errors["name"] = "invalid_text"
        else:
            name = sanitize_text(raw, allow_newline=False)
            if len(name) > MAX_NAME_LENGTH:
                errors["name"] = "too_long"
            elif name != (admin.name or ""):
                changes["name"] = name

    new_email = None
    if "email" in payload:
        raw = payload["email"]
        if not isinstance(raw, str) or len(raw) > MAX_EMAIL_LENGTH:
            errors["email"] = "invalid_email"
        else:
            try:
                candidate = validate_email(
                    sanitize_text(raw, allow_newline=False).strip().lower(),
                    check_deliverability=False,
                ).normalized.lower()
            except EmailNotValidError:
                errors["email"] = "invalid_email"
            else:
                if len(candidate) > 255:
                    errors["email"] = "invalid_email"
                elif candidate != admin.email:
                    new_email = candidate

    if errors:
        return {"error": "validation_error", "details": errors}, 400
    if not changes and new_email is None:
        return {"error": "no_changes"}, 400

    if new_email is not None:
        # O e-mail é o login: trocar exige provar que é o dono da conta.
        if not _current_password_ok(payload):
            _audit("profile_update_failed", admin=f"#{admin.id}", reason="invalid_current_password")
            return {"error": "invalid_current_password"}, 400
        gate = second_factor_gate(admin, payload)
        if gate is not None:
            _audit("profile_update_failed", admin=f"#{admin.id}", reason=gate[1])
            return gate[0]
        if AdminUser.query.filter(AdminUser.email == new_email, AdminUser.id != admin.id).first():
            return {"error": "email_taken"}, 409
        changes["email"] = new_email

    for key, value in changes.items():
        setattr(admin, key, value)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "email_taken"}, 409

    _audit("profile_updated", admin=f"#{admin.id}", keys=",".join(sorted(changes)))
    return {"data": {"email": admin.email, "name": admin.name or ""}}, 200


# ----------------------------------------------------------------- sessões --

@bp.post("/sessions/revoke-others")
@require_admin
@limiter.limit("10 per hour")
def revoke_other_sessions():
    admin = g.admin_user
    # Sobe a versão do token (todas as sessões caem) e emite um token novo
    # só para esta - mesmo mecanismo do logout e do MFA.
    revoke_tokens(admin)
    db.session.refresh(admin)
    _audit("sessions_revoked_others", admin=f"#{admin.id}")
    return {"ok": True, "token": issue_token(admin), "expires_in": TOKEN_MAX_AGE_SECONDS}, 200


# --------------------------------------------------------------- atividade --

@bp.get("/me/activity")
@require_admin
def my_activity():
    limit = _int_arg("limit", 30, 1, 100)
    events = (
        AuditEvent.query.filter(
            AuditEvent.actor_id == g.admin_user.id,
            AuditEvent.event.in_(ACCESS_EVENTS),
        )
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(limit)
        .all()
    )
    return {"data": [e.to_dict() for e in events]}, 200


@bp.get("/audit")
@require_admin
def list_audit():
    page = _int_arg("page", 1, 1, 10_000)
    per_page = _int_arg("per_page", 50, 1, 100)

    query = AuditEvent.query
    group = request.args.get("group")
    if group:
        prefixes = AUDIT_GROUPS.get(group)
        if prefixes is None:
            return {"error": "invalid_group"}, 400
        query = query.filter(or_(*[AuditEvent.event.startswith(p) for p in prefixes]))

    total = query.count()
    events = (
        query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    actor_ids = {e.actor_id for e in events if e.actor_id is not None}
    emails = (
        {a.id: a.email for a in AdminUser.query.filter(AdminUser.id.in_(actor_ids)).all()}
        if actor_ids
        else {}
    )
    data = []
    for event in events:
        item = event.to_dict()
        # Admin excluído: a trilha fica, só sem o e-mail.
        item["actor_email"] = emails.get(event.actor_id)
        data.append(item)

    pages = max(1, (total + per_page - 1) // per_page)
    return {"data": data, "meta": {"page": page, "per_page": per_page, "total": total, "pages": pages}}, 200
