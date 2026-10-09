"""Autenticação do painel admin - token stateless assinado (não é JWT):
`itsdangerous.URLSafeTimedSerializer`. O Flask nunca seta cookie; só recebe
`Authorization: Bearer <token>` e devolve o token puro no JSON de login. Quem
guarda o token no navegador (cookie ou storage) é o Next.
"""

import hashlib
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


def _password_fingerprint(admin: AdminUser) -> str:
    """Fingerprint curto do hash de senha atual, embutido no token assinado.

    Não é a senha nem o hash completo (não dá pra reconstruir nenhum dos
    dois a partir disso) - serve só pra invalidar tokens emitidos antes de
    uma troca de senha: `change_password()` gera um `password_hash` novo, e
    qualquer token com o fingerprint antigo deixa de bater aqui. Sem isso,
    um token vazado continuaria válido até expirar sozinho (até 4h) mesmo
    depois do admin trocar a senha por suspeita de comprometimento.

    É um SHA-256 do hash completo, não um prefixo cru dele: os primeiros
    caracteres de um hash `werkzeug.security` (scrypt) são só os parâmetros
    fixos do algoritmo (ex. "scrypt:32768:8:1$"), iguais pra qualquer senha
    - um prefixo cru não mudaria nunca entre trocas de senha.
    """
    return hashlib.sha256(admin.password_hash.encode("utf-8")).hexdigest()[:16]


def issue_token(admin: AdminUser) -> str:
    return _serializer().dumps(
        {
            "admin_id": admin.id,
            "pv": _password_fingerprint(admin),
            "tv": admin.token_version,
        }
    )


def revoke_tokens(admin: AdminUser) -> None:
    """Invalida TODOS os tokens já emitidos para `admin` (logout).

    O token é stateless - não existe sessão no servidor para apagar. O que
    dá para fazer é mudar algo que todo token carrega: a versão (`tv`).
    Vale para todas as sessões do admin, em qualquer navegador; o próximo
    login emite um token com a versão nova.

    O incremento é feito no banco (`token_version + 1`), não em Python,
    para dois logouts simultâneos não se atropelarem. Faz commit.
    """
    AdminUser.query.filter_by(id=admin.id).update(
        {AdminUser.token_version: AdminUser.token_version + 1},
        synchronize_session=False,
    )
    db.session.commit()


def verify_token(token: str | None) -> AdminUser | None:
    """Retorna o `AdminUser` do token, ou `None` para qualquer falha
    (assinatura inválida, token expirado, payload malformado, admin_id que
    não existe mais no banco, senha trocada ou logout feito depois que o
    token foi emitido). Nunca lança exceção para o chamador.
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

    admin = db.session.get(AdminUser, admin_id)
    if admin is None:
        return None

    if data.get("pv") != _password_fingerprint(admin):
        return None

    # Token sem `tv` (emitido antes dessa checagem existir) é recusado de
    # propósito, não tratado como versão 0: assim nenhum token antigo
    # escapa do logout - o custo é um login a mais depois do deploy.
    token_version = data.get("tv")
    if type(token_version) is not int or token_version != admin.token_version:
        return None

    return admin


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
