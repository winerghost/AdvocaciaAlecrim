"""Rate limit das rotas que aceitam o segundo fator (`/login/mfa`, `mfa/*` e
as ações sensíveis que exigem `code`: criar/excluir admin, trocar senha).

Sem limite o TOTP de 6 dígitos seria forçável. As três camadas (IP, conta+IP
e teto por conta) usam `scope` COMUM a todas essas rotas: quem erra o código
em uma gasta a cota das outras, senão bastaria alternar de rota. Só FALHAS
gastam cota.

A chave da conta vem de credencial VÁLIDA (token de sessão ou mfa_token
verificados, com pv/tv) - nunca de assinatura crua. Sem credencial válida o
balde é por IP.
"""

from flask import g, request
from flask_limiter.util import get_remote_address

from ..extensions import limiter
from .auth import bearer_token, verify_mfa_token, verify_token

MFA_IP_RATE_LIMIT = "10 per 15 minutes"
MFA_ACCOUNT_IP_RATE_LIMIT = "10 per hour"
MFA_ACCOUNT_CEILING_RATE_LIMIT = "30 per hour"


def status_failure(response) -> bool:
    return response.status_code in (400, 401)


def flagged_failure(response) -> bool:
    """Para rotas com outros 400 legítimos (validação de e-mail etc.): só
    conta a falha que a própria rota marcou em `g.mfa_failed`."""
    return bool(g.get("mfa_failed"))


def _account_id(source: str) -> int | None:
    cache = g.setdefault("_mfa_limit_ids", {})
    if source not in cache:
        if source == "mfa":
            payload = request.get_json(silent=True)
            token = payload.get("mfa_token") if isinstance(payload, dict) else None
            admin = verify_mfa_token(token)
        else:
            admin = verify_token(bearer_token())
        cache[source] = admin.id if admin is not None else None
    return cache[source]


def _make_keys(source: str):
    def account_key() -> str:
        admin_id = _account_id(source)
        if admin_id is None:
            return f"mfa-sem-conta:{get_remote_address()}"
        return f"mfa-conta:{admin_id}"

    def account_ip_key() -> str:
        return f"{account_key()}|{get_remote_address()}"

    return account_key, account_ip_key


def mfa_limited(source: str, deduct_when=status_failure):
    """Decorator com as três camadas. `source`: "mfa" (corpo traz `mfa_token`)
    ou "session" (Bearer)."""
    account_key, account_ip_key = _make_keys(source)

    def decorator(view):
        # `shared_limit` (e não `limit`): é ele que divide o balde entre
        # rotas - `limit(scope=...)` ainda separa por endpoint.
        view = limiter.shared_limit(
            MFA_ACCOUNT_CEILING_RATE_LIMIT,
            scope="mfa-conta-teto",
            key_func=account_key,
            deduct_when=deduct_when,
        )(view)
        view = limiter.shared_limit(
            MFA_ACCOUNT_IP_RATE_LIMIT,
            scope="mfa-conta-ip",
            key_func=account_ip_key,
            deduct_when=deduct_when,
        )(view)
        return limiter.shared_limit(
            MFA_IP_RATE_LIMIT, scope="mfa-ip", deduct_when=deduct_when
        )(view)

    return decorator
