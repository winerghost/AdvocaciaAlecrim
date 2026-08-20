from datetime import datetime, timezone

from flask import Blueprint, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.auth import TOKEN_MAX_AGE_SECONDS, issue_token, require_admin
from ..utils.sanitize import sanitize_text

bp = Blueprint("admin_auth", __name__, url_prefix="/api/admin")

MIN_NEW_PASSWORD_LENGTH = 10


@bp.post("/login")
@limiter.limit("5 per 15 minutes")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    raw_email = payload.get("email")
    password = payload.get("password")

    if not isinstance(raw_email, str) or not isinstance(password, str):
        return {"error": "invalid_credentials"}, 401

    # Mesma sanitização usada em `LeadSchema` (reutiliza `utils/sanitize.py`)
    # antes de comparar - nunca confia em entrada crua vinda do cliente.
    email = sanitize_text(raw_email, allow_newline=False).strip().lower()

    admin = AdminUser.query.filter_by(email=email).first()

    # Mesma mensagem genérica pros dois casos (e-mail inexistente ou senha
    # errada) - nunca revela se o e-mail existe.
    if admin is None or not check_password_hash(admin.password_hash, password):
        return {"error": "invalid_credentials"}, 401

    token = issue_token(admin)
    return {
        "token": token,
        "expires_in": TOKEN_MAX_AGE_SECONDS,
        "email": admin.email,
    }, 200


@bp.get("/me")
@require_admin
def me():
    return {"email": g.admin_user.email}, 200


@bp.post("/change-password")
@require_admin
def change_password():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    current_password = payload.get("current_password")
    new_password = payload.get("new_password")

    admin = g.admin_user

    if not isinstance(current_password, str) or not check_password_hash(
        admin.password_hash, current_password
    ):
        # Já autenticado (passou por `require_admin`), então 400 aqui não
        # vaza enumeração de usuário - é só "você errou a senha atual".
        return {"error": "invalid_current_password"}, 400

    if not isinstance(new_password, str) or len(new_password) < MIN_NEW_PASSWORD_LENGTH:
        return {"error": "weak_password"}, 400

    admin.password_hash = generate_password_hash(new_password)
    admin.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return {"ok": True}, 200
