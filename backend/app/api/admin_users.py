from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, g, request
from werkzeug.security import generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.auth import require_admin
from ..utils.sanitize import sanitize_text

bp = Blueprint("admin_users", __name__, url_prefix="/api/admin/users")

MIN_PASSWORD_LENGTH = 10


def _serialize(user: AdminUser) -> dict:
    # NUNCA incluir password_hash.
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@bp.get("")
@require_admin
def list_users():
    users = AdminUser.query.order_by(AdminUser.id).all()
    return {"data": [_serialize(u) for u in users]}, 200


@bp.post("")
@require_admin
@limiter.limit("20 per hour")
def create_user():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    raw_email = payload.get("email")
    password = payload.get("password")

    if not isinstance(raw_email, str):
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

    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        return {"error": "weak_password"}, 400

    if AdminUser.query.filter_by(email=email).first() is not None:
        return {"error": "email_taken"}, 409

    user = AdminUser(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()

    return _serialize(user), 201


@bp.delete("/<int:user_id>")
@require_admin
def delete_user(user_id: int):
    if user_id == g.admin_user.id:
        # Evita o admin se trancar para fora do painel sem querer.
        return {"error": "cannot_delete_self"}, 400

    user = db.session.get(AdminUser, user_id)
    if user is None:
        return {"error": "not_found"}, 404

    # Tokens do usuário removido deixam de valer sozinhos: verify_token()
    # busca o admin_id no banco a cada request.
    db.session.delete(user)
    db.session.commit()
    return "", 204
