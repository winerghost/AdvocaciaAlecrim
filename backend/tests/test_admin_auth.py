import pytest
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


def _login_from(client, ip, email, password="errada"):
    # Cada chamada vem de um "IP" diferente (ProxyFix lê X-Forwarded-For),
    # então o limite por IP nunca dispara - sobra só o limite por conta.
    return client.post(
        "/api/admin/login",
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": ip},
    )


def test_login_account_limit_survives_ip_rotation(client, admin):
    statuses = [
        _login_from(client, f"198.51.100.{i}", ADMIN_EMAIL).status_code for i in range(11)
    ]

    assert statuses == [401] * 10 + [429]

    # Estourada a cota da conta, nem a senha certa entra (de mais um IP novo).
    blocked = _login_from(client, "203.0.113.7", ADMIN_EMAIL, ADMIN_PASSWORD)
    assert blocked.status_code == 429

    # Outra conta não é afetada.
    other = _login_from(client, "203.0.113.8", "outra@example.com")
    assert other.status_code == 401


def test_login_account_limit_normalizes_email(client, admin):
    variants = [ADMIN_EMAIL, ADMIN_EMAIL.upper(), f"  {ADMIN_EMAIL}  ", ADMIN_EMAIL.title()]
    for i in range(10):
        resp = _login_from(client, f"198.51.100.{i}", variants[i % len(variants)])
        assert resp.status_code == 401

    # Maiúsculas/espaços caem no mesmo balde da conta.
    assert _login_from(client, "203.0.113.7", f" {ADMIN_EMAIL.upper()} ").status_code == 429


def test_login_account_limit_is_the_same_for_unknown_email(client, admin):
    # Mesma contagem e mesma resposta de uma conta que existe: o 429 não
    # serve para descobrir quais e-mails estão cadastrados.
    statuses = [
        _login_from(client, f"198.51.100.{i}", "nao-existe@example.com").status_code
        for i in range(11)
    ]

    assert statuses == [401] * 10 + [429]


def test_login_account_limit_only_counts_failures(client, admin):
    statuses = [
        _login_from(client, f"198.51.100.{i}", ADMIN_EMAIL, ADMIN_PASSWORD).status_code
        for i in range(12)
    ]

    assert statuses == [200] * 12


def test_login_account_limit_does_not_leak_between_tests(client, admin):
    # Roda depois dos testes acima, que estouram a cota de ADMIN_EMAIL: se o
    # `limiter.reset()` do conftest não limpasse o balde por conta, isto
    # daria 429.
    assert _login_from(client, "198.51.100.1", ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"password": "errada"},
        {"email": None, "password": "errada"},
        {"email": 12345, "password": "errada"},
        {"email": ["a@b.co"], "password": "errada"},
        {"email": {"$ne": ""}, "password": "errada"},
        {"email": "", "password": "errada"},
        {"email": "   ", "password": "errada"},
        {"email": "a" * 100_000 + "@b.co", "password": "errada"},
    ],
)
def test_login_with_unusable_email_is_handled_by_the_limiter_key(client, admin, payload):
    # Sem e-mail utilizável a chave do limite por conta cai num balde por
    # IP - nunca uma exceção (500), sempre o mesmo 401 genérico.
    resp = client.post("/api/admin/login", json=payload)

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_credentials"}


def test_login_with_non_object_body_still_returns_400(client, admin):
    for body in ("[1, 2, 3]", '"texto"', "{quebrado", ""):
        resp = client.post("/api/admin/login", data=body, content_type="application/json")

        assert resp.status_code == 400
        assert resp.get_json() == {"error": "invalid_json"}


def test_login_unusable_email_bucket_is_per_ip_not_global(client, admin):
    # Request sem e-mail de um IP não gasta a cota de outro IP.
    for i in range(12):
        resp = client.post(
            "/api/admin/login",
            json={"email": None, "password": "x"},
            headers={"X-Forwarded-For": f"198.51.100.{i}"},
        )
        assert resp.status_code == 401


def test_login_account_key_is_bounded_and_hides_the_email(app):
    from app.api.admin_auth import _login_account_key

    with app.test_request_context(
        "/api/admin/login", method="POST", json={"email": f"  {ADMIN_EMAIL.upper()} "}
    ):
        key = _login_account_key()
    with app.test_request_context("/api/admin/login", method="POST", json={"email": ADMIN_EMAIL}):
        assert _login_account_key() == key

    assert key.startswith("login-conta:")
    assert len(key) == len("login-conta:") + 64
    assert "admin" not in key and "@" not in key


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

    # a senha antiga não funciona mais para um novo login.
    login_resp = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert login_resp.status_code == 401

    # o token antigo é invalidado assim que a senha muda (fingerprint do
    # hash embutido no token deixa de bater - ver utils/auth.py) - mitiga
    # um token vazado continuar válido até expirar sozinho.
    stale_resp = client.get("/api/admin/me", headers=auth_headers(admin_token))
    assert stale_resp.status_code == 401

    # um novo login com a senha nova emite um token novo, que funciona.
    new_login_resp = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": "novaSenhaForte123"}
    )
    assert new_login_resp.status_code == 200
    new_token = new_login_resp.get_json()["token"]
    fresh_resp = client.get("/api/admin/me", headers=auth_headers(new_token))
    assert fresh_resp.status_code == 200


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


