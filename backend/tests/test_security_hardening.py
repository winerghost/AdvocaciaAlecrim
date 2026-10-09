import ssl

import pytest

from app import create_app
from app.models import Lead
from app.services import email as email_service

from conftest import TestConfig

# Formato de `secrets.token_hex(32)`: o tipo de chave que NUNCA pode ser
# recusada pelas checagens de boot.
STRONG_KEY = "9f2c4b7a1d3e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e"

PLACEHOLDER_DB_URLS = [
    "postgresql+psycopg2://alecrim:troque-por-uma-senha-forte@db:5432/alecrim",
    "postgresql+psycopg2://alecrim:troque-a-senha@db:5432/alecrim",
]
REAL_LOOKING_DB_URL = "postgresql+psycopg2://alecrim:Zk3vQ8mTn2LpX7wR@db:5432/alecrim"


# --------------------------------------------------------- SECRET_KEY -----

WEAK_SECRET_KEYS = [
    "change-me-in-production",
    "troque-por-uma-chave-aleatoria-longa",
    # placeholders de OUTROS campos dos .env.example também são públicos.
    "troque-por-uma-senha-forte",
    "troque-a-senha",
    "curta-demais",
    "",
    None,
    # passam no tamanho mínimo, mas são triviais (poucos caracteres distintos).
    "k" * 64,
    "abcabc" * 8,
    "0123456" * 6,
]


@pytest.mark.parametrize("flask_env", [None, "production", "prod", "", "staging"])
@pytest.mark.parametrize("secret_key", WEAK_SECRET_KEYS)
def test_weak_secret_key_refuses_to_boot_without_dev_opt_in(monkeypatch, secret_key, flask_env):
    # O padrão é falhar: sem FLASK_ENV, com "production" ou com qualquer
    # valor que não seja o opt-in explícito de dev/teste.
    if flask_env is None:
        monkeypatch.delenv("FLASK_ENV", raising=False)
    else:
        monkeypatch.setenv("FLASK_ENV", flask_env)

    class WeakConfig(TestConfig):
        SECRET_KEY = secret_key

    with pytest.raises(RuntimeError, match="SECRET_KEY") as excinfo:
        create_app(WeakConfig)

    # a mensagem diz o problema, nunca o valor da chave.
    if secret_key and len(secret_key) >= 12:
        assert secret_key not in str(excinfo.value)


@pytest.mark.parametrize("flask_env", ["development", "testing", "Development"])
def test_weak_secret_key_only_warns_with_explicit_dev_opt_in(monkeypatch, flask_env):
    monkeypatch.setenv("FLASK_ENV", flask_env)

    class WeakConfig(TestConfig):
        SECRET_KEY = "troque-por-uma-chave-aleatoria-longa"

    assert create_app(WeakConfig) is not None


@pytest.mark.parametrize("secret_key", ["", None])
def test_missing_secret_key_fails_even_with_dev_opt_in(monkeypatch, secret_key):
    # Sem chave não dá para assinar token: nem o opt-in de dev dispensa.
    monkeypatch.setenv("FLASK_ENV", "development")

    class NoKeyConfig(TestConfig):
        SECRET_KEY = secret_key

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(NoKeyConfig)


def test_config_has_no_public_default_secret_key(monkeypatch):
    import importlib

    import app.config as config_module

    monkeypatch.delenv("SECRET_KEY", raising=False)
    try:
        assert importlib.reload(config_module).Config.SECRET_KEY is None
    finally:
        monkeypatch.undo()
        importlib.reload(config_module)


