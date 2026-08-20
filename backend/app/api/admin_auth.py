from datetime import datetime, timezone

from flask import Blueprint, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.auth import TOKEN_MAX_AGE_SECONDS, issue_token, require_admin
from ..utils.sanitize import sanitize_text

bp = Blueprint("admin_auth", __name__, url_prefix="/api/admin")

MIN_NEW_PASSWORD_LENGTH = 10

# Hash "dummy" fixo, gerado uma única vez na importação do módulo (nunca a
# partir de dado de request). Usado só para dar a `check_password_hash` algo
# para comparar quando o e-mail não existe - ver comentário em `login()`.
_DUMMY_PASSWORD_HASH = generate_password_hash("timing-attack-mitigation-dummy")


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
