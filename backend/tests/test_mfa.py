"""MFA (TOTP) do painel admin: login em 2 passos, gestão e segurança."""

import json
import logging
import time

import pyotp
import pytest
from sqlalchemy import text

from app.extensions import db
from app.models import AdminUser
from app.utils import auth as auth_module
from app.utils import mfa as mfa_module

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def code_at(secret, offset=0):
    """Código TOTP do passo atual + `offset` (offset 1 = próximo código)."""
    return pyotp.TOTP(secret).at(time.time() + 30 * offset)


def password_login(client, email=ADMIN_EMAIL, password=ADMIN_PASSWORD):
    return client.post("/api/admin/login", json={"email": email, "password": password})


def setup_mfa(client, token):
    resp = client.post(
        "/api/admin/mfa/setup",
        json={"current_password": ADMIN_PASSWORD},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def enable_mfa(client, token):
    """Setup + enable. Devolve (segredo, códigos, token de sessão novo). O
    enable consome o passo atual e derruba a sessão antiga; os logins
    seguintes usam offset >= 1."""
    secret = setup_mfa(client, token)["secret"]
    resp = client.post(
        "/api/admin/mfa/enable",
        json={"code": code_at(secret)},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    return secret, body["recovery_codes"], body["token"]


@pytest.fixture
def mfa_admin(client, admin, admin_token):
    secret, recovery, token = enable_mfa(client, admin_token)
    return {"secret": secret, "recovery": recovery, "token": token}


def mfa_token_for(client):
    resp = password_login(client)
    assert resp.status_code == 200
    return resp.get_json()["mfa_token"]


# ------------------------------------------------------------------ setup --

def test_setup_returns_secret_and_uri_and_keeps_mfa_disabled(client, admin, admin_token):
    body = setup_mfa(client, admin_token)

    assert len(body["secret"]) >= 16
    assert body["otpauth_uri"].startswith("otpauth://totp/Advocacia%20Alecrim:")
    assert f"secret={body['secret']}" in body["otpauth_uri"]
    assert "issuer=Advocacia%20Alecrim" in body["otpauth_uri"]
    assert db.session.get(AdminUser, admin.id).totp_enabled is False

    # sem MFA ativo o login continua o de sempre.
    assert "token" in password_login(client).get_json()


def test_setup_requires_session(client, admin):
    assert client.post("/api/admin/mfa/setup", json={}).status_code == 401


def test_setup_with_wrong_password_is_rejected(client, admin, admin_token):
    resp = client.post(
        "/api/admin/mfa/setup",
        json={"current_password": "senha-errada"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_current_password"}
    assert db.session.get(AdminUser, admin.id).totp_secret_enc is None


def test_setup_when_already_enabled_returns_409(client, mfa_admin):
    resp = client.post(
        "/api/admin/mfa/setup",
        json={"current_password": ADMIN_PASSWORD},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 409
    assert resp.get_json() == {"error": "mfa_already_enabled"}


def test_enable_without_setup_is_rejected(client, admin, admin_token):
    resp = client.post(
        "/api/admin/mfa/enable", json={"code": "123456"}, headers=auth_headers(admin_token)
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "mfa_not_setup"}


def test_enable_with_wrong_code_keeps_mfa_off(client, admin, admin_token):
    secret = setup_mfa(client, admin_token)["secret"]
    wrong = "000000" if code_at(secret) != "000000" else "111111"

    resp = client.post(
        "/api/admin/mfa/enable", json={"code": wrong}, headers=auth_headers(admin_token)
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_code"}
    assert db.session.get(AdminUser, admin.id).totp_enabled is False


def test_enable_returns_ten_recovery_codes_in_expected_format(mfa_admin):
    codes = mfa_admin["recovery"]

    assert len(codes) == 10
    assert len(set(codes)) == 10
    for code in codes:
        assert len(code) == 9 and code[4] == "-"
        assert not set(code) & set("01ilo")


def test_me_reports_mfa_state(client, admin, mfa_admin):
    resp = client.get("/api/admin/me", headers=auth_headers(mfa_admin["token"]))

    body = resp.get_json()
    assert body["email"] == ADMIN_EMAIL
    assert body["mfa_enabled"] is True
    assert body["recovery_codes_remaining"] == 10


# ----------------------------------------------------------------- login --

def test_full_flow_login_in_two_steps(client, mfa_admin):
    first = password_login(client)

    assert first.status_code == 200
    body = first.get_json()
    assert body["mfa_required"] is True
    assert body["expires_in"] == 300
    assert "token" not in body
    assert first.headers["Cache-Control"] == "no-store"

    second = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": body["mfa_token"], "code": code_at(mfa_admin["secret"], 1)},
    )

    assert second.status_code == 200
    session = second.get_json()
    assert session["email"] == ADMIN_EMAIL
    assert session["expires_in"] == auth_module.TOKEN_MAX_AGE_SECONDS
    assert second.headers["Cache-Control"] == "no-store"
    me = client.get("/api/admin/me", headers=auth_headers(session["token"]))
    assert me.status_code == 200


def test_password_wrong_with_mfa_looks_like_any_failure(client, mfa_admin):
    resp = password_login(client, password="senha-errada")

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_credentials"}


def test_mfa_token_is_not_a_session_token(client, mfa_admin):
    mfa_token = mfa_token_for(client)

    resp = client.get("/api/admin/me", headers=auth_headers(mfa_token))

    assert resp.status_code == 401


def test_session_token_is_not_an_mfa_token(client, mfa_admin):
    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_admin["token"], "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_wrong_code_is_rejected(client, mfa_admin):
    mfa_token = mfa_token_for(client)
    wrong = "000000" if code_at(mfa_admin["secret"], 1) != "000000" else "111111"

    resp = client.post("/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": wrong})

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_code"}


@pytest.mark.parametrize("code", [None, 123456, "", "abc", "12345", "1234567", ["123456"], {}])
def test_malformed_code_is_rejected(client, mfa_admin, code):
    mfa_token = mfa_token_for(client)

    resp = client.post("/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": code})

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_code"}


def test_replayed_code_is_rejected(client, mfa_admin):
    secret = mfa_admin["secret"]
    code = code_at(secret, 1)
    token_a = mfa_token_for(client)
    assert (
        client.post("/api/admin/login/mfa", json={"mfa_token": token_a, "code": code}).status_code
        == 200
    )

    token_b = mfa_token_for(client)
    replay = client.post("/api/admin/login/mfa", json={"mfa_token": token_b, "code": code})

    assert replay.status_code == 401
    assert replay.get_json() == {"error": "invalid_code"}


def test_code_used_to_enable_cannot_be_replayed_at_login(client, admin, mfa_admin):
    # O código do passo que o enable consumiu. Calculado a partir do passo
    # REALMENTE gravado, não do relógio de agora: se a virada de 30 s caísse
    # entre o enable e este login, `code_at(..., 0)` já seria o passo
    # seguinte (válido) e o teste falharia sem haver replay nenhum.
    consumed_step = db.session.get(AdminUser, admin.id).totp_last_step
    replayed = pyotp.TOTP(mfa_admin["secret"]).generate_otp(consumed_step)
    mfa_token = mfa_token_for(client)

    resp = client.post(
        "/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": replayed}
    )

    assert resp.status_code == 401


def test_claim_step_is_atomic_and_monotonic(app, admin):
    assert mfa_module.claim_step(admin.id, 1000) is True
    assert mfa_module.claim_step(admin.id, 1000) is False
    assert mfa_module.claim_step(admin.id, 999) is False
    assert mfa_module.claim_step(admin.id, 1001) is True


def test_code_with_spaces_is_accepted(client, mfa_admin):
    mfa_token = mfa_token_for(client)
    code = code_at(mfa_admin["secret"], 1)

    resp = client.post(
        "/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": f"{code[:3]} {code[3:]}"}
    )

    assert resp.status_code == 200


@pytest.mark.parametrize("token", [None, "", "lixo", 123, {"a": 1}, "a" * 5000])
def test_invalid_mfa_token_is_rejected(client, mfa_admin, token):
    resp = client.post(
        "/api/admin/login/mfa", json={"mfa_token": token, "code": code_at(mfa_admin["secret"], 1)}
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_mfa_token_signed_with_other_key_is_rejected(app, client, mfa_admin, admin):
    from itsdangerous import URLSafeTimedSerializer

    forged = URLSafeTimedSerializer("outra-chave", salt="admin-mfa").dumps(
        {
            "admin_id": admin.id,
            "pv": auth_module._password_fingerprint(admin),
            "tv": admin.token_version,
            "purpose": "mfa",
        }
    )

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": forged, "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_expired_mfa_token_is_rejected(client, mfa_admin, monkeypatch):
    mfa_token = mfa_token_for(client)
    monkeypatch.setattr(auth_module, "MFA_TOKEN_MAX_AGE_SECONDS", -1)

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_password_change_invalidates_pending_mfa_token_but_keeps_mfa(client, admin, mfa_admin):
    mfa_token = mfa_token_for(client)
    change = client.post(
        "/api/admin/change-password",
        json={
            "current_password": ADMIN_PASSWORD,
            "new_password": "NovaSenhaMuitoForte789Zq",
            "code": code_at(mfa_admin["secret"], 1),
        },
        headers=auth_headers(mfa_admin["token"]),
    )
    assert change.status_code == 200

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}
    assert db.session.get(AdminUser, admin.id).totp_enabled is True
    # e o MFA continua exigido com a senha nova.
    again = password_login(client, password="NovaSenhaMuitoForte789Zq")
    assert again.get_json()["mfa_required"] is True


def test_logout_invalidates_pending_mfa_token(client, mfa_admin):
    mfa_token = mfa_token_for(client)
    out = client.post("/api/admin/logout", headers=auth_headers(mfa_admin["token"]))
    assert out.status_code == 200

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "code": code_at(mfa_admin["secret"], 1)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


def test_mfa_token_dies_if_mfa_is_disabled_meanwhile(client, mfa_admin):
    mfa_token = mfa_token_for(client)
    disable = client.post(
        "/api/admin/mfa/disable",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(mfa_admin["secret"], 1)},
        headers=auth_headers(mfa_admin["token"]),
    )
    assert disable.status_code == 200

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "code": code_at(mfa_admin["secret"], 2)},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_mfa_token"}