@pytest.mark.parametrize(
    "secret_key",
    [
        STRONG_KEY,
        # outros formatos comuns de chave gerada: urlsafe/base64 e uuid duplo.
        "Xq3_mB7tLw9ZkP2vRf6YhN1cJd8sUa4EgT5oViW0-Kx",
        "3f1c9a52-7b4e-4d0a-9e63-1c8f5b2a7d40-6e0b",
        # frase longa escolhida à mão: fraca "de verdade", mas não é papel
        # desta checagem medir entropia - não pode passar a ser recusada.
        "minha-chave-local-de-desenvolvimento-2024",
    ],
)
@pytest.mark.parametrize("flask_env", [None, "production"])
def test_strong_secret_key_boots_in_any_environment(monkeypatch, secret_key, flask_env):
    if flask_env is None:
        monkeypatch.delenv("FLASK_ENV", raising=False)
    else:
        monkeypatch.setenv("FLASK_ENV", flask_env)

    class StrongConfig(TestConfig):
        SECRET_KEY = secret_key

    assert create_app(StrongConfig) is not None


def test_random_secret_keys_are_never_rejected():
    import base64
    import secrets

    from app.utils.boot_checks import secret_key_problem

    for _ in range(2000):
        assert secret_key_problem(secrets.token_hex(32)) is None
        assert secret_key_problem(secrets.token_hex(16)) is None  # 32 chars, o mínimo
        assert secret_key_problem(secrets.token_urlsafe(32)) is None
        assert secret_key_problem(base64.b64encode(secrets.token_bytes(24)).decode()) is None


# ------------------------------------------------- senha do banco (URL) ---

@pytest.mark.parametrize("flask_env", [None, "production"])
@pytest.mark.parametrize("database_url", PLACEHOLDER_DB_URLS)
def test_placeholder_database_password_refuses_to_boot(monkeypatch, database_url, flask_env):
    if flask_env is None:
        monkeypatch.delenv("FLASK_ENV", raising=False)
    else:
        monkeypatch.setenv("FLASK_ENV", flask_env)

    class PlaceholderDbConfig(TestConfig):
        SECRET_KEY = STRONG_KEY
        SQLALCHEMY_DATABASE_URI = database_url

    with pytest.raises(RuntimeError, match="DATABASE_URL") as excinfo:
        create_app(PlaceholderDbConfig)

    # nem a senha nem a URL aparecem na mensagem.
    message = str(excinfo.value)
    assert "troque-por-uma-senha-forte" not in message
    assert "troque-a-senha" not in message
    assert "@db:5432" not in message


def test_placeholder_database_password_does_not_leak_into_logs(monkeypatch, caplog):
    monkeypatch.setenv("FLASK_ENV", "development")

    from app.utils.boot_checks import database_url_has_placeholder_password

    with caplog.at_level("DEBUG"):
        for database_url in PLACEHOLDER_DB_URLS:
            assert database_url_has_placeholder_password(database_url) is True

    assert "troque" not in caplog.text


@pytest.mark.parametrize(
    "database_url",
    [
        REAL_LOOKING_DB_URL,
        "sqlite:///:memory:",
        "sqlite:///dev.db",
        "postgresql+psycopg2://alecrim@db:5432/alecrim",
        # placeholder no USUÁRIO/host/banco não é senha.
        "postgresql+psycopg2://troque-a-senha:Zk3vQ8mTn2LpX7wR@db:5432/troque-a-senha",
        "isto nao e uma url",
        "",
        None,
    ],
)
def test_database_url_without_placeholder_password_is_accepted(database_url):
    from app.utils.boot_checks import database_url_has_placeholder_password

    assert database_url_has_placeholder_password(database_url) is False


def test_real_database_password_boots_without_opt_in(monkeypatch):
    monkeypatch.delenv("FLASK_ENV", raising=False)

    class RealDbConfig(TestConfig):
        SECRET_KEY = STRONG_KEY

    # TestConfig usa SQLite em memória (sem senha) - o caso "URL sem
    # placeholder" de ponta a ponta, sem precisar de um Postgres.
    assert create_app(RealDbConfig) is not None


# --------------------------------------------------------------- SMTP -----

