from app.models import Lead

VALID_PAYLOAD = {
    "name": "Joana da Silva",
    "phone": "(11) 91234-5678",
    "email": "joana@example.com",
    "area": "Aposentadoria",
    "message": "Gostaria de tirar uma dúvida sobre o meu caso.",
    "consent": True,
    "website": "",  # honeypot vazio = humano
}


def _payload(**overrides):
    data = dict(VALID_PAYLOAD)
    data.update(overrides)
    return data


def test_valid_payload_is_accepted(client):
    resp = client.post("/api/leads", json=_payload())

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["data"]["received"] is True
    assert isinstance(body["data"]["id"], int)

    lead = Lead.query.one()
    assert lead.name == "Joana da Silva"
    assert lead.email == "joana@example.com"
    assert lead.consent is True


def test_invalid_email_is_rejected(client):
    resp = client.post("/api/leads", json=_payload(email="not-an-email"))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "email" in body["details"]
    assert Lead.query.count() == 0


def test_missing_required_field_is_rejected(client):
    payload = _payload()
    del payload["name"]

    resp = client.post("/api/leads", json=payload)

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "name" in body["details"]
    assert Lead.query.count() == 0


def test_missing_consent_is_rejected(client):
    resp = client.post("/api/leads", json=_payload(consent=False))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "consent" in body["details"]
    assert Lead.query.count() == 0


def test_invalid_phone_is_rejected(client):
    resp = client.post("/api/leads", json=_payload(phone="123"))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "phone" in body["details"]


def test_invalid_area_is_rejected(client):
    resp = client.post("/api/leads", json=_payload(area="Direito Penal Militar Extraterrestre"))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "area" in body["details"]


def test_xss_payload_is_sanitized(client):
    resp = client.post(
        "/api/leads",
        json=_payload(
            name="Maria <script>alert(1)</script> Souza",
            message="<img src=x onerror=alert(1)>Olá, tudo bem?",
        ),
    )

    assert resp.status_code == 201

    lead = Lead.query.one()
    assert "<script>" not in lead.name
    assert "<" not in lead.name
    assert ">" not in lead.name
    assert "<img" not in lead.message
    assert "onerror" not in lead.message or "<" not in lead.message


def test_header_injection_attempt_is_sanitized(client):
    resp = client.post(
        "/api/leads",
        json=_payload(name="Joana\r\nBcc: atacante@evil.com"),
    )

    assert resp.status_code == 201

    lead = Lead.query.one()
    assert "\r" not in lead.name
    assert "\n" not in lead.name
    assert "Bcc:" not in lead.name or "\n" not in lead.name


def test_honeypot_filled_is_discarded_silently(client):
    resp = client.post("/api/leads", json=_payload(website="http://spam.example.com"))

    # Resposta "de sucesso" falsa - não dá pista pro bot de que foi pego.
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["data"]["received"] is True

    # Mas nada foi persistido nem processado como lead de verdade.
    assert Lead.query.count() == 0


def test_rate_limit_triggers_after_n_requests(client):
    statuses = [client.post("/api/leads", json=_payload()).status_code for _ in range(6)]

    assert statuses.count(201) == 5
    assert statuses[-1] == 429
