"""Fase 3 do menu Configurações: SEO, áreas do formulário, retenção de leads
e integração de IA."""

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Lead
from app.services import media_cleanup, site_settings

from conftest import ADMIN_PASSWORD
from purge_leads import run as run_purge
from test_article_ai import AI_URL, API_KEY, ai_enabled, openai  # noqa: F401 - fixtures
from test_mfa import auth_headers

MEDIA = "/api/media/" + "a" * 32 + ".png"
LEAD = {"name": "Maria Silva", "phone": "(63) 99999-0000", "consent": True}


def _put(client, token, group, **values):
    return client.put(
        f"/api/admin/settings/{group}",
        json={"current_password": ADMIN_PASSWORD, **values},
        headers=auth_headers(token),
    )


# --------------------------------------------------------------------- SEO --

def test_seo_fields_are_public_and_validated(client, admin_token):
    ok = _put(client, admin_token, "site", seo_home_title="Advogado em Palmas", og_image=MEDIA)
    assert ok.status_code == 200, ok.get_json()
    public = client.get("/api/settings/site").get_json()["data"]
    assert public["seo_home_title"] == "Advogado em Palmas"
    assert public["og_image"] == MEDIA

    bad = _put(client, admin_token, "site", og_image="https://evil.example/x.png", seo_home_title="x" * 71)
    assert bad.get_json()["details"] == {"og_image": "invalid_image", "seo_home_title": "too_long"}


def test_og_image_is_protected_from_orphan_purge(app):
    site_settings.save_settings("site", {"og_image": MEDIA}, 1)
    assert "a" * 32 + ".png" in media_cleanup.referenced_media_filenames()


# --------------------------------------------------------- áreas do lead --

def test_lead_areas_default_and_other_is_always_accepted(client):
    assert client.post("/api/leads", json={**LEAD, "area": "Aposentadoria"}).status_code == 201
    assert client.post("/api/leads", json={**LEAD, "area": "Outro"}).status_code == 201
    assert client.post("/api/leads", json={**LEAD, "area": "Hackeada"}).status_code == 400


def test_custom_lead_areas_change_what_the_form_accepts(client, admin_token):
    resp = _put(client, admin_token, "site", lead_areas=["Direito de Família", "outro", "direito de família", "  Previdenciário "])
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["data"]["values"]["lead_areas"] == ["Direito de Família", "Previdenciário"]

    assert client.post("/api/leads", json={**LEAD, "area": "Direito de Família"}).status_code == 201
    assert client.post("/api/leads", json={**LEAD, "area": "Aposentadoria"}).status_code == 400
    assert client.post("/api/leads", json={**LEAD, "area": "Outro"}).status_code == 201


def test_lead_areas_validation(client, admin_token):
    for bad in ([], ["Outro"], ["x" * 61], [f"Área {i}" for i in range(11)], "Família"):
        resp = _put(client, admin_token, "site", lead_areas=bad)
        assert resp.get_json()["details"] == {"lead_areas": "invalid_areas"}, bad


# --------------------------------------------------------------- retenção --

def test_retention_default_comes_from_env(app, client):
    app.config["LEAD_RETENTION_DAYS"] = 200
    assert client.get("/api/settings/site").get_json()["data"]["lead_retention_days"] == 200


def test_retention_range(client, admin_token):
    for bad in (29, 731, "90", True):
        assert _put(client, admin_token, "site", lead_retention_days=bad).status_code == 400
    assert _put(client, admin_token, "site", lead_retention_days=60).status_code == 200


def test_purge_uses_panel_retention(app):
    site_settings.save_settings("site", {"lead_retention_days": 30}, 1)
    old = Lead(name="Velho", phone="63999990000", consent=True, created_at=datetime.now(timezone.utc) - timedelta(days=45))
    db.session.add(old)
    db.session.commit()
    assert run_purge(app=app) == 1


# ------------------------------------------------------------- integração --

def test_integrations_payload_never_exposes_the_key(client, admin_token, ai_enabled):
    data = client.get("/api/admin/settings/integrations", headers=auth_headers(admin_token)).get_json()["data"]
    assert data["ai_key_configured"] is True
    assert data["values"]["ai_model"] == "gpt-6.1-sol"
    assert data["model_choices"] == ["gpt-6.1-sol"]
    assert API_KEY not in str(data)


def test_integrations_not_public(client):
    assert client.get("/api/settings/integrations").status_code == 404


def test_ai_model_is_a_closed_list(app, client, admin_token):
    assert _put(client, admin_token, "integrations", ai_model="modelo-inventado").get_json()["details"] == {
        "ai_model": "invalid_choice"
    }
    app.config["OPENAI_MODEL_CHOICES"] = "gpt-outro, nome inválido!, gpt-6.1-sol"
    assert site_settings.ai_model_choices() == ("gpt-6.1-sol", "gpt-outro")
    assert _put(client, admin_token, "integrations", ai_model="gpt-outro").status_code == 200


def test_ai_daily_limit_only_goes_down(client, admin_token):
    assert _put(client, admin_token, "integrations", ai_daily_limit=201).status_code == 400
    assert _put(client, admin_token, "integrations", ai_daily_limit=0).status_code == 400
    assert _put(client, admin_token, "integrations", ai_daily_limit=50).status_code == 200


def test_panel_model_and_effort_reach_the_openai_call(client, admin_token, ai_enabled, openai, app):
    app.config["OPENAI_MODEL_CHOICES"] = "gpt-outro"
    _put(client, admin_token, "integrations", ai_model="gpt-outro", ai_reasoning_effort="high", ai_timeout_seconds=20)
    resp = client.post(
        AI_URL, json={"field": "content", "action": "draft", "title": "Título"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 200, resp.get_json()
    assert openai.payload["model"] == "gpt-outro"
    assert openai.payload["reasoning"]["effort"] == "high"
    assert openai.calls[0][1] == 20


def test_ai_can_be_disabled_from_panel(client, admin_token, ai_enabled, openai):
    _put(client, admin_token, "integrations", ai_enabled=False)
    resp = client.post(
        AI_URL, json={"field": "content", "action": "draft", "title": "Título"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 503
    assert resp.get_json() == {"error": "ai_disabled"}
    assert openai.calls == []


def test_ai_daily_limit_from_panel_is_enforced(client, admin_token, ai_enabled, openai):
    _put(client, admin_token, "integrations", ai_daily_limit=2)
    body = {"field": "content", "action": "draft", "title": "Título"}
    codes = [client.post(AI_URL, json=body, headers=auth_headers(admin_token)).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_retention_change_updates_privacy_date(client, admin_token):
    values = _put(client, admin_token, "site", lead_retention_days=120).get_json()["data"]["values"]
    assert values["legal_updated_at"] is not None
