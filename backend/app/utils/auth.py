"""Autenticação do painel admin - token stateless assinado (não é JWT):
`itsdangerous.URLSafeTimedSerializer`. O Flask nunca seta cookie; só recebe
`Authorization: Bearer <token>` e devolve o token puro no JSON de login. Quem
guarda o token no navegador (cookie ou storage) é o Next.
"""

from functools import wraps

from flask import current_app, g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from ..extensions import db
from ..models import AdminUser

_SALT = "admin-auth"

# 4 horas - usado tanto para validar quanto para informar `expires_in` no
# corpo da resposta de login.
TOKEN_MAX_AGE_SECONDS = 4 * 60 * 60


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def issue_token(admin: AdminUser) -> str:
    return _serializer().dumps({"admin_id": admin.id})


def verify_token(token: str | None) -> AdminUser | None:
    """Retorna o `AdminUser` do token, ou `None` para qualquer falha
    (assinatura inválida, token expirado, payload malformado, ou admin_id
    que não existe mais no banco). Nunca lança exceção para o chamador.
    """
    if not token:
        return None

    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    except Exception:  # defesa extra - qualquer erro inesperado = inválido
        return None

    if not isinstance(data, dict):
        return None

    admin_id = data.get("admin_id")
    if admin_id is None:
        return None

    return db.session.get(AdminUser, admin_id)


def _extract_bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    return token or None


def require_admin(view_func):
    """Decorator para rotas Flask: lê `Authorization: Bearer <token>`,
    valida e injeta o `AdminUser` em `flask.g.admin_user`. Responde
    `401 {"error": "unauthorized"}` se o token faltar ou for inválido.
    """

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        admin = verify_token(_extract_bearer_token())
        if admin is None:
            return {"error": "unauthorized"}, 401
        g.admin_user = admin
        return view_func(*args, **kwargs)

    return wrapper
