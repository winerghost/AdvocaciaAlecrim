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
        ("put", "/api/admin/leads/1"),
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
    assert data[0]["status"] == "novo"  # default


def test_lead_status_defaults_to_novo(app):
    from app.extensions import db

    lead = Lead(name="Fulano", phone="11987654321", consent=True)
    db.session.add(lead)
    db.session.commit()

    assert lead.status == "novo"


def test_update_lead_status_success(client, admin_token, app):
    from app.extensions import db

    lead = Lead(name="Fulano", phone="11987654321", consent=True)
    db.session.add(lead)
    db.session.commit()

    resp = client.put(
        f"/api/admin/leads/{lead.id}",
        json={"status": "convertido"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "convertido"
    assert db.session.get(Lead, lead.id).status == "convertido"


def test_update_lead_status_invalid_value_is_rejected(client, admin_token, app):
    from app.extensions import db

    lead = Lead(name="Fulano", phone="11987654321", consent=True)
    db.session.add(lead)
    db.session.commit()

    resp = client.put(
        f"/api/admin/leads/{lead.id}",
        json={"status": "nao-existe"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "validation_error"
    assert db.session.get(Lead, lead.id).status == "novo"  # não mudou


def test_update_nonexistent_lead_status_returns_404(client, admin_token):
    resp = client.put(
        "/api/admin/leads/9999",
        json={"status": "convertido"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 404


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


# ------------------------------------- trilha de auditoria dos leads (LGPD) --

LEAD_PII = {
    "name": "Beltrana Auditada",
    "phone": "11912345678",
    "email": "beltrana@cliente.example",
    "area": "Direito de Família",
    "message": "Preciso de ajuda com um divórcio litigioso.",
}


def _make_pii_lead():
    from app.extensions import db

    lead = Lead(consent=True, **LEAD_PII)
    db.session.add(lead)
    db.session.commit()
    return lead.id


def _audit_lines(caplog):
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith("AUDIT ")]


def _assert_no_lead_pii(line):
    for value in LEAD_PII.values():
        assert value not in line


def test_list_leads_is_audited_without_pii(client, admin, admin_token, caplog):
    _make_pii_lead()

    with caplog.at_level("WARNING"):
        resp = client.get(
            "/api/admin/leads",
            headers=auth_headers(admin_token),
            environ_base={"REMOTE_ADDR": "203.0.113.7"},
        )

    assert resp.status_code == 200
    # A resposta traz os dados; o log, não.
    assert resp.get_json()["data"][0]["name"] == LEAD_PII["name"]
    lines = _audit_lines(caplog)
    assert lines == [f"AUDIT leads_listed by=#{admin.id} ({admin.email}) count=1 ip=203.0.113.7"]
    _assert_no_lead_pii(lines[0])


def test_update_lead_status_is_audited_without_pii(client, admin, admin_token, caplog):
    lead_id = _make_pii_lead()

    with caplog.at_level("WARNING"):
        resp = client.put(
            f"/api/admin/leads/{lead_id}",
            json={"status": "convertido"},
            headers=auth_headers(admin_token),
            environ_base={"REMOTE_ADDR": "203.0.113.7"},
        )

    assert resp.status_code == 200
    lines = _audit_lines(caplog)
    assert lines == [
        f"AUDIT lead_status_changed by=#{admin.id} ({admin.email}) "
        f"target=#{lead_id} status=novo->convertido ip=203.0.113.7"
    ]
    _assert_no_lead_pii(lines[0])


def test_delete_lead_is_audited_without_pii(client, admin, admin_token, caplog):
    lead_id = _make_pii_lead()

    with caplog.at_level("WARNING"):
        resp = client.delete(
            f"/api/admin/leads/{lead_id}",
            headers=auth_headers(admin_token),
            environ_base={"REMOTE_ADDR": "203.0.113.7"},
        )

    assert resp.status_code == 204
    lines = _audit_lines(caplog)
    assert lines == [f"AUDIT lead_deleted by=#{admin.id} ({admin.email}) target=#{lead_id} ip=203.0.113.7"]
    _assert_no_lead_pii(lines[0])


def test_failed_lead_operations_leave_no_audit_line(client, admin_token, caplog):
    """Só o que de fato aconteceu entra na trilha: sem token, lead
    inexistente e status inválido não geram linha de auditoria."""
    lead_id = _make_pii_lead()

    with caplog.at_level("WARNING"):
        assert client.get("/api/admin/leads").status_code == 401
        assert client.delete("/api/admin/leads/9999", headers=auth_headers(admin_token)).status_code == 404
        resp = client.put(
            f"/api/admin/leads/{lead_id}",
            json={"status": "nao-existe"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    assert _audit_lines(caplog) == []


# ----------------------------- validação que só existia no painel (required) --

def test_service_empty_icon_is_rejected(client, admin_token):
    payload = {"slug": "sem-icone", "title": "Sem ícone", "description": "Descrição.", "icon": "  "}

    resp = client.post("/api/admin/services", json=payload, headers=auth_headers(admin_token))

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "validation_error"
    assert "icon" in resp.get_json()["details"]
    assert Service.query.count() == 0


def test_service_icon_cannot_be_emptied_on_update(client, admin_token):
    created = client.post(
        "/api/admin/services",
        json={"slug": "com-icone", "title": "Com ícone", "description": "Descrição.", "icon": "scale"},
        headers=auth_headers(admin_token),
    ).get_json()["data"]

    resp = client.put(
        f"/api/admin/services/{created['id']}", json={"icon": ""}, headers=auth_headers(admin_token)
    )

    assert resp.status_code == 400
    assert "icon" in resp.get_json()["details"]
    assert Service.query.filter_by(id=created["id"]).one().icon == "scale"


def test_service_without_icon_still_gets_default(client, admin_token):
    resp = client.post(
        "/api/admin/services",
        json={"slug": "padrao", "title": "Padrão", "description": "Descrição."},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 201
    assert resp.get_json()["data"]["icon"] == "briefcase"


def test_testimonial_empty_role_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/testimonials",
        json={"author": "Maria", "role": "<b></b>", "content": "Ótimo atendimento."},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "validation_error"
    assert "role" in resp.get_json()["details"]
    assert Testimonial.query.count() == 0


def test_testimonial_without_role_still_gets_default(client, admin_token):
    resp = client.post(
        "/api/admin/testimonials",
        json={"author": "Maria", "content": "Ótimo atendimento."},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 201
    assert resp.get_json()["data"]["role"] == "Cliente"


@pytest.mark.parametrize(
    "method,path",
    [
        ("put", "/api/admin/services/{id}"),
        ("delete", "/api/admin/services/{id}"),
        ("put", "/api/admin/testimonials/{id}"),
        ("delete", "/api/admin/testimonials/{id}"),
        ("put", "/api/admin/faqs/{id}"),
        ("delete", "/api/admin/faqs/{id}"),
        ("put", "/api/admin/leads/{id}"),
        ("delete", "/api/admin/leads/{id}"),
    ],
)
def test_id_above_db_integer_is_404_not_500(client, admin_token, method, path):
    for big_id in (2**31, "9" * 30):
        resp = getattr(client, method)(path.format(id=big_id), json={}, headers=auth_headers(admin_token))

        assert resp.status_code == 404
        assert resp.get_json() == {"error": "not_found"}