# -------------------------------------------------------- recovery codes --

def test_recovery_code_logs_in_once(client, admin, mfa_admin):
    code = mfa_admin["recovery"][0]

    first = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": code},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": code},
    )
    assert second.status_code == 401
    assert second.get_json() == {"error": "invalid_code"}

    me = client.get("/api/admin/me", headers=auth_headers(first.get_json()["token"]))
    assert me.get_json()["recovery_codes_remaining"] == 9


def test_recovery_code_input_is_normalized(client, mfa_admin):
    code = mfa_admin["recovery"][1]

    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": f"  {code.upper()} "},
    )

    assert resp.status_code == 200


def test_wrong_recovery_code_is_rejected(client, mfa_admin):
    resp = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": "aaaa-bbbb"},
    )

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_code"}


def test_recovery_codes_are_stored_only_as_hashes(client, admin, mfa_admin):
    stored = db.session.get(AdminUser, admin.id).recovery_codes_hash
    hashes = json.loads(stored)

    assert len(hashes) == 10
    for code in mfa_admin["recovery"]:
        assert code not in stored
    assert all(h.startswith(("scrypt:", "pbkdf2:")) for h in hashes)


def test_regenerate_requires_password_and_code_and_invalidates_old(client, mfa_admin):
    headers = auth_headers(mfa_admin["token"])
    secret = mfa_admin["secret"]

    no_pw = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": "errada", "code": code_at(secret, 1)},
        headers=headers,
    )
    assert no_pw.status_code == 400
    assert no_pw.get_json() == {"error": "invalid_current_password"}

    bad_code = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": "abcdef"},
        headers=headers,
    )
    assert bad_code.status_code == 400
    assert bad_code.get_json() == {"error": "invalid_code"}

    ok = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(secret, 1)},
        headers=headers,
    )
    assert ok.status_code == 200
    new_codes = ok.get_json()["recovery_codes"]
    assert len(new_codes) == 10
    assert not set(new_codes) & set(mfa_admin["recovery"])

    old = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": mfa_admin["recovery"][0]},
    )
    assert old.status_code == 401
    new = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": new_codes[0]},
    )
    assert new.status_code == 200


