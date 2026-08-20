import pytest

from app.models import Faq, Lead, Service, Testimonial


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# -------------------------------------------------------------------- auth --

@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/admin/services"),
        ("post", "/api/admin/services"),
        ("put", "/api/admin/services/1"),
        ("delete", "/api/admin/services/1"),
        ("get", "/api/admin/testimonials"),
        ("post", "/api/admin/testimonials"),
        ("put", "/api/admin/testimonials/1"),
        ("delete", "/api/admin/testimonials/1"),
        ("get", "/api/admin/faqs"),
        ("post", "/api/admin/faqs"),
        ("put", "/api/admin/faqs/1"),
        ("delete", "/api/admin/faqs/1"),
        ("get", "/api/admin/leads"),
        ("delete", "/api/admin/leads/1"),
    ],
)
def test_admin_content_routes_require_auth(client, method, path):
    resp = getattr(client, method)(path)

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "unauthorized"}


# ---------------------------------------------------------------- services --

def test_service_full_crud(client, admin_token):
    headers = auth_headers(admin_token)

    create_resp = client.post(
        "/api/admin/services",
        json={
            "slug": "novo-servico",
            "title": "Novo Serviço",
            "icon": "star",
            "description": "Descrição do novo serviço.",
            "order": 5,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.get_json()["data"]
    assert created["slug"] == "novo-servico"
    service_id = created["id"]

    list_resp = client.get("/api/admin/services", headers=headers)
    assert list_resp.status_code == 200
    assert any(s["id"] == service_id for s in list_resp.get_json()["data"])

    update_resp = client.put(
        f"/api/admin/services/{service_id}",
        json={"title": "Título Atualizado"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["title"] == "Título Atualizado"
    # campos não enviados no PUT parcial permanecem intactos.
    assert updated["slug"] == "novo-servico"
    assert updated["order"] == 5

    delete_resp = client.delete(f"/api/admin/services/{service_id}", headers=headers)
    assert delete_resp.status_code == 204

    missing_resp = client.delete(f"/api/admin/services/{service_id}", headers=headers)
    assert missing_resp.status_code == 404

    assert Service.query.count() == 0


def test_service_duplicate_slug_is_rejected(client, admin_token):
    headers = auth_headers(admin_token)
    payload = {
        "slug": "duplicado",
        "title": "Serviço",
        "description": "Descrição.",
    }
    client.post("/api/admin/services", json=payload, headers=headers)
    resp = client.post("/api/admin/services", json=payload, headers=headers)

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "slug_already_exists"


def test_service_update_missing_returns_404(client, admin_token):
    resp = client.put(
        "/api/admin/services/9999", json={"title": "X"}, headers=auth_headers(admin_token)
    )

    assert resp.status_code == 404


def test_service_xss_payload_is_sanitized(client, admin_token):
    resp = client.post(
        "/api/admin/services",
        json={
            "slug": "servico-xss",
            "title": "Serviço <script>alert(1)</script> Teste",
            "description": "<img src=x onerror=alert(1)>Descrição normal.",
        },
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 201

    service = Service.query.filter_by(slug="servico-xss").one()
    assert "<" not in service.title
    assert ">" not in service.title
    assert "<img" not in service.description


# ----------------------------------------------------------- testimonials --

def test_testimonial_full_crud(client, admin_token):
    headers = auth_headers(admin_token)

    create_resp = client.post(
        "/api/admin/testimonials",
        json={"author": "Cliente Teste", "content": "Ótimo atendimento.", "approved": False},
        headers=headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.get_json()["data"]
    assert created["approved"] is False
    testimonial_id = created["id"]

    # não aparece no site público até ser aprovado.
    public_resp = client.get("/api/testimonials")
    assert all(t["id"] != testimonial_id for t in public_resp.get_json()["data"])

    approve_resp = client.put(
        f"/api/admin/testimonials/{testimonial_id}",
        json={"approved": True},
        headers=headers,
    )
    assert approve_resp.status_code == 200
    assert approve_resp.get_json()["data"]["approved"] is True
    assert approve_resp.get_json()["data"]["author"] == "Cliente Teste"

    public_resp = client.get("/api/testimonials")
    assert any(t["id"] == testimonial_id for t in public_resp.get_json()["data"])

    delete_resp = client.delete(f"/api/admin/testimonials/{testimonial_id}", headers=headers)
    assert delete_resp.status_code == 204

    missing_resp = client.delete(f"/api/admin/testimonials/{testimonial_id}", headers=headers)
    assert missing_resp.status_code == 404

    assert Testimonial.query.count() == 0


def test_testimonial_xss_payload_is_sanitized(client, admin_token):
    resp = client.post(
        "/api/admin/testimonials",
        json={
            "author": "Maria <script>alert(1)</script> Souza",
            "content": "<img src=x onerror=alert(1)>Muito bom.",
        },
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 201

    testimonial = Testimonial.query.one()
    assert "<" not in testimonial.author
    assert ">" not in testimonial.author
    assert "<img" not in testimonial.content


# ------------------------------------------------------------------ faqs --

def test_faq_full_crud(client, admin_token):
    headers = auth_headers(admin_token)

    create_resp = client.post(
        "/api/admin/faqs",
        json={"question": "Pergunta?", "answer": "Resposta.", "order": 3},
        headers=headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.get_json()["data"]
    assert created["order"] == 3
    faq_id = created["id"]

    update_resp = client.put(
        f"/api/admin/faqs/{faq_id}",
        json={"answer": "Resposta atualizada."},
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["answer"] == "Resposta atualizada."
    assert updated["question"] == "Pergunta?"

    delete_resp = client.delete(f"/api/admin/faqs/{faq_id}", headers=headers)
    assert delete_resp.status_code == 204

    missing_resp = client.delete(f"/api/admin/faqs/{faq_id}", headers=headers)
    assert missing_resp.status_code == 404

    assert Faq.query.count() == 0


def test_faq_xss_payload_is_sanitized(client, admin_token):
    resp = client.post(
        "/api/admin/faqs",
        json={
            "question": "Pergunta <script>alert(1)</script>?",
            "answer": "<img src=x onerror=alert(1)>Resposta normal.",
        },
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 201

    faq = Faq.query.one()
    assert "<" not in faq.question
    assert ">" not in faq.question
    assert "<img" not in faq.answer


# ----------------------------------------------------------------- leads --

def test_list_leads(client, admin_token, app):
    from app.extensions import db

    lead = Lead(name="Fulano", phone="11987654321", consent=True)
    db.session.add(lead)
    db.session.commit()

    resp = client.get("/api/admin/leads", headers=auth_headers(admin_token))

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Fulano"
    assert data[0]["id"] == lead.id


def test_delete_lead(client, admin_token, app):
    from app.extensions import db

    lead = Lead(name="Fulano", phone="11987654321", consent=True)
    db.session.add(lead)
    db.session.commit()
    lead_id = lead.id

    resp = client.delete(f"/api/admin/leads/{lead_id}", headers=auth_headers(admin_token))

    assert resp.status_code == 204
    assert Lead.query.count() == 0


def test_delete_nonexistent_lead_returns_404(client, admin_token):
    resp = client.delete("/api/admin/leads/9999", headers=auth_headers(admin_token))

    assert resp.status_code == 404
    assert resp.get_json() == {"error": "not_found"}
