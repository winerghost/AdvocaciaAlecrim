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
    # Só a confirmação: o id sequencial do lead não é exposto.
    assert body == {"data": {"received": True}}

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


def test_deeply_nested_json_is_rejected_as_invalid_json(client):
    # Cabe no limite de 256 KB, mas estoura a recursão do parser de JSON.
    depth = 100_000
    resp = client.post(
        "/api/leads",
        data="[" * depth + "]" * depth,
        content_type="application/json",
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_json"}
    assert Lead.query.count() == 0


def test_deeply_nested_json_inside_a_field_is_rejected(client):
    depth = 50_000
    body = '{"name": "Joana da Silva", "phone": "11912345678", "consent": true, "message": ' + (
        "[" * depth + "]" * depth
    ) + "}"

    resp = client.post("/api/leads", data=body, content_type="application/json")

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_json"}
    assert Lead.query.count() == 0


# ------------------------------- aviso por e-mail sem dados pessoais (LGPD) --

# Valores que não aparecem em nenhum texto fixo do aviso, para que achá-los
# na mensagem só possa significar vazamento do campo.
PII_PAYLOAD = {
    "name": "Zuleica Quaresma Xavier",
    "phone": "(63) 98877-6655",
    "email": "zuleica.quaresma@clientela.example",
    "area": "Aposentadoria",
    "message": "Meu benefício de pensão foi negado em março.",
    "consent": True,
    "website": "",
}
PII_FRAGMENTS = (
    "Zuleica", "Quaresma", "Xavier",
    "98877", "6655", "63988776655",
    "zuleica.quaresma", "clientela.example",
    "Aposentadoria",
    "benefício", "pensão", "negado", "março",
)


class _RecordingSMTP:
    sent: list = []

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        pass

    def login(self, username, password):
        pass

    def send_message(self, msg):
        _RecordingSMTP.sent.append(msg)


def _post_lead_and_capture_email(client, app, monkeypatch):
    from app.extensions import db
    from app.services import email as email_service

    _RecordingSMTP.sent = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)
    app.config.update(
        MAIL_SERVER="smtp.example.com",
        MAIL_USE_TLS=True,
        MAIL_USERNAME="avisos@escritorio.example",
        MAIL_PASSWORD="p",
        MAIL_TO="recepcao@escritorio.example",
    )
    # Empurra o autoincremento para um id que não se confunde com outros
    # números do texto (o lead do POST será o 4217).
    db.session.add(Lead(id=4216, name="Anterior", phone="11912345678", consent=True))
    db.session.commit()

    resp = client.post("/api/leads", json=PII_PAYLOAD)

    assert resp.status_code == 201
    assert len(_RecordingSMTP.sent) == 1
    return _RecordingSMTP.sent[0]


def test_notification_email_carries_no_lead_data(client, app, monkeypatch):
    msg = _post_lead_and_capture_email(client, app, monkeypatch)

    # O lead foi salvo com os dados - eles só não saem por e-mail.
    assert Lead.query.filter_by(id=4217).one().name == PII_PAYLOAD["name"]

    # Tudo o que o destinatário recebe: cada header decodificado, o corpo
    # decodificado e os bytes crus (pega dado escondido em codificação).
    haystacks = [f"{name}: {value}" for name, value in msg.items()]
    haystacks.append(msg.get_content())
    haystacks.append(msg.as_bytes().decode("utf-8", errors="replace"))
    for text in haystacks:
        for fragment in PII_FRAGMENTS:
            assert fragment.lower() not in text.lower()

    assert msg["Reply-To"] is None
    assert msg["Cc"] is None and msg["Bcc"] is None
    assert msg["To"] == "recepcao@escritorio.example"
    assert msg["From"] == "avisos@escritorio.example"


def test_notification_email_identifies_the_lead_by_id_and_time(app):
    from datetime import datetime

    from app.services.email import build_new_lead_message

    lead = Lead(
        id=4217,
        name=PII_PAYLOAD["name"],
        phone="63988776655",
        consent=True,
        # Sem tzinfo e em UTC, como volta do banco: 17:32 UTC = 14:32 em Brasília.
        created_at=datetime(2026, 10, 9, 17, 32),
    )

    msg = build_new_lead_message(lead)

    assert msg["Subject"] == "Novo contato recebido pelo site (nº 4217)"
    assert msg.get_content() == (
        "Um novo contato chegou pelo formulário do site.\n\n"
        "Número do contato: 4217\n"
        "Recebido em: 09/10/2026 às 14:32 (horário de Brasília)\n\n"
        "Por segurança, os dados da pessoa não são enviados por e-mail.\n"
        "Para ver o contato, entre no painel administrativo do site e abra\n"
        'a seção "Leads".\n\n'
        "Esta é uma mensagem automática; não responda a este e-mail.\n"
    )


def test_no_email_is_attempted_without_mail_server(client, app, monkeypatch):
    from app.services import email as email_service

    def _fail(*args, **kwargs):
        raise AssertionError("SMTP não deveria ser aberto sem MAIL_SERVER")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _fail)
    app.config.update(MAIL_SERVER="")

    assert client.post("/api/leads", json=PII_PAYLOAD).status_code == 201
    assert Lead.query.count() == 1


def test_email_failure_does_not_break_lead_capture_nor_log_lead_data(client, app, monkeypatch, caplog):
    from app.services import email as email_service

    def _boom(*args, **kwargs):
        raise OSError("servidor SMTP fora do ar")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _boom)
    app.config.update(MAIL_SERVER="smtp.example.com", MAIL_USE_TLS=True, MAIL_USERNAME=None)

    with caplog.at_level("DEBUG"):
        resp = client.post("/api/leads", json=PII_PAYLOAD)

    assert resp.status_code == 201
    assert resp.get_json() == {"data": {"received": True}}
    assert Lead.query.count() == 1
    assert "Falha ao enviar notificação de novo lead" in caplog.text
    for fragment in PII_FRAGMENTS:
        assert fragment.lower() not in caplog.text.lower()
