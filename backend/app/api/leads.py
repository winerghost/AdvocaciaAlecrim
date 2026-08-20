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
    payload = request.get_json(silent=True) or {}

    # Honeypot: bots preenchem campos ocultos que humanos não veem.
    if payload.get("website"):
        return {"data": {"received": True}}, 201

    try:
        data = schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    if not data.get("consent"):
        return {
            "error": "validation_error",
            "details": {"consent": ["É necessário aceitar o uso dos dados (LGPD)."]},
        }, 400

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
