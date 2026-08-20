from flask import Blueprint, current_app, request
from marshmallow import ValidationError

from ..extensions import db, limiter
from ..models import Lead
from ..schemas.lead import LeadSchema
from ..services.email import notify_new_lead

bp = Blueprint("leads", __name__, url_prefix="/api")
schema = LeadSchema()


@bp.post("/leads")
@limiter.limit("5 per minute")
def create_lead():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    # Honeypot: bots preenchem campos ocultos que humanos não veem. Não
    # damos nenhuma pista de que foi detectado: resposta 200 "de sucesso"
    # e nada é persistido nem enviado por e-mail.
    if str(payload.get("website") or "").strip():
        return {"data": {"received": True}}, 200

    try:
        data = schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    # `consent` já é validado como obrigatório e == True pelo schema
    # (LeadSchema.consent), mas a garantia "de negócio" de fato mora aqui:
    # nunca persistimos um lead sem o aceite LGPD.
    lead = Lead(
        name=data["name"],
        phone=data["phone"],
        email=data.get("email"),
        area=data.get("area"),
        message=data.get("message"),
        consent=True,
    )
    db.session.add(lead)
    db.session.commit()

    try:
        notify_new_lead(lead)
    except Exception:  # não falha a requisição por causa do e-mail
        current_app.logger.exception("Falha ao enviar notificação de novo lead #%s", lead.id)

    return {"data": {"id": lead.id, "received": True}}, 201