class FakeSMTP:
    instances: list["FakeSMTP"] = []

    def __init__(self, *args, **kwargs):
        self.starttls_context = None
        self.logged_in = False
        self.sent = False
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.starttls_context = context

    def login(self, username, password):
        self.logged_in = True

    def send_message(self, msg):
        self.sent = True


@pytest.fixture
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    return FakeSMTP


def _lead():
    return Lead(id=1, name="Fulano", phone="63999990000", consent=True)


def test_starttls_validates_server_certificate(app, fake_smtp):
    app.config.update(MAIL_SERVER="smtp.example.com", MAIL_USE_TLS=True, MAIL_USERNAME="u", MAIL_PASSWORD="p")

    email_service.notify_new_lead(_lead())

    smtp = fake_smtp.instances[0]
    assert isinstance(smtp.starttls_context, ssl.SSLContext)
    assert smtp.starttls_context.verify_mode == ssl.CERT_REQUIRED
    assert smtp.starttls_context.check_hostname is True
    assert smtp.logged_in and smtp.sent


def test_refuses_smtp_login_without_tls(app, fake_smtp):
    app.config.update(MAIL_SERVER="smtp.example.com", MAIL_USE_TLS=False, MAIL_USERNAME="u", MAIL_PASSWORD="p")

    with pytest.raises(RuntimeError):
        email_service.notify_new_lead(_lead())

    assert fake_smtp.instances == []


# --- limites de entrada dos formulários (sanitização) ---------------------

def test_login_rejects_oversized_password_without_hashing(client):
    resp = client.post("/api/admin/login", json={"email": "a@b.co", "password": "x" * 129})
    assert resp.status_code == 401
    assert resp.get_json() == {"error": "invalid_credentials"}


def test_login_rejects_oversized_email(client):
    resp = client.post("/api/admin/login", json={"email": "a" * 300 + "@b.co", "password": "x"})
    assert resp.status_code == 401


def test_lead_rejects_oversized_email(client):
    resp = client.post(
        "/api/leads",
        json={"name": "Fulano", "phone": "(11) 91234-5678", "email": "a" * 250 + "@ex.co", "consent": True},
    )
    assert resp.status_code == 400
    assert "email" in resp.get_json()["details"]


# --- política de senha (app/utils/password_policy.py) ----------------------

POLICY_EMAIL = "dr.alecrim@advocaciaalecrim.com.br"


@pytest.mark.parametrize(
    "password",
    [
        "Xk9#mPq2vLzT",  # 12 caracteres, o mínimo
        "Uma-Senha-Bem-Forte-2026",
        "cavalo bateria grampo correto",
        "x" * 60 + "Abc#1" + "y" * 63,  # 128 caracteres, o teto
        "Alecrim-Xk9#mPq2",  # contém uma palavra óbvia, mas não é só ela
    ],
)
def test_password_policy_accepts_strong_passwords(password):
    from app.utils.password_policy import password_problem

    assert password_problem(password, POLICY_EMAIL) is None


@pytest.mark.parametrize(
    "password,reason",
    [
        (None, "não é um texto"),
        (123456789012, "não é um texto"),
        ("", "menos de 12"),
        ("Xk9#mPq2vLz", "menos de 12"),
        (" " * 12, "espaço em branco"),
        ("\t\n " * 6, "espaço em branco"),
        ("aaaaaaaaaaaa", "repetitiva"),
        ("AaAaAaAaAaAa", "repetitiva"),
        ("abcdabcdabcd", "repetitiva"),
        ("112211221122", "repetitiva"),
        ("123456789012", "sequência"),
        ("098765432109", "sequência"),
        ("abcdefghijkl", "sequência"),
        ("QWERTYUIOPAS", "sequência"),
        ("advocacia2026", "senha comum"),
        ("ADVOCACIA2026", "senha comum"),
        ("Advocacia@2027!", "senha comum"),
        ("Alecrim#12345", "senha comum"),
        ("Advocacia.Alecrim.2026", "senha comum"),
        ("Senha@123456", "senha comum"),
        ("password1234", "senha comum"),
        ("Administrador123", "senha comum"),
        ("1q2w3e4r5t6y", "senha comum"),
        ("P@ssw0rd1234", "senha comum"),
        (POLICY_EMAIL, "e-mail da conta"),
        (POLICY_EMAIL.upper() + "!", "e-mail da conta"),
        ("Dr.Alecrim#8841", "e-mail da conta"),
        ("DrAlecrim#8841", "e-mail da conta"),
        ("8841-dr.alecrim-Xk9#", "e-mail da conta"),
    ],
)
def test_password_policy_rejects_weak_passwords(password, reason):
    from app.utils.password_policy import WEAK_PASSWORD, password_problem

    code, message = password_problem(password, POLICY_EMAIL)

    assert code == WEAK_PASSWORD
    assert reason in message
    # o motivo nunca repete a senha recusada.
    if isinstance(password, str) and password.strip():
        assert password not in message


