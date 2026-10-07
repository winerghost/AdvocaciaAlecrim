from werkzeug.security import check_password_hash

from app.extensions import db
from app.models import AdminUser

from conftest import ADMIN_EMAIL

NEW_EMAIL = "novo@example.com"
NEW_PASSWORD = "OutraSenhaForte123"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------- auth -----

def test_all_routes_require_auth(client, admin):
    assert client.get("/api/admin/users").status_code == 401
    assert client.post("/api/admin/users", json={}).status_code == 401
    assert client.delete(f"/api/admin/users/{admin.id}").status_code == 401


# -------------------------------------------------------------- list ------

def test_list_users_never_exposes_password_hash(client, admin, admin_token):
    resp = client.get("/api/admin/users", headers=auth(admin_token))

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert [u["email"] for u in data] == [ADMIN_EMAIL]
    assert "password_hash" not in data[0]
    assert "password" not in data[0]


# ------------------------------------------------------------- create -----

def test_create_user_and_login_with_it(client, admin, admin_token):
    resp = client.post(
        "/api/admin/users",
        json={"email": "  Novo@Example.com ", "password": NEW_PASSWORD},
        headers=auth(admin_token),
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["email"] == NEW_EMAIL
    assert "password_hash" not in body

    stored = AdminUser.query.filter_by(email=NEW_EMAIL).one()
    assert stored.password_hash != NEW_PASSWORD
    assert check_password_hash(stored.password_hash, NEW_PASSWORD)

    login = client.post("/api/admin/login", json={"email": NEW_EMAIL, "password": NEW_PASSWORD})
    assert login.status_code == 200


def test_create_user_duplicate_email_returns_409(client, admin, admin_token):
    resp = client.post(
        "/api/admin/users",
        json={"email": ADMIN_EMAIL.upper(), "password": NEW_PASSWORD},
        headers=auth(admin_token),
    )

    assert resp.status_code == 409
    assert resp.get_json() == {"error": "email_taken"}


def test_create_user_weak_password_returns_400(client, admin, admin_token):
    resp = client.post(
        "/api/admin/users",
        json={"email": NEW_EMAIL, "password": "curta"},
        headers=auth(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "weak_password"}
    assert AdminUser.query.filter_by(email=NEW_EMAIL).first() is None


def test_create_user_invalid_email_returns_400(client, admin, admin_token):
    for bad in ["sem-arroba", "a@", "", None, 123]:
        resp = client.post(
            "/api/admin/users",
            json={"email": bad, "password": NEW_PASSWORD},
            headers=auth(admin_token),
        )
        assert resp.status_code == 400, bad
        assert resp.get_json() == {"error": "invalid_email"}


def test_create_user_invalid_json_returns_400(client, admin, admin_token):
    resp = client.post(
        "/api/admin/users",
        data="não é json",
        content_type="application/json",
        headers=auth(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_json"}


# ------------------------------------------------------------- delete -----

def _create_other_user():
    from werkzeug.security import generate_password_hash

    other = AdminUser(email=NEW_EMAIL, password_hash=generate_password_hash(NEW_PASSWORD))
    db.session.add(other)
    db.session.commit()
    return other


def test_delete_other_user(client, admin, admin_token):
    other = _create_other_user()

    resp = client.delete(f"/api/admin/users/{other.id}", headers=auth(admin_token))

    assert resp.status_code == 204
    assert AdminUser.query.filter_by(email=NEW_EMAIL).first() is None


def test_cannot_delete_self(client, admin, admin_token):
    resp = client.delete(f"/api/admin/users/{admin.id}", headers=auth(admin_token))

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "cannot_delete_self"}
    assert db.session.get(AdminUser, admin.id) is not None


def test_delete_nonexistent_user_returns_404(client, admin, admin_token):
    resp = client.delete("/api/admin/users/99999", headers=auth(admin_token))

    assert resp.status_code == 404


def test_deleted_user_token_stops_working(client, admin, admin_token):
    other = _create_other_user()
    login = client.post("/api/admin/login", json={"email": NEW_EMAIL, "password": NEW_PASSWORD})
    other_token = login.get_json()["token"]
    assert client.get("/api/admin/me", headers=auth(other_token)).status_code == 200

    client.delete(f"/api/admin/users/{other.id}", headers=auth(admin_token))

    assert client.get("/api/admin/me", headers=auth(other_token)).status_code == 401
