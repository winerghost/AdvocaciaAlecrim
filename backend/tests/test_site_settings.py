"""Configurações do site (menu Configurações): leitura pública, edição com
reautenticação, validação por chave e uso no aviso de novo lead."""

import logging

from app.extensions import db
from app.models import Lead, SiteSetting
from app.services import email as email_service
from app.services import site_settings

from conftest import ADMIN_PASSWORD
from test_mfa import auth_headers, code_at, mfa_admin  # noqa: F401 - mfa_admin é fixture


def _put(client, token, group, **values):
    body = {"current_password": ADMIN_PASSWORD, **values}
    return client.put(f"/api/admin/settings/{group}", json=body, headers=auth_headers(token))


# ----------------------------------------------------------------- leitura --

def test_public_site_settings_returns_defaults_with_empty_table(client):
    resp = client.get("/api/settings/site")
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["phone"] == "5563999941821"
    assert data["contact_email"] == "alecrimrio@gmail.com"
    assert data["instagram"] == "advocaciaalecrim_"
    assert data["controller_name"] == ""
    assert data["legal_updated_at"] is None


def test_notifications_group_is_not_public(client):
    assert client.get("/api/settings/notifications").status_code == 404


def test_admin_settings_require_auth(client):
    assert client.get("/api/admin/settings/site").status_code == 401
    assert client.put("/api/admin/settings/site", json={}).status_code == 401


def test_admin_unknown_group_is_404(client, admin_token):
    resp = client.get("/api/admin/settings/secrets", headers=auth_headers(admin_token))
    assert resp.status_code == 404


def test_admin_notifications_reports_mail_status(client, admin_token):
    resp = client.get("/api/admin/settings/notifications", headers=auth_headers(admin_token))
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["values"] == {"lead_email_enabled": True, "lead_email_recipients": []}
    assert data["mail_configured"] is False


def test_invalid_stored_value_falls_back_to_default(app):
    db.session.add(SiteSetting(key="site", value={"phone": "abc", "location": "Gurupi, TO"}))
    db.session.commit()
    values = site_settings.get_settings("site")
    assert values["phone"] == "5563999941821"
    assert values["location"] == "Gurupi, TO"


# ----------------------------------------------------------------- edição --