def test_password_policy_too_long_has_its_own_code():
    from app.utils.password_policy import PASSWORD_TOO_LONG, password_problem

    code, message = password_problem("x1Y2z3" * 30, POLICY_EMAIL)

    assert code == PASSWORD_TOO_LONG
    assert "mais de 128" in message


@pytest.mark.parametrize("email", [None, "", 123, "ana@example.com", "@", "sem-arroba"])
def test_password_policy_tolerates_missing_or_short_email(email):
    from app.utils.password_policy import password_problem

    # Parte local curta ("ana") não entra na checagem de e-mail, e e-mail
    # ausente/inválido nunca derruba a função.
    assert password_problem("Banana-Xk9#mPq2", email) is None


# --- colunas novas em banco antigo (app/utils/schema_upgrades.py) ----------

def _admin_users_columns():
    from sqlalchemy import inspect

    from app.extensions import db

    return {c["name"] for c in inspect(db.engine).get_columns("admin_users")}


def test_schema_upgrade_adds_token_version_to_an_old_table(app):
    from sqlalchemy import text

    from app.extensions import db
    from app.models import AdminUser
    from app.utils.auth import issue_token, verify_token
    from app.utils.schema_upgrades import apply_schema_upgrades

    # Recria admin_users como era antes da coluna existir, já com um admin.
    db.session.remove()
    with db.engine.begin() as connection:
        connection.execute(text("DROP TABLE admin_users"))
        connection.execute(
            text(
                "CREATE TABLE admin_users ("
                "id INTEGER PRIMARY KEY, "
                "email VARCHAR(255) NOT NULL UNIQUE, "
                "password_hash VARCHAR(255) NOT NULL, "
                "created_at DATETIME, "
                "updated_at DATETIME)"
            )
        )
        connection.execute(
            text("INSERT INTO admin_users (id, email, password_hash) VALUES (1, 'a@b.co', 'hash')")
        )
    assert "token_version" not in _admin_users_columns()

    assert apply_schema_upgrades() == ["admin_users.token_version"]

    assert "token_version" in _admin_users_columns()
    # a linha que já existia ganha versão 0 e volta a funcionar com o ORM.
    old_admin = AdminUser.query.one()
    assert old_admin.token_version == 0
    assert verify_token(issue_token(old_admin)).id == old_admin.id

    # segunda rodada (próximo boot): nada a fazer, nada quebra.
    assert apply_schema_upgrades() == []
    assert AdminUser.query.one().email == "a@b.co"


def test_schema_upgrade_is_a_noop_on_a_fresh_database(app):
    from app.utils.schema_upgrades import apply_schema_upgrades

    # `create_all()` (fixture) já cria a tabela com a coluna.
    assert "token_version" in _admin_users_columns()
    assert apply_schema_upgrades() == []


def test_schema_upgrade_tolerates_a_database_without_the_table(app):
    from app.extensions import db
    from app.utils.schema_upgrades import apply_schema_upgrades

    db.session.remove()
    db.drop_all()

    assert apply_schema_upgrades() == []
