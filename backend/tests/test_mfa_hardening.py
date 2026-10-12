"""MFA: 2º fator em ações sensíveis, rotação de sessão, corridas e reset."""

import logging

from sqlalchemy import Text, text, type_coerce

from app.extensions import db
from app.models import AdminUser
from app.utils import auth as auth_module
from app.utils import mfa as mfa_module

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD
from test_mfa import (  # noqa: F401 - mfa_admin é fixture
    auth_headers,
    code_at,
    enable_mfa,
    mfa_admin,
    password_login,
    setup_mfa,
)

NEW_ADMIN = {"email": "novo@example.com", "password": "NovaContaSenhaForte456Xy"}


def _create(client, mfa_admin, **extra):
    body = {"current_password": ADMIN_PASSWORD, **NEW_ADMIN, **extra}
    return client.post("/api/admin/users", json=body, headers=auth_headers(mfa_admin["token"]))


# ------------------------------------------- 2º fator em ações sensíveis --

def test_create_admin_requires_second_factor_when_mfa_on(client, mfa_admin):
    missing = _create(client, mfa_admin)
    assert missing.status_code == 400
    assert missing.get_json() == {"error": "mfa_code_required"}

    wrong = _create(client, mfa_admin, code="000000")
    assert wrong.status_code == 400
    assert wrong.get_json() == {"error": "invalid_code"}
    assert AdminUser.query.filter_by(email=NEW_ADMIN["email"]).first() is None

    ok = _create(client, mfa_admin, code=code_at(mfa_admin["secret"], 1))
    assert ok.status_code == 201


def test_create_admin_accepts_recovery_code_once(client, mfa_admin):
    code = mfa_admin["recovery"][0]
    assert _create(client, mfa_admin, recovery_code=code).status_code == 201

    again = _create(client, mfa_admin, recovery_code=code, email="outro2@example.com")
    assert again.get_json() == {"error": "invalid_code"}


def test_create_admin_replayed_totp_is_rejected(client, mfa_admin):
    code = code_at(mfa_admin["secret"], 1)
    assert _create(client, mfa_admin, code=code).status_code == 201

    again = _create(client, mfa_admin, code=code, email="outro3@example.com")
    assert again.status_code == 400 and again.get_json() == {"error": "invalid_code"}


def test_delete_admin_requires_second_factor_when_mfa_on(client, mfa_admin):
    from werkzeug.security import generate_password_hash

    other = AdminUser(email="z@example.com", password_hash=generate_password_hash("Abc12345678901Xy"))
    db.session.add(other)
    db.session.commit()
    url = f"/api/admin/users/{other.id}"
    headers = auth_headers(mfa_admin["token"])

    missing = client.delete(url, json={"current_password": ADMIN_PASSWORD}, headers=headers)
    assert missing.status_code == 400
    assert missing.get_json() == {"error": "mfa_code_required"}
    wrong = client.delete(
        url, json={"current_password": ADMIN_PASSWORD, "code": "000000"}, headers=headers
    )
    assert wrong.get_json() == {"error": "invalid_code"}
    assert db.session.get(AdminUser, other.id) is not None


def test_change_password_requires_second_factor_when_mfa_on(client, mfa_admin):
    headers = auth_headers(mfa_admin["token"])
    body = {"current_password": ADMIN_PASSWORD, "new_password": "NovaSenhaMuitoForte789Zq"}

    missing = client.post("/api/admin/change-password", json=body, headers=headers)
    assert missing.get_json() == {"error": "mfa_code_required"}
    wrong = client.post("/api/admin/change-password", json={**body, "code": "000000"}, headers=headers)
    assert wrong.get_json() == {"error": "invalid_code"}
    assert password_login(client).status_code == 200  # senha antiga segue valendo

    ok = client.post(
        "/api/admin/change-password",
        json={**body, "code": code_at(mfa_admin["secret"], 1)},
        headers=headers,
    )
    assert ok.status_code == 200


def test_sensitive_action_failures_share_the_mfa_quota(client, mfa_admin):
    headers = auth_headers(mfa_admin["token"])
    # 5 erros em /users e 5 em /mfa/disable estouram o MESMO limite de 10.
    for _ in range(5):
        assert _create(client, mfa_admin, code="000000").status_code == 400
    for _ in range(5):
        r = client.post(
            "/api/admin/mfa/disable",
            json={"current_password": ADMIN_PASSWORD, "code": "000000"},
            headers=headers,
        )
        assert r.status_code == 400

    blocked = _create(client, mfa_admin, code=code_at(mfa_admin["secret"], 1))
    assert blocked.status_code == 429


def test_validation_errors_do_not_consume_the_mfa_quota(client, mfa_admin):
    # e-mail inválido é 400 mas não é palpite de código: 12 vezes não trava.
    for _ in range(12):
        r = client.post(
            "/api/admin/users",
            json={"current_password": "errada", "email": "x"},
            headers=auth_headers(mfa_admin["token"]),
        )
        assert r.status_code == 400
        assert r.get_json() == {"error": "invalid_current_password"}


