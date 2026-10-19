"""Fase 2 do menu Configurações: perfil, sair de outros dispositivos,
trilha de auditoria no banco e expurgo dela."""

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import AdminUser, AuditEvent
from app.utils import auth as auth_module

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD
from purge_leads import purge_old_audit_events
from test_mfa import auth_headers, code_at, mfa_admin, password_login  # noqa: F401


def _events(event=None):
    query = AuditEvent.query
    if event:
        query = query.filter_by(event=event)
    return query.order_by(AuditEvent.id).all()


# ------------------------------------------------------------------ perfil --

def test_login_sets_last_login_and_is_recorded(client, admin):
    resp = client.post(
        "/api/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"User-Agent": "Navegador de Teste/1.0"},
    )
    assert resp.status_code == 200
    assert db.session.get(AdminUser, admin.id).last_login_at is not None

    [event] = _events("login_success")
    assert event.actor_id == admin.id
    assert event.user_agent == "Navegador de Teste/1.0"


def test_failed_login_is_recorded_without_typed_email(client, admin):
    client.post("/api/admin/login", json={"email": "Fulano@Example.com", "password": "errada"})
    [event] = _events("login_failed")
    assert event.actor_id is None  # nunca revela se o e-mail existe
    assert "fulano" not in str(event.detail).lower()


def test_update_name_needs_no_reauth(client, admin, admin_token):
    resp = client.put("/api/admin/me", json={"name": "  Dr. <b>Alecrim</b> "}, headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["data"]["name"] == "Dr. Alecrim"
    me = client.get("/api/admin/me", headers=auth_headers(admin_token)).get_json()
    assert me["name"] == "Dr. Alecrim"
    [event] = _events("profile_updated")
    assert event.detail == {"keys": "name"}


def test_change_email_requires_password(client, admin, admin_token):
    resp = client.put("/api/admin/me", json={"email": "novo@example.com"}, headers=auth_headers(admin_token))
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_current_password"}
    assert db.session.get(AdminUser, admin.id).email == ADMIN_EMAIL

    ok = client.put(
        "/api/admin/me",
        json={"email": "Novo@Example.com", "current_password": ADMIN_PASSWORD},
        headers=auth_headers(admin_token),
    )
    assert ok.status_code == 200
    assert db.session.get(AdminUser, admin.id).email == "novo@example.com"


def test_change_email_requires_second_factor_when_mfa_on(client, mfa_admin):
    body = {"email": "novo@example.com", "current_password": ADMIN_PASSWORD}
    resp = client.put("/api/admin/me", json=body, headers=auth_headers(mfa_admin["token"]))
    assert resp.get_json() == {"error": "mfa_code_required"}
    ok = client.put(
        "/api/admin/me",
        json={**body, "code": code_at(mfa_admin["secret"], 1)},
        headers=auth_headers(mfa_admin["token"]),
    )
    assert ok.status_code == 200


def test_change_email_rejects_taken_and_invalid(client, admin, admin_token):
    db.session.add(AdminUser(email="outro@example.com", password_hash="x"))
    db.session.commit()
    taken = client.put(
        "/api/admin/me",
        json={"email": "outro@example.com", "current_password": ADMIN_PASSWORD},
        headers=auth_headers(admin_token),
    )
    assert taken.status_code == 409
    bad = client.put("/api/admin/me", json={"email": "não-é-email"}, headers=auth_headers(admin_token))
    assert bad.get_json()["details"] == {"email": "invalid_email"}


def test_profile_without_changes(client, admin, admin_token):
    resp = client.put("/api/admin/me", json={"email": ADMIN_EMAIL, "name": ""}, headers=auth_headers(admin_token))
    assert resp.get_json() == {"error": "no_changes"}


def test_password_change_sets_date(client, admin, admin_token):
    client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "novaSenhaForte123"},
        headers=auth_headers(admin_token),
    )
    assert db.session.get(AdminUser, admin.id).password_changed_at is not None


# ----------------------------------------------------------------- sessões --

