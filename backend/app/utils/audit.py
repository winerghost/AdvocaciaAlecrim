"""Gravação da trilha de auditoria no banco (tabela `audit_events`).

Os helpers `_audit` de cada módulo continuam escrevendo a linha
`AUDIT <evento> ...` no stdout (formato que os testes e o operador já
usam) e chamam `persist_audit` para guardar o mesmo evento no banco, onde o
painel consegue mostrar (Configurações > Atividade).

Falhar ao gravar NUNCA derruba a requisição: desfaz, registra e segue.
"""

import re

from flask import current_app, g, has_request_context, request

from ..extensions import db
from ..models import AuditEvent

_MAX_FIELDS = 8
_MAX_VALUE_LENGTH = 120
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_ADMIN_REF_RE = re.compile(r"#(\d{1,10})")
# Nunca vão para o banco, mesmo que alguém passe por engano.
_FORBIDDEN_KEYS = frozenset({"password", "current_password", "code", "recovery_code", "token", "secret"})


def _clean_value(value) -> str:
    text = _CONTROL_RE.sub(" ", str(value))
    return text[:_MAX_VALUE_LENGTH]


def clean_detail(fields: dict) -> dict:
    detail = {}
    for key, value in fields.items():
        if key in _FORBIDDEN_KEYS or value is None:
            continue
        detail[str(key)[:32]] = _clean_value(value)
        if len(detail) >= _MAX_FIELDS:
            break
    return detail


def actor_from_fields(fields: dict) -> int | None:
    """Quem é o admin do evento: o logado (g.admin_user) ou, no fluxo de
    login (ainda sem sessão), o `admin=#id` passado ao helper."""
    admin = getattr(g, "admin_user", None) if has_request_context() else None
    if admin is not None:
        return admin.id
    match = _ADMIN_REF_RE.fullmatch(str(fields.get("admin", "")))
    return int(match.group(1)) if match else None


def persist_audit(event: str, *, actor_id: int | None = None, target: str | None = None,
                  detail: dict | None = None) -> None:
    try:
        ip = user_agent = None
        if has_request_context():
            ip = (request.remote_addr or "")[:45] or None
            user_agent = _clean_value(request.headers.get("User-Agent") or "")[:200] or None
        db.session.add(
            AuditEvent(
                event=event[:64],
                actor_id=actor_id,
                target=target[:64] if target else None,
                detail=detail or None,
                ip=ip,
                user_agent=user_agent,
            )
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Falha ao gravar o evento de auditoria %s no banco", event)
