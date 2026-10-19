"""Configurações do site (menu Configurações do painel).

- `GET /api/settings/site`: público, só o grupo "site" (contato, redes,
  dados legais). Lido pelo Next a cada request, com fallback no frontend.
- `GET /api/admin/settings/<grupo>`: leitura no painel.
- `PUT /api/admin/settings/<grupo>`: atualização parcial. Exige senha atual
  + 2º fator (mesmo padrão de api/admin_users.py): trocar o telefone ou os
  destinatários dos avisos redireciona clientes e alertas do escritório,
  então uma sessão roubada sozinha não pode fazer isso.
- `POST /api/admin/settings/notifications/test`: e-mail de teste.
"""

from flask import Blueprint, current_app, g, request

from ..extensions import limiter
from ..services import site_settings
from ..services.email import mail_configured, send_test_message
from ..utils.auth import require_admin
from ..utils.mfa import second_factor_gate
from ..utils.mfa_limits import flagged_failure, mfa_limited
from .admin_auth import _audit
from .admin_users import _current_password_ok

public_bp = Blueprint("settings_public", __name__, url_prefix="/api/settings")
admin_bp = Blueprint("settings_admin", __name__, url_prefix="/api/admin/settings")

# Campos da reautenticação: chegam junto com as mudanças no mesmo corpo e
# não são chaves de configuração.
_REAUTH_FIELDS = ("current_password", "code", "recovery_code")


@public_bp.get("/site")
def public_site_settings():
    return {"data": site_settings.get_settings("site")}


def _admin_payload(group: str) -> dict:
    data: dict = {"values": site_settings.get_settings(group)}
    if group == "notifications":
        # O painel mostra se o envio funciona e para onde vai sem lista.
        data["mail_configured"] = mail_configured()
        data["fallback_recipient"] = current_app.config.get("MAIL_TO") or None
    return data


@admin_bp.get("/<group>")
@require_admin
def get_group(group: str):
    if group not in site_settings.GROUPS:
        return {"error": "not_found"}, 404
    return {"data": _admin_payload(group)}


@admin_bp.put("/<group>")
@require_admin
@limiter.limit("30 per hour")
@mfa_limited("session", flagged_failure)
def update_group(group: str):
    if group not in site_settings.GROUPS:
        return {"error": "not_found"}, 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    if not _current_password_ok(payload):
        return {"error": "invalid_current_password"}, 400

    gate = second_factor_gate(g.admin_user, payload)
    if gate is not None:
        _audit("settings_change_failed", admin=f"#{g.admin_user.id}", group=group, reason=gate[1])
        return gate[0]

    changes = {k: v for k, v in payload.items() if k not in _REAUTH_FIELDS}
    if not changes:
        return {"error": "no_changes"}, 400

    clean, errors = site_settings.validate_update(group, changes)
    if errors:
        return {"error": "validation_error", "details": errors}, 400

    _values, changed = site_settings.save_settings(group, clean, g.admin_user.id)
    # Só os NOMES das chaves: valores (e-mails, telefone) ficam fora do log.
    _audit(
        "settings_changed",
        admin=f"#{g.admin_user.id}",
        group=group,
        keys=",".join(sorted(changed)) or "-",
    )
    return {"data": _admin_payload(group)}


@admin_bp.post("/notifications/test")
@require_admin
@limiter.limit("5 per hour")
def send_test():
    if not mail_configured():
        return {"error": "mail_not_configured"}, 503

    _enabled, recipients = site_settings.lead_notification_settings(
        current_app.config.get("MAIL_TO")
    )
    if not recipients:
        return {"error": "no_recipients"}, 400

    try:
        send_test_message(recipients)
    except Exception:
        current_app.logger.exception("Falha ao enviar e-mail de teste")
        return {"error": "mail_send_failed"}, 502

    _audit("settings_test_email_sent", admin=f"#{g.admin_user.id}", count=len(recipients))
    return {"data": {"sent_to": recipients}}