def test_revoke_other_sessions_keeps_only_the_new_token(client, admin, admin_token):
    other_device = auth_module.issue_token(admin)

    resp = client.post("/api/admin/sessions/revoke-others", headers=auth_headers(admin_token))
    assert resp.status_code == 200
    new_token = resp.get_json()["token"]

    assert client.get("/api/admin/me", headers=auth_headers(other_device)).status_code == 401
    assert client.get("/api/admin/me", headers=auth_headers(admin_token)).status_code == 401
    assert client.get("/api/admin/me", headers=auth_headers(new_token)).status_code == 200
    assert _events("sessions_revoked_others")


# --------------------------------------------------------------- atividade --

def test_my_activity_shows_only_my_access_events(client, admin, admin_token):
    other = AdminUser(email="outro@example.com", password_hash="x")
    db.session.add(other)
    db.session.commit()
    db.session.add(AuditEvent(event="login_success", actor_id=other.id))
    db.session.add(AuditEvent(event="faq_created", actor_id=admin.id))
    db.session.commit()
    password_login(client)

    data = client.get("/api/admin/me/activity", headers=auth_headers(admin_token)).get_json()["data"]
    assert [e["event"] for e in data] == ["login_success"]
    assert data[0]["actor_id"] == admin.id


def test_audit_lists_all_events_with_actor_email_and_filters(client, admin, admin_token):
    created = client.post(
        "/api/admin/faqs", json={"question": "Pergunta?", "answer": "Resposta."}, headers=auth_headers(admin_token)
    )
    assert created.status_code == 201
    faq_id = created.get_json()["data"]["id"]
    client.get("/api/admin/leads", headers=auth_headers(admin_token))

    resp = client.get("/api/admin/audit", headers=auth_headers(admin_token)).get_json()
    events = {e["event"]: e for e in resp["data"]}
    assert events["faq_created"]["target"] == f"faq#{faq_id}"
    assert events["faq_created"]["actor_email"] == ADMIN_EMAIL
    assert events["leads_listed"]["detail"] == {"count": "0"}
    assert resp["meta"]["total"] == 2

    only_content = client.get("/api/admin/audit?group=content", headers=auth_headers(admin_token)).get_json()
    assert [e["event"] for e in only_content["data"]] == ["faq_created"]
    bad = client.get("/api/admin/audit?group=xyz", headers=auth_headers(admin_token))
    assert bad.status_code == 400


def test_audit_pagination(client, admin, admin_token):
    for i in range(5):
        db.session.add(AuditEvent(event="faq_created", actor_id=admin.id, target=f"faq#{i}"))
    db.session.commit()
    page2 = client.get("/api/admin/audit?per_page=2&page=2", headers=auth_headers(admin_token)).get_json()
    assert len(page2["data"]) == 2
    assert page2["meta"] == {"page": 2, "per_page": 2, "total": 5, "pages": 3}


def test_audit_requires_auth(client):
    assert client.get("/api/admin/audit").status_code == 401
    assert client.get("/api/admin/me/activity").status_code == 401


def test_deleted_admin_keeps_trail(client, admin, admin_token):
    db.session.add(AuditEvent(event="faq_created", actor_id=999))
    db.session.commit()
    data = client.get("/api/admin/audit", headers=auth_headers(admin_token)).get_json()["data"]
    assert data[0]["actor_id"] == 999 and data[0]["actor_email"] is None


def test_secrets_never_reach_audit_detail(client, admin, admin_token):
    client.post(
        "/api/admin/change-password",
        json={"current_password": "senha-errada-123", "new_password": "outraSenhaForte123"},
        headers=auth_headers(admin_token),
    )
    for event in _events():
        assert "senha-errada" not in str(event.detail)
        assert "outraSenha" not in str(event.detail)


# ------------------------------------------------------------------ expurgo --

def test_purge_removes_only_old_audit_events(app):
    old = AuditEvent(event="login_success", created_at=datetime.now(timezone.utc) - timedelta(days=91))
    recent = AuditEvent(event="login_success")
    db.session.add_all([old, recent])
    db.session.commit()

    assert purge_old_audit_events(90, dry_run=True) == 1
    assert AuditEvent.query.count() == 2
    assert purge_old_audit_events(90) == 1
    assert AuditEvent.query.count() == 1
