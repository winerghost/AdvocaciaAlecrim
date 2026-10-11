"""Correções da auditoria C7 (backend): erros HTTP em JSON, cabeçalhos de
cache/CSP, corridas de unicidade, teto de chamadas simultâneas da IA, limite
de upload, normalização do e-mail do seed e aviso de campo ilegível."""

import io
import logging
import threading
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

import seed
from app.extensions import db
from app.models import AdminUser, Lead, Service
from app.services import article_ai
from app.utils import crypto

LEAD = {
    "name": "Maria da Silva",
    "phone": "(63) 91234-5678",
    "consent": True,
}

# Mesmas credenciais do fixture `admin` (conftest.py).
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "SenhaForteDoAdmin123"

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------- erros HTTP sempre em JSON --

def test_method_not_allowed_is_json_and_keeps_allow_header(client):
    resp = client.delete("/api/leads")

    assert resp.status_code == 405
    assert resp.mimetype == "application/json"
    assert resp.get_json() == {"error": "method_not_allowed"}
    assert "POST" in resp.headers["Allow"]


def test_payload_too_large_is_json(client):
    resp = client.post(
        "/api/leads",
        data=b'{"name": "' + b"a" * (300 * 1024) + b'"}',
        content_type="application/json",
    )

    assert resp.status_code == 413
    assert resp.get_json() == {"error": "payload_too_large"}


def test_rate_limit_response_is_json(client, admin):
    body = {"email": ADMIN_EMAIL, "password": "senha-errada-qualquer"}
    statuses = [client.post("/api/admin/login", json=body).status_code for _ in range(6)]

    assert statuses[-1] == 429
    resp = client.post("/api/admin/login", json=body)
    assert resp.status_code == 429
    assert resp.mimetype == "application/json"
    assert resp.get_json() == {"error": "rate_limited"}


def test_not_found_keeps_its_own_body(client):
    resp = client.get("/api/nao-existe")

    assert resp.status_code == 404
    assert resp.get_json() == {"error": "not_found"}


# --------------------------------------------------- cache e CSP da resposta --

def test_admin_responses_are_never_cached(client, admin, admin_token):
    login = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    leads = client.get("/api/admin/leads", headers=auth(admin_token))
    unauthorized = client.get("/api/admin/leads")

    for resp in (login, leads, unauthorized):
        assert resp.headers["Cache-Control"] == "no-store"
    assert login.status_code == 200


def test_public_json_is_not_forced_to_no_store(client):
    resp = client.get("/api/services")

    assert "Cache-Control" not in resp.headers


def test_json_responses_carry_a_locked_down_csp(client):
    resp = client.get("/api/health")

    assert resp.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_media_is_served_sandboxed(app, client, admin_token, tmp_path):
    app.config["UPLOAD_DIR"] = str(tmp_path)
    up = client.post(
        "/api/admin/uploads",
        data={"file": (io.BytesIO(PNG_BYTES), "a.png", "image/png")},
        content_type="multipart/form-data",
        headers=auth(admin_token),
    )
    assert up.status_code == 201

    resp = client.get(up.get_json()["data"]["url"])

    assert resp.status_code == 200
    assert resp.headers["Content-Security-Policy"] == "default-src 'none'; sandbox"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    resp.close()


def test_upload_is_rate_limited(app, client, admin_token, tmp_path):
    app.config["UPLOAD_DIR"] = str(tmp_path)

    def upload():
        return client.post(
            "/api/admin/uploads",
            data={"file": (io.BytesIO(PNG_BYTES), "a.png", "image/png")},
            content_type="multipart/form-data",
            headers=auth(admin_token),
        )

    assert [upload().status_code for _ in range(60)] == [201] * 60
    resp = upload()
    assert resp.status_code == 429
    assert len(list(tmp_path.iterdir())) == 60


# ----------------------------------------- corrida de unicidade (UNIQUE) --

def _commit_raises_integrity_error(monkeypatch):
    def boom():
        raise IntegrityError("INSERT", {}, Exception("duplicate key"))

    monkeypatch.setattr(db.session, "commit", boom)


def test_create_admin_user_unique_violation_is_409_not_500(client, admin, admin_token, monkeypatch):
    payload = {
        "email": "segundo.admin@escritorio.adv.br",
        "password": "Zq7!vLm3#Rt9xKw",
        "current_password": ADMIN_PASSWORD,
    }
    _commit_raises_integrity_error(monkeypatch)

    resp = client.post("/api/admin/users", json=payload, headers=auth(admin_token))

    assert resp.status_code == 409
    assert resp.get_json() == {"error": "email_taken"}
    monkeypatch.undo()
    assert AdminUser.query.count() == 1


def test_create_service_unique_violation_is_400_not_500(client, admin_token, monkeypatch):
    payload = {
        "slug": "divorcio",
        "title": "Divórcio",
        "description": "Condução de divórcios consensuais e litigiosos.",
    }
    _commit_raises_integrity_error(monkeypatch)

    resp = client.post("/api/admin/services", json=payload, headers=auth(admin_token))

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "slug_already_exists"}
    monkeypatch.undo()
    assert Service.query.count() == 0


