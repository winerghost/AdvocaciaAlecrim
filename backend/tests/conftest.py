import os

# Opt-in explícito de dev/teste das checagens de segredo do boot (ver
# app/utils/boot_checks.py): sem ele, `create_app` recusa SECRET_KEY e senha
# de banco fracas. Precisa vir ANTES de importar `app`, e é atribuição direta
# (não `setdefault`) para a suíte não depender do ambiente de quem a roda.
os.environ["FLASK_ENV"] = "testing"

import pytest  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

from app import create_app  # noqa: E402
from app.config import Config  # noqa: E402
from app.extensions import db, limiter  # noqa: E402
from app.models import AdminUser  # noqa: E402
from app.utils.auth import issue_token  # noqa: E402

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "SenhaForteDoAdmin123"


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    # Nunca dispara SMTP de verdade nos testes.
    MAIL_SERVER = None
    # Nem a OpenAI: sem chave por padrão, mesmo que a máquina de quem roda
    # a suíte tenha OPENAI_* no ambiente (ver tests/test_article_ai.py).
    OPENAI_API_KEY = None
    OPENAI_MODEL = "gpt-6.1-sol"
    OPENAI_REASONING_EFFORT = "low"
    OPENAI_TIMEOUT_SECONDS = 50
    # Valor fixo só pra suíte (Config não tem mais default de SECRET_KEY).
    # Passa nas checagens de boot por conta própria, então os testes não
    # dependem do opt-in acima para assinar tokens.
    SECRET_KEY = "chave-de-teste-nao-usar-fora-da-suite-0123456789"
    # Chave fixa só pra suíte de testes (não vem de env var - `Config`
    # exigiria isso via FIELD_ENCRYPTION_KEY, mas aqui sobrescrevemos
    # direto, igual já é feito com SQLALCHEMY_DATABASE_URI acima).
    FIELD_ENCRYPTION_KEY = Fernet.generate_key().decode()


@pytest.fixture
def app():
    """App Flask com banco em memória, pronto para cada teste.

    O `Limiter` (backend/app/extensions.py) é um objeto único, então seu
    storage "memory://" sobrevive entre `create_app()` de testes diferentes
    se não for resetado — por isso `limiter.reset()` no teardown, senão os
    testes de rate limit ficam dependentes de ordem/execução.
    """
    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        try:
            yield application
        finally:
            db.session.remove()
            db.drop_all()
            limiter.reset()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def admin(app):
    """O único AdminUser usado pelos testes do painel."""
    user = AdminUser(
        email=ADMIN_EMAIL,
        password_hash=generate_password_hash(ADMIN_PASSWORD),
    )
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture
def admin_token(app, admin):
    """Token válido (mesmo formato que `POST /api/admin/login` devolve)
    pronto para usar em `Authorization: Bearer <token>` nos testes que não
    precisam exercitar o próprio fluxo de login.
    """
    return issue_token(admin)
