from app import create_app
from conftest import TestConfig

# TestConfig vem de conftest.py (não redefinido aqui) porque já inclui
# FIELD_ENCRYPTION_KEY - sem isso create_app() derruba o boot (ver
# app/__init__.py).


def test_health_ok():
    app = create_app(TestConfig)
    client = app.test_client()

    resp = client.get("/api/health")

    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"