def test_update_requires_current_password(client, admin_token):
    resp = client.put(
        "/api/admin/settings/site",
        json={"current_password": "errada", "location": "Gurupi"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_current_password"}
    assert db.session.get(SiteSetting, "site") is None


def test_update_requires_second_factor_when_mfa_on(client, mfa_admin):
    resp = _put(client, mfa_admin["token"], "site", location="Gurupi")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "mfa_code_required"}

    ok = _put(client, mfa_admin["token"], "site", location="Gurupi", code=code_at(mfa_admin["secret"], 1))
    assert ok.status_code == 200, ok.get_json()
    assert ok.get_json()["data"]["values"]["location"] == "Gurupi"


def test_update_site_contact_normalizes_and_is_public(client, admin_token, caplog):
    caplog.set_level(logging.WARNING)
    resp = _put(
        client,
        admin_token,
        "site",
        phone="(63) 98888-7777",
        contact_email="  Contato@Escritorio.com.br ",
        instagram="@novo.perfil",
        location="<b>Palmas</b> - TO",
    )
    assert resp.status_code == 200, resp.get_json()
    values = resp.get_json()["data"]["values"]
    assert values["phone"] == "5563988887777"
    assert values["contact_email"] == "contato@escritorio.com.br"
    assert values["instagram"] == "novo.perfil"
    assert values["location"] == "Palmas - TO"

    public = client.get("/api/settings/site").get_json()["data"]
    assert public["phone"] == "5563988887777"

    # Auditoria só com nomes de chaves, nunca os valores.
    audit = [r.getMessage() for r in caplog.records if "settings_changed" in r.getMessage()]
    assert audit and "contact_email" in audit[0]
    assert "escritorio" not in audit[0]


def test_phone_with_ddd_55_gets_country_code(client, admin_token):
    resp = _put(client, admin_token, "site", phone="(55) 99999-8888")
    assert resp.status_code == 200
    assert resp.get_json()["data"]["values"]["phone"] == "5555999998888"


def test_validation_errors_are_per_field_and_nothing_is_saved(client, admin_token):
    resp = _put(
        client,
        admin_token,
        "site",
        phone="123",
        contact_email="não é e-mail",
        instagram="https://evil.example/x",
        location="",
        admin="true",
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert body["details"] == {
        "phone": "invalid_phone",
        "contact_email": "invalid_email",
        "instagram": "invalid_instagram",
        "location": "required",
        "admin": "unknown_field",
    }
    assert db.session.get(SiteSetting, "site") is None


def test_update_without_changes_is_rejected(client, admin_token):
    resp = _put(client, admin_token, "site")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "no_changes"}


def test_legal_fields_update_privacy_date(client, admin_token):
    resp = _put(client, admin_token, "site", controller_name="Dr. Fulano de Tal")
    values = resp.get_json()["data"]["values"]
    assert values["controller_name"] == "Dr. Fulano de Tal"
    assert values["legal_updated_at"] is not None

    # Mudar só o contato não mexe na data do aviso.
    db.session.get(SiteSetting, "site").value = {
        **db.session.get(SiteSetting, "site").value,
        "legal_updated_at": "2026-01-01",
    }
    db.session.commit()
    resp = _put(client, admin_token, "site", location="Gurupi")
    assert resp.get_json()["data"]["values"]["legal_updated_at"] == "2026-01-01"


def test_legal_updated_at_is_read_only(client, admin_token):
    resp = _put(client, admin_token, "site", legal_updated_at="2000-01-01")
    assert resp.status_code == 400
    assert resp.get_json()["details"] == {"legal_updated_at": "unknown_field"}


def test_notification_recipients_validated_and_deduplicated(client, admin_token):
    resp = _put(
        client,
        admin_token,
        "notifications",
        lead_email_recipients=["A@x.com", "a@x.com", "b@y.com"],
        lead_email_enabled=False,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["data"]["values"] == {
        "lead_email_enabled": False,
        "lead_email_recipients": ["a@x.com", "b@y.com"],
    }

    bad = _put(client, admin_token, "notifications", lead_email_recipients=["x@y.com\r\nBcc: z@z.com"])
    assert bad.status_code == 400
    too_many = _put(
        client, admin_token, "notifications", lead_email_recipients=[f"a{i}@x.com" for i in range(6)]
    )
    assert too_many.status_code == 400
    not_bool = _put(client, admin_token, "notifications", lead_email_enabled="sim")
    assert not_bool.get_json()["details"] == {"lead_email_enabled": "invalid_boolean"}


# ------------------------------------------------------- aviso de novo lead --

class _RecordingSMTP:
    sent: list = []

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, **kwargs):
        pass

    def login(self, *args):
        pass

    def send_message(self, msg):
        _RecordingSMTP.sent.append(msg)


def _enable_mail(app, monkeypatch):
    app.config["MAIL_SERVER"] = "smtp.example.com"
    app.config["MAIL_USERNAME"] = None
    _RecordingSMTP.sent = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)


def _lead():
    lead = Lead(name="Maria", phone="63999990000", consent=True)
    db.session.add(lead)
    db.session.commit()
    return lead


def test_lead_notice_uses_panel_recipients(app, monkeypatch):
    _enable_mail(app, monkeypatch)
    site_settings.save_settings("notifications", {"lead_email_recipients": ["a@x.com", "b@y.com"]}, 1)
    email_service.notify_new_lead(_lead())
    assert len(_RecordingSMTP.sent) == 1
    assert _RecordingSMTP.sent[0]["To"] == "a@x.com, b@y.com"


def test_lead_notice_falls_back_to_mail_to(app, monkeypatch):
    _enable_mail(app, monkeypatch)
    app.config["MAIL_TO"] = "fallback@x.com"
    email_service.notify_new_lead(_lead())
    assert _RecordingSMTP.sent[0]["To"] == "fallback@x.com"


def test_lead_notice_can_be_disabled(app, monkeypatch):
    _enable_mail(app, monkeypatch)
    site_settings.save_settings("notifications", {"lead_email_enabled": False}, 1)
    email_service.notify_new_lead(_lead())
    assert _RecordingSMTP.sent == []


# --------------------------------------------------------- e-mail de teste --

def test_test_email_without_mail_server(client, admin_token):
    resp = client.post("/api/admin/settings/notifications/test", headers=auth_headers(admin_token))
    assert resp.status_code == 503
    assert resp.get_json() == {"error": "mail_not_configured"}


def test_test_email_sends_without_lead_data(app, client, admin_token, monkeypatch):
    _enable_mail(app, monkeypatch)
    app.config["MAIL_TO"] = "fallback@x.com"
    resp = client.post("/api/admin/settings/notifications/test", headers=auth_headers(admin_token))
    assert resp.status_code == 200
    assert resp.get_json() == {"data": {"sent_to": ["fallback@x.com"]}}
    assert "Teste" in _RecordingSMTP.sent[0]["Subject"]