def test_regenerate_accepts_a_recovery_code_as_second_factor(client, mfa_admin):
    resp = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": mfa_admin["recovery"][0]},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 200


def test_regenerate_without_mfa_is_rejected(client, admin, admin_token):
    resp = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": "123456"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "mfa_not_enabled"}


# --------------------------------------------------------------- disable --

def test_disable_requires_password_and_code(client, admin, mfa_admin):
    headers = auth_headers(mfa_admin["token"])
    secret = mfa_admin["secret"]

    wrong_pw = client.post(
        "/api/admin/mfa/disable",
        json={"current_password": "errada", "code": code_at(secret, 1)},
        headers=headers,
    )
    assert wrong_pw.status_code == 400
    assert wrong_pw.get_json() == {"error": "invalid_current_password"}

    missing_code = client.post(
        "/api/admin/mfa/disable", json={"current_password": ADMIN_PASSWORD}, headers=headers
    )
    assert missing_code.status_code == 400
    assert missing_code.get_json() == {"error": "invalid_code"}
    assert db.session.get(AdminUser, admin.id).totp_enabled is True


def test_disable_wipes_secret_and_codes_and_restores_plain_login(client, admin, mfa_admin):
    resp = client.post(
        "/api/admin/mfa/disable",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(mfa_admin["secret"], 1)},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 200
    row = db.session.execute(
        text(
            "SELECT totp_secret_enc, totp_enabled, totp_last_step, recovery_codes_hash "
            "FROM admin_users WHERE id = :id"
        ),
        {"id": admin.id},
    ).one()
    assert row[0] is None and not row[1] and row[2] is None and row[3] is None
    assert "token" in password_login(client).get_json()
    me = client.get("/api/admin/me", headers=auth_headers(resp.get_json()["token"]))
    assert me.get_json()["mfa_enabled"] is False


