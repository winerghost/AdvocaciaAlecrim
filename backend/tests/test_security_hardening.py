import ssl

import pytest

from app import create_app
from app.models import Lead
from app.services import email as email_service

from conftest import TestConfig

STRONG_KEY = "k" * 64


# --------------------------------------------------------- SECRET_KEY -----

@pytest.mark.parametrize(
    "secret_key",
    ["change-me-in-production", "troque-por-uma-chave-aleatoria-longa", "curta-demais", ""],
)
def test_weak_secret_key_refuses_to_boot_in_production(monkeypatch, secret_key):
    monkeypatch.setenv("FLASK_ENV", "production")

    class WeakConfig(TestConfig):
        SECRET_KEY = secret_key

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(WeakConfig)


def test_weak_secret_key_only_warns_outside_production(monkeypatch):
    monkeypatch.delenv("FLASK_ENV", raising=False)

    class WeakConfig(TestConfig):
        SECRET_KEY = "troque-por-uma-chave-aleatoria-longa"

    assert create_app(WeakConfig) is not None


def test_strong_secret_key_boots_in_production(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")

    class StrongConfig(TestConfig):
        SECRET_KEY = STRONG_KEY

    assert create_app(StrongConfig) is not None


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