def test_update_service_unique_violation_is_400_not_500(client, admin_token, monkeypatch):
    service = Service(slug="a-um", title="Serviço um", icon="scale", description="Descrição um.", order=1)
    db.session.add(service)
    db.session.commit()
    _commit_raises_integrity_error(monkeypatch)

    resp = client.put(
        f"/api/admin/services/{service.id}", json={"title": "Novo título"}, headers=auth(admin_token)
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "slug_already_exists"}


# ---------------------------------- IA: teto de chamadas simultâneas --

def test_ai_concurrency_cap_answers_429_without_calling_openai(app, monkeypatch):
    app.config["OPENAI_API_KEY"] = "sk-teste-0123456789"
    slots = threading.BoundedSemaphore(1)
    assert slots.acquire(blocking=False)  # a única vaga já está em uso
    monkeypatch.setattr(article_ai, "_call_slots", slots)

    def never(*args, **kwargs):  # pragma: no cover - não pode ser chamado
        raise AssertionError("a OpenAI não deveria ser chamada")

    monkeypatch.setattr(article_ai, "request_completion", never)

    with pytest.raises(article_ai.AIError) as excinfo:
        article_ai.suggest("excerpt", "draft", title="Um título qualquer")

    assert (excinfo.value.code, excinfo.value.status) == ("ai_rate_limited", 429)


def test_ai_slot_is_released_even_when_the_call_fails(app, monkeypatch):
    app.config["OPENAI_API_KEY"] = "sk-teste-0123456789"
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(article_ai, "_call_slots", slots)

    def fail(*args, **kwargs):
        raise article_ai.AIError("ai_upstream_error", 502)

    monkeypatch.setattr(article_ai, "request_completion", fail)

    for _ in range(3):  # se a vaga vazasse, a 2ª chamada já viraria 429
        with pytest.raises(article_ai.AIError) as excinfo:
            article_ai.suggest("excerpt", "draft", title="Um título qualquer")
        assert excinfo.value.code == "ai_upstream_error"

    assert slots.acquire(blocking=False)


# ------------------------------------------------ seed: e-mail normalizado --

def test_seed_stores_admin_email_exactly_as_login_normalizes_it(app, client, monkeypatch):
    fullwidth = "ｄｒ.ａｌｅｃｒｉｍ@escritorio.adv.br"  # NFKC -> ASCII
    monkeypatch.setenv("ADMIN_EMAIL", fullwidth)
    monkeypatch.setenv("ADMIN_PASSWORD", "Zq7!vLm3#Rt9xKw")

    seed.run(app=app)

    assert AdminUser.query.one().email == "dr.alecrim@escritorio.adv.br"
    login = client.post("/api/admin/login", json={"email": fullwidth, "password": "Zq7!vLm3#Rt9xKw"})
    assert login.status_code == 200


# --------------------------------------------- campo cifrado ilegível --

def test_unreadable_encrypted_field_warns_once_without_data(app, caplog, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setattr(crypto, "_unreadable_warned", False)
    lead = Lead(name="Pessoa Secreta", phone="63912345678", consent=True)
    db.session.add(lead)
    db.session.commit()
    lead_id = lead.id
    db.session.expire_all()

    app.config["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    with caplog.at_level(logging.WARNING, logger=crypto.logger.name):
        first = db.session.get(Lead, lead_id)
        assert first.name is None and first.phone is None
        db.session.expire_all()
        assert db.session.get(Lead, lead_id).name is None

    messages = [r.getMessage() for r in caplog.records if r.name == crypto.logger.name]
    assert len(messages) == 1
    assert "Pessoa Secreta" not in messages[0]
    assert "63912345678" not in messages[0]


# ---------------------------------------------------------- wsgi.py --

def test_wsgi_dev_server_is_not_exposed_or_debuggable():
    source = (Path(__file__).resolve().parent.parent / "wsgi.py").read_text(encoding="utf-8")

    assert "0.0.0.0" not in source
    assert "debug=False" in source


# ------------------------------------------- DATABASE_URL e o driver do PG --

@pytest.mark.parametrize(
    "raw,expected",
    [
        (None, "sqlite:///dev.db"),
        ("", "sqlite:///dev.db"),
        ("   ", "sqlite:///dev.db"),
        ("sqlite:///:memory:", "sqlite:///:memory:"),
        ("postgresql://u:p@db:5432/x", "postgresql+psycopg2://u:p@db:5432/x"),
        ("postgres://u:p@db:5432/x", "postgresql+psycopg2://u:p@db:5432/x"),
        ("POSTGRESQL://u:p@db:5432/x", "postgresql+psycopg2://u:p@db:5432/x"),
        (" postgresql://u:p@db/x ", "postgresql+psycopg2://u:p@db/x"),
        # já explícito: não mexe (nem troca de driver de quem escolheu outro).
        ("postgresql+psycopg2://u:p@db/x", "postgresql+psycopg2://u:p@db/x"),
        ("postgresql+psycopg://u:p@db/x", "postgresql+psycopg://u:p@db/x"),
    ],
)
def test_database_uri_pins_the_psycopg2_driver(raw, expected):
    from app.config import database_uri

    assert database_uri(raw) == expected