def test_disable_with_recovery_code(client, mfa_admin):
    resp = client.post(
        "/api/admin/mfa/disable",
        json={"current_password": ADMIN_PASSWORD, "recovery_code": mfa_admin["recovery"][2]},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 200


def test_mfa_endpoints_require_a_session(client, mfa_admin):
    for path in ("setup", "enable", "disable", "recovery-codes"):
        resp = client.post(f"/api/admin/mfa/{path}", json={})
        assert resp.status_code == 401, path
        assert resp.headers["Cache-Control"] == "no-store"


# ------------------------------------------------------------ rate limit --

def test_login_mfa_rate_limit_per_ip(client, mfa_admin):
    mfa_token = mfa_token_for(client)
    statuses = [
        client.post(
            "/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": "000000"}
        ).status_code
        for _ in range(11)
    ]

    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_login_mfa_account_ceiling_survives_ip_rotation(client, mfa_admin):
    mfa_token = mfa_token_for(client)

    def attempt(ip):
        return client.post(
            "/api/admin/login/mfa",
            json={"mfa_token": mfa_token, "code": "000000"},
            headers={"X-Forwarded-For": ip},
        ).status_code

    # cada IP erra poucas vezes (não estoura IP nem conta+IP), mas a conta sim.
    statuses = [attempt(f"10.0.{i // 5}.{i % 5}") for i in range(31)]

    assert statuses[:30] == [401] * 30
    assert statuses[30] == 429
    # com a cota estourada, nem o código certo passa (de qualquer IP).
    good = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token, "code": code_at(mfa_admin["secret"], 1)},
        headers={"X-Forwarded-For": "10.9.9.9"},
    )
    assert good.status_code == 429


def test_successful_logins_do_not_consume_the_failure_quota(client, mfa_admin):
    secret = mfa_admin["secret"]
    # 2 sucessos seguidos (passos diferentes) e depois falhas ainda cabem.
    ok = client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "code": code_at(secret, 1)},
    )
    assert ok.status_code == 200
    statuses = [
        client.post(
            "/api/admin/login/mfa",
            json={"mfa_token": mfa_token_for(client), "code": "000000"},
        ).status_code
        for _ in range(3)
    ]
    assert statuses == [401, 401, 401]


def test_management_endpoints_share_the_failure_quota(client, mfa_admin):
    headers = auth_headers(mfa_admin["token"])
    statuses = [
        client.post(
            "/api/admin/mfa/disable",
            json={"current_password": ADMIN_PASSWORD, "code": "000000"},
            headers=headers,
        ).status_code
        for _ in range(11)
    ]

    assert statuses[:10] == [400] * 10
    assert statuses[10] == 429


def test_setup_wrong_password_is_rate_limited(client, admin, admin_token):
    statuses = [
        client.post(
            "/api/admin/mfa/setup",
            json={"current_password": "errada"},
            headers=auth_headers(admin_token),
        ).status_code
        for _ in range(11)
    ]

    assert statuses[10] == 429


# ------------------------------------------------------------- segredos --

def test_secret_is_never_plaintext_in_database(client, admin, mfa_admin):
    raw = db.session.execute(
        text("SELECT totp_secret_enc FROM admin_users WHERE id = :id"), {"id": admin.id}
    ).scalar_one()

    assert raw and mfa_admin["secret"] not in raw
    assert raw.startswith("gAAAAA")  # token Fernet
    # e o ORM decifra de volta.
    assert db.session.get(AdminUser, admin.id).totp_secret_enc == mfa_admin["secret"]


