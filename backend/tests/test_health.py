from app import create_app
from app.config import Config


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True


def test_health_ok():
    app = create_app(TestConfig)
    client = app.test_client()

    resp = client.get("/api/health")

    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"