def test_change_password_blank_new_password_fails(client, admin, admin_token):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": " " * 12},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "weak_password"}

    # A senha antiga continua valendo.
    login = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200


@pytest.mark.parametrize(
    "new_password",
    [
        "Xk9#mPq2vLz",  # 11 caracteres - o mínimo agora é 12
        "aaaaaaaaaaaa",
        "abababababab",
        "123456789012",
        "qwertyuiopas",
        "Advocacia2026",
        "Senha@123456",
        f"{ADMIN_EMAIL}",
        "Admin-Xk9#mPq2",  # contém a parte local do e-mail da conta
        None,
        123456789012,
    ],
)
def test_change_password_rejects_passwords_outside_the_policy(
    client, admin, admin_token, new_password
):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": new_password},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "weak_password"}

    # A senha antiga continua valendo.
    login = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200


def test_change_password_too_long_keeps_its_own_error_code(client, admin, admin_token):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "x1Y2z3" * 30},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "password_too_long"}


def test_change_password_accepts_exactly_12_characters(client, admin, admin_token):
    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "Xk9#mPq2vLzT"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200


# ----------------------------------------------------------------- logout --

def test_logout_requires_auth(client):
    assert client.post("/api/admin/logout").status_code == 401
    assert client.post("/api/admin/logout", headers=auth_headers("lixo")).status_code == 401


def test_logout_invalidates_the_token(client, admin, admin_token):
    assert client.get("/api/admin/me", headers=auth_headers(admin_token)).status_code == 200

    resp = client.post("/api/admin/logout", headers=auth_headers(admin_token))

    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}

    # o token copiado antes do logout não serve para mais nada.
    me_resp = client.get("/api/admin/me", headers=auth_headers(admin_token))
    assert me_resp.status_code == 401
    assert me_resp.get_json() == {"error": "unauthorized"}
    assert auth_module.verify_token(admin_token) is None
    # nem para sair de novo.
    assert client.post("/api/admin/logout", headers=auth_headers(admin_token)).status_code == 401


def test_logout_invalidates_every_token_of_that_admin(client, admin):
    tokens = [
        client.post(
            "/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        ).get_json()["token"]
        for _ in range(2)
    ]

    client.post("/api/admin/logout", headers=auth_headers(tokens[0]))

    for token in tokens:
        assert client.get("/api/admin/me", headers=auth_headers(token)).status_code == 401


def test_logout_does_not_affect_another_admin(client, admin, admin_token):
    from werkzeug.security import generate_password_hash

    from app.extensions import db

    other = AdminUser(
        email="outra@example.com", password_hash=generate_password_hash("OutraSenhaForte123")
    )
    db.session.add(other)
    db.session.commit()
    other_token = auth_module.issue_token(other)

    client.post("/api/admin/logout", headers=auth_headers(admin_token))

    other_resp = client.get("/api/admin/me", headers=auth_headers(other_token))
    assert other_resp.status_code == 200
    assert other_resp.get_json() == {"email": "outra@example.com"}
    assert db.session.get(AdminUser, other.id).token_version == 0


def test_login_after_logout_issues_a_working_token(client, admin, admin_token):
    client.post("/api/admin/logout", headers=auth_headers(admin_token))

    login = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200
    new_token = login.get_json()["token"]

    assert new_token != admin_token
    assert client.get("/api/admin/me", headers=auth_headers(new_token)).status_code == 200
    # o antigo continua morto.
    assert client.get("/api/admin/me", headers=auth_headers(admin_token)).status_code == 401


@pytest.mark.parametrize("tv", ["ausente", None, "0", 0.0, False, 1, -1])
def test_token_without_matching_version_is_rejected(app, admin, tv):
    # "ausente" = formato antigo, emitido antes de existir `tv`: recusado
    # de propósito (todo mundo faz login de novo uma vez depois do deploy).
    payload = {"admin_id": admin.id, "pv": auth_module._password_fingerprint(admin)}
    if tv != "ausente":
        payload["tv"] = tv
    token = auth_module._serializer().dumps(payload)

    assert auth_module.verify_token(token) is None

    # controle: o mesmo payload com a versão certa é aceito.
    payload["tv"] = admin.token_version
    assert auth_module.verify_token(auth_module._serializer().dumps(payload)) is not None


def test_password_change_after_logout_still_invalidates_and_relogin_works(client, admin, admin_token):
    client.post("/api/admin/logout", headers=auth_headers(admin_token))
    token = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    ).get_json()["token"]

    resp = client.post(
        "/api/admin/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "novaSenhaForte123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200

    # as duas invalidações (senha e versão) são independentes e somam.
    assert client.get("/api/admin/me", headers=auth_headers(token)).status_code == 401
    relogin = client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": "novaSenhaForte123"}
    )
    assert relogin.status_code == 200
    fresh = relogin.get_json()["token"]
    assert client.get("/api/admin/me", headers=auth_headers(fresh)).status_code == 200