def test_secret_is_not_returned_after_setup(client, admin, mfa_admin):
    me = client.get("/api/admin/me", headers=auth_headers(mfa_admin["token"]))
    login = password_login(client)

    for body in (me.get_data(as_text=True), login.get_data(as_text=True)):
        assert mfa_admin["secret"] not in body
    assert "totp" not in me.get_data(as_text=True)


def test_logs_do_not_contain_secrets_codes_or_tokens(client, admin, admin_token, caplog):
    caplog.set_level(logging.DEBUG)
    secret = setup_mfa(client, admin_token)["secret"]
    enable_code = code_at(secret)
    enabled = client.post(
        "/api/admin/mfa/enable", json={"code": enable_code}, headers=auth_headers(admin_token)
    )
    recovery = enabled.get_json()["recovery_codes"]
    mfa_token = mfa_token_for(client)
    wrong = "000000" if code_at(secret, 1) != "000000" else "111111"
    client.post("/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": wrong})
    login_code = code_at(secret, 1)
    ok = client.post("/api/admin/login/mfa", json={"mfa_token": mfa_token, "code": login_code})
    session_token = ok.get_json()["token"]
    client.post(
        "/api/admin/login/mfa",
        json={"mfa_token": mfa_token_for(client), "recovery_code": recovery[0]},
    )

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "AUDIT mfa_setup_started" in logged
    assert "AUDIT mfa_enabled" in logged
    assert "AUDIT mfa_login_failed" in logged
    assert "AUDIT mfa_login_success" in logged
    assert "AUDIT mfa_recovery_code_used" in logged
    for secret_value in [secret, enable_code, login_code, mfa_token, session_token, *recovery]:
        assert secret_value not in logged


def test_disable_and_regenerate_are_audited(client, mfa_admin, caplog):
    caplog.set_level(logging.DEBUG)
    headers = auth_headers(mfa_admin["token"])
    secret = mfa_admin["secret"]
    regenerated = client.post(
        "/api/admin/mfa/recovery-codes",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(secret, 1)},
        headers=headers,
    )
    client.post(
        "/api/admin/mfa/disable",
        json={
            "current_password": ADMIN_PASSWORD,
            "recovery_code": regenerated.get_json()["recovery_codes"][0],
        },
        headers=auth_headers(regenerated.get_json()["token"]),
    )

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "AUDIT mfa_recovery_codes_regenerated" in logged
    assert "AUDIT mfa_disabled" in logged


# ----------------------------------------------------------- outros --

def test_new_admin_created_by_admin_users_starts_without_mfa(client, admin, mfa_admin):
    created = client.post(
        "/api/admin/users",
        json={
            "current_password": ADMIN_PASSWORD,
            "email": "outro@example.com",
            "password": "OutraSenhaForte456Xyz",
            "code": code_at(mfa_admin["secret"], 1),
        },
        headers=auth_headers(mfa_admin["token"]),
    )
    assert created.status_code == 201, created.get_json()

    other = AdminUser.query.filter_by(email="outro@example.com").one()
    assert other.totp_enabled is False and other.totp_secret_enc is None
    login = password_login(client, "outro@example.com", "OutraSenhaForte456Xyz")
    assert "token" in login.get_json()


def test_deleting_an_admin_with_mfa_still_works(client, admin, mfa_admin):
    from werkzeug.security import generate_password_hash

    other = AdminUser(email="x@example.com", password_hash=generate_password_hash("Abc12345678901Xy"))
    db.session.add(other)
    db.session.commit()
    other.totp_secret_enc = pyotp.random_base32()
    other.totp_enabled = True
    db.session.commit()

    resp = client.delete(
        f"/api/admin/users/{other.id}",
        json={"current_password": ADMIN_PASSWORD, "code": code_at(mfa_admin["secret"], 1)},
        headers=auth_headers(mfa_admin["token"]),
    )

    assert resp.status_code == 204


def test_mfa_is_per_account(client, admin, mfa_admin):
    from werkzeug.security import generate_password_hash

    other = AdminUser(email="y@example.com", password_hash=generate_password_hash("Abc12345678901Xy"))
    db.session.add(other)
    db.session.commit()

    resp = password_login(client, "y@example.com", "Abc12345678901Xy")

    assert "token" in resp.get_json() and "mfa_required" not in resp.get_json()
