from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, g, request
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.audit import persist_audit
from ..utils.auth import require_admin
from ..utils.password_policy import MAX_PASSWORD_LENGTH, password_problem
from ..utils.sanitize import sanitize_text
from ..utils.mfa import second_factor_gate
from ..utils.mfa_limits import flagged_failure, mfa_limited
from .admin_auth import MAX_EMAIL_LENGTH, _audit

bp = Blueprint("admin_users", __name__, url_prefix="/api/admin/users")


def _serialize(user: AdminUser) -> dict:
    # NUNCA incluir password_hash.
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _current_password_ok(payload) -> bool:
    """Reautenticação: criar/excluir um admin exige a senha de quem está
    logado, não só o token. Sem isso, uma sessão roubada (cookie válido por
    até 4h) bastava pra criar uma conta própria e manter o acesso mesmo
    depois do token original expirar ou da senha ser trocada.
    """
    if not isinstance(payload, dict):
        return False
    current_password = payload.get("current_password")
    return (
        isinstance(current_password, str)
        and len(current_password) <= MAX_PASSWORD_LENGTH
        and check_password_hash(g.admin_user.password_hash, current_password)
    )


@bp.get("")
@require_admin
def list_users():
    users = AdminUser.query.order_by(AdminUser.id).all()
    return {"data": [_serialize(u) for u in users]}, 200


@bp.post("")
@require_admin
@limiter.limit("20 per hour")
@mfa_limited("session", flagged_failure)
def create_user():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    if not _current_password_ok(payload):
        return {"error": "invalid_current_password"}, 400

    # MFA ativo: reautenticação também com o 2º fator.
    gate = second_factor_gate(g.admin_user, payload)
    if gate is not None:
        _audit("admin_user_create_failed", admin=f"#{g.admin_user.id}", reason=gate[1])
        return gate[0]

    raw_email = payload.get("email")
    password = payload.get("password")

    if not isinstance(raw_email, str) or len(raw_email) > MAX_EMAIL_LENGTH:
        return {"error": "invalid_email"}, 400

    email = sanitize_text(raw_email, allow_newline=False).strip().lower()
    try:
        # Só valida a sintaxe - não consulta DNS (painel interno, e o teste
        # de entregabilidade deixaria o cadastro lento/dependente de rede).
        email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return {"error": "invalid_email"}, 400

    if len(email) > 255:
        return {"error": "invalid_email"}, 400

    # Regra única de senha - ver utils/password_policy.py.
    problem = password_problem(password, email)
    if problem is not None:
        return {"error": problem[0]}, 400

    if AdminUser.query.filter_by(email=email).first() is not None:
        return {"error": "email_taken"}, 409

    user = AdminUser(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        # Corrida: dois cadastros do mesmo e-mail passaram juntos pela
        # checagem acima e o UNIQUE do banco barrou o segundo.
        db.session.rollback()
        return {"error": "email_taken"}, 409

    # Trilha de auditoria (stdout do container -> `docker compose logs
    # backend`). `warning` de propósito: o logger do Flask descarta `info`
    # fora do modo debug.
    current_app.logger.warning(
        "AUDIT admin_user_created by=#%s (%s) target=#%s (%s) ip=%s",
        g.admin_user.id, g.admin_user.email, user.id, user.email, request.remote_addr,
    )
    persist_audit(
        "admin_user_created", actor_id=g.admin_user.id, target=f"admin#{user.id}",
        detail={"email": user.email},
    )

    return _serialize(user), 201


@bp.delete("/<int:user_id>")
@require_admin
@limiter.limit("20 per hour")
@mfa_limited("session", flagged_failure)
def delete_user(user_id: int):
    payload = request.get_json(silent=True)
    if not _current_password_ok(payload):
        return {"error": "invalid_current_password"}, 400

    gate = second_factor_gate(g.admin_user, payload)
    if gate is not None:
        _audit("admin_user_delete_failed", admin=f"#{g.admin_user.id}", reason=gate[1])
        return gate[0]

    if user_id == g.admin_user.id:
        # Evita o admin se trancar para fora do painel sem querer.
        return {"error": "cannot_delete_self"}, 400

    user = db.session.get(AdminUser, user_id)
    if user is None:
        return {"error": "not_found"}, 404

    # Tokens do usuário removido deixam de valer sozinhos: verify_token()
    # busca o admin_id no banco a cada request.
    deleted_id, deleted_email = user.id, user.email
    db.session.delete(user)
    db.session.commit()

    current_app.logger.warning(
        "AUDIT admin_user_deleted by=#%s (%s) target=#%s (%s) ip=%s",
        g.admin_user.id, g.admin_user.email, deleted_id, deleted_email, request.remote_addr,
    )
    persist_audit(
        "admin_user_deleted", actor_id=g.admin_user.id, target=f"admin#{deleted_id}",
        detail={"email": deleted_email},
    )
    return "", 204