def test_admin_without_mfa_is_unchanged(client, admin, admin_token):
    resp = client.post(
        "/api/admin/users",
        json={"current_password": ADMIN_PASSWORD, **NEW_ADMIN},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 201


# ------------------------------------------------ sessões e concorrência --

def test_enable_disable_regenerate_rotate_session(client, admin, admin_token):
    secret = setup_mfa(client, admin_token)["secret"]
    enabled = client.post(
        "/api/admin/mfa/enable", json={"code": code_at(secret)}, headers=auth_headers(admin_token)
    ).get_json()
    assert enabled["expires_in"] == auth_module.TOKEN_MAX_AGE_SECONDS == 14400
    assert client.get("/api/admin/me", headers=auth_headers(admin_token)).status_code == 401
    t1 = enabled["token"]
    assert client.get("/api/admin/me", headers=auth_headers(t1)).status_code == 200

    regen = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(secret, 1)},
        headers=auth_headers(t1),
    ).get_json()
    assert client.get("/api/admin/me", headers=auth_headers(t1)).status_code == 401
    assert regen["expires_in"] == 14400 and len(regen["recovery_codes"]) == 10
    t2 = regen["token"]
    assert client.get("/api/admin/me", headers=auth_headers(t2)).status_code == 200

    disabled = client.post(
        "/api/admin/mfa/disable",
        json={"current_password": ADMIN_PASSWORD, "recovery_code": regen["recovery_codes"][0]},
        headers=auth_headers(t2),
    ).get_json()
    assert disabled["ok"] is True and disabled["expires_in"] == 14400
    assert client.get("/api/admin/me", headers=auth_headers(t2)).status_code == 401
    assert client.get("/api/admin/me", headers=auth_headers(disabled["token"])).status_code == 200


def test_enable_invalidates_pending_mfa_tokens(client, admin, mfa_admin):
    pending = password_login(client).get_json()["mfa_token"]
    # regenerar sobe tv: o mfa_token pendente cai.
    client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(mfa_admin["secret"], 1)},
        headers=auth_headers(mfa_admin["token"]),
    )
    resp = client.post(
        "/api/admin/login/mfa", json={"mfa_token": pending, "recovery_code": mfa_admin["recovery"][5]}
    )
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_enable_is_refused_if_secret_changed_after_validation(client, admin, admin_token):
    secret = setup_mfa(client, admin_token)["secret"]
    raw, _ = mfa_module.pending_secret(admin.id)
    setup_mfa(client, admin_token)  # setup concorrente troca o segredo

    claimed = mfa_module.claim_step(
        admin.id,
        mfa_module.matching_step(secret, code_at(secret)),
        extra_where=(
            AdminUser.totp_enabled.is_(False),
            type_coerce(AdminUser.totp_secret_enc, Text) == raw,
        ),
        totp_enabled=True,
    )

    assert claimed is False
    assert db.session.get(AdminUser, admin.id).totp_enabled is False


def test_setup_cannot_overwrite_enabled_secret(client, admin, mfa_admin):
    before = db.session.get(AdminUser, admin.id).totp_secret_enc
    resp = client.post(
        "/api/admin/mfa/setup",
        json={"current_password": ADMIN_PASSWORD},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 409
    assert db.session.get(AdminUser, admin.id).totp_secret_enc == before


def test_rate_limit_bucket_ignores_stale_session_token(client, admin, mfa_admin):
    # Sessão INVÁLIDA (tv velho) não escolhe o balde da conta: 31 tentativas
    # com ela (de IPs diferentes) não estouram o teto da conta do admin real.
    stale = mfa_admin["token"]
    out = client.post("/api/admin/logout", headers=auth_headers(stale))
    assert out.status_code == 200

    for i in range(31):
        r = client.post(
            "/api/admin/mfa/disable",
            json={"current_password": ADMIN_PASSWORD, "code": "000000"},
            headers={**auth_headers(stale), "X-Forwarded-For": f"10.1.{i}.1"},
        )
        assert r.status_code == 401

    # a conta real segue com a cota intacta: login em 2 passos funciona.
    mfa_token = password_login(client).get_json()["mfa_token"]
    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "recovery_code": mfa_admin["recovery"][0]},
    )
    assert resp.status_code == 200


def test_secret_unreadable_is_audited_and_fails_closed(client, admin, mfa_admin, caplog):
    caplog.set_level(logging.DEBUG)
    db.session.execute(
        text("UPDATE admin_users SET totp_secret_enc = 'gAAAAAlixo' WHERE id = :id"),
        {"id": admin.id},
    )
    db.session.commit()

    first = password_login(client)
    assert first.get_json()["mfa_required"] is True
    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": first.get_json()["mfa_token"], "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "AUDIT mfa_secret_unreadable" in logged


def test_reset_mfa_script(app, admin, client, admin_token, capsys):
    import reset_mfa

    secret, _codes, token = enable_mfa(client, admin_token)

    assert reset_mfa.run(ADMIN_EMAIL, confirmed=False, app=app) == 0
    assert db.session.get(AdminUser, admin.id).totp_enabled is True  # sem --yes nada muda

    assert reset_mfa.run("naoexiste@example.com", confirmed=True, app=app) == 1
    assert reset_mfa.run(ADMIN_EMAIL.upper(), confirmed=True, app=app) == 0

    db.session.expire_all()
    row = db.session.execute(
        text(
            "SELECT totp_secret_enc, totp_enabled, totp_last_step, recovery_codes_hash "
            "FROM admin_users WHERE id = :id"
        ),
        {"id": admin.id},
    ).one()
    assert row[0] is None and not row[1] and row[2] is None and row[3] is None
    assert client.get("/api/admin/me", headers=auth_headers(token)).status_code == 401
    assert "token" in password_login(client).get_json()
    assert secret not in capsys.readouterr().out
