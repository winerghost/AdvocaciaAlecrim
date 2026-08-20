import pytest
from werkzeug.security import generate_password_hash

from app import create_app
from app.config import Config
from app.extensions import db, limiter
from app.models import AdminUser
from app.utils.auth import issue_token

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "SenhaForteDoAdmin123"


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    # Nunca dispara SMTP de verdade nos testes.
    MAIL_SERVER = None


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
