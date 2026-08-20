from itsdangerous import SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash

from app.models import AdminUser
from app.utils import auth as auth_module

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------ login --

def test_login_with_correct_credentials_returns_valid_token(client, admin):
    resp = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["email"] == ADMIN_EMAIL
    assert body["expires_in"] == auth_module.TOKEN_MAX_AGE_SECONDS
    assert isinstance(body["token"], str) and body["token"]

    # o token devolvido é de fato aceito por rotas protegidas.
    me_resp = client.get("/api/admin/me", headers=auth_headers(body["token"]))
    assert me_resp.status_code == 200
    assert me_resp.get_json()["email"] == ADMIN_EMAIL


def test_login_with_wrong_password_returns_generic_error(client, admin):
    resp = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": "senha-errada"})

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_credentials"}


def test_login_with_nonexistent_email_returns_same_generic_error(client, admin):
    resp = client.post(
        "/api/admin/login", json={"email": "nao-existe@example.com", "password": ADMIN_PASSWORD}
    )

    assert resp.status_code == 401
    # Mesma mensagem do teste acima - nunca revela se o e-mail existe.
    assert resp.get_json() == {"error": "invalid_credentials"}


def test_login_email_is_case_insensitive(client, admin):
    resp = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD}
    )

    assert resp.status_code == 200


def test_login_rate_limit_triggers_after_5_attempts(client, admin):
    statuses = [
        client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": "errada"}).status_code
        for _ in range(6)
    ]

    assert statuses.count(401) == 5
    assert statuses[-1] == 429


# -------------------------------------------------------------------- me --

def test_me_without_token_returns_401(client):
    resp = client.get("/api/admin/me")

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "unauthorized"}


def test_me_with_invalid_token_returns_401(client):
    resp = client.get("/api/admin/me", headers=auth_headers("token-invalido"))

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "unauthorized"}


def test_me_with_valid_token_returns_email(client, admin, admin_token):
    resp = client.get("/api/admin/me", headers=auth_headers(admin_token))

    assert resp.status_code == 200
    assert resp.get_json() == {"email": ADMIN_EMAIL}


def test_expired_token_is_rejected(app, admin, admin_token, monkeypatch):
    # Simula expiração sem depender de wall-clock sleep: força o
    # serializer a levantar SignatureExpired, exatamente o que
    # itsdangerous levanta quando `max_age` estourou de verdade.
    def _raise_expired(self, *args, **kwargs):
        raise SignatureExpired("expirado")

    monkeypatch.setattr(URLSafeTimedSerializer, "loads", _raise_expired)

    assert auth_module.verify_token(admin_token) is None


def test_token_for_deleted_admin_is_rejected(app, admin, admin_token):
    AdminUser.query.filter_by(id=admin.id).delete()
    from app.extensions import db

    db.session.commit()

    assert auth_module.verify_token(admin_token) is None


# --------------------------------------------------------- change-password --

def test_change_password_success_updates_hash(client, admin, admin_token):
    old_hash = admin.password_hash

    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "novaSenhaForte123"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}

    from app.extensions import db

    refreshed = db.session.get(AdminUser, admin.id)
    assert refreshed.password_hash != old_hash
    assert check_password_hash(refreshed.password_hash, "novaSenhaForte123")

    # o token antigo continua válido (não é sessão) mas a senha antiga não
    # funciona mais para um novo login.
    login_resp = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert login_resp.status_code == 401


def test_change_password_wrong_current_password_fails(client, admin, admin_token):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": "senha-errada", "new_password": "novaSenhaForte123"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_current_password"}


def test_change_password_weak_new_password_fails(client, admin, admin_token):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "curta"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "weak_password"}


def test_change_password_requires_auth(client):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "novaSenhaForte123"},
    )

    assert resp.status_code == 401
