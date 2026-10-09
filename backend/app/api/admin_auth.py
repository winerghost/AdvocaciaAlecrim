import hashlib
from datetime import datetime, timezone

from flask import Blueprint, g, request
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db, limiter
from ..models import AdminUser
from ..utils.auth import TOKEN_MAX_AGE_SECONDS, issue_token, require_admin, revoke_tokens
from ..utils.password_policy import MAX_PASSWORD_LENGTH, password_problem
from ..utils.sanitize import sanitize_text

bp = Blueprint("admin_auth", __name__, url_prefix="/api/admin")

MAX_EMAIL_LENGTH = 255

# Limites do login. O primeiro é por IP (chave padrão do limiter); o segundo
# é por CONTA e não olha o IP - sem ele, quem troca de IP (ou forja
# X-Forwarded-For) a cada tentativa renova a cota e testa senhas à vontade
# contra o mesmo e-mail.
LOGIN_IP_RATE_LIMIT = "5 per 15 minutes"
LOGIN_ACCOUNT_RATE_LIMIT = "10 per hour"

# Hash "dummy" fixo, gerado uma única vez na importação do módulo (nunca a
# partir de dado de request). Usado só para dar a `check_password_hash` algo
# para comparar quando o e-mail não existe - ver comentário em `login()`.
_DUMMY_PASSWORD_HASH = generate_password_hash("timing-attack-mitigation-dummy")


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


def _is_failed_login(response) -> bool:
    return response.status_code == 401


@bp.post("/login")
@limiter.limit(LOGIN_IP_RATE_LIMIT)
# Só tentativa FALHA (401) gasta a cota da conta: o admin entrando certo
# várias vezes na mesma hora não se bloqueia sozinho. Estourada a cota, até
# a senha certa leva 429 até a janela andar.
@limiter.limit(
    LOGIN_ACCOUNT_RATE_LIMIT,
    key_func=_login_account_key,
    deduct_when=_is_failed_login,
)
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    raw_email = payload.get("email")
    password = payload.get("password")

    email = _normalize_login_email(raw_email)
    if email is None or not isinstance(password, str):
        return {"error": "invalid_credentials"}, 401
    if len(password) > MAX_PASSWORD_LENGTH:
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


@bp.post("/logout")
@require_admin
def logout():
    # Sem isso o "Sair" só apagava o cookie no navegador, e um token
    # copiado antes continuava valendo até expirar sozinho (até 4h).
    revoke_tokens(g.admin_user)
    return {"ok": True}, 200


@bp.post("/change-password")
@require_admin
@limiter.limit("5 per 15 minutes")
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
        return {"error": "invalid_current_password"}, 400

    # Regra única de senha - ver utils/password_policy.py.
    problem = password_problem(new_password, admin.email)
    if problem is not None:
        return {"error": problem[0]}, 400

    admin.password_hash = generate_password_hash(new_password)
    admin.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return {"ok": True}, 200
