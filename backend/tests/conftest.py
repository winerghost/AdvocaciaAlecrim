import pytest

from app import create_app
from app.config import Config
from app.extensions import db, limiter


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
