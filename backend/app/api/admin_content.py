from flask import Blueprint, request
from marshmallow import ValidationError

from ..extensions import db
from ..models import Faq, Lead, Service, Testimonial
from ..schemas.faq import FaqSchema
from ..schemas.service import ServiceSchema
from ..schemas.testimonial import TestimonialSchema
from ..utils.auth import require_admin

bp = Blueprint("admin_content", __name__, url_prefix="/api/admin")

service_schema = ServiceSchema()
testimonial_schema = TestimonialSchema()
faq_schema = FaqSchema()


def _apply_partial(instance, loaded: dict, raw_payload: dict, field_names: tuple[str, ...]) -> None:
    """Aplica só os campos que o cliente de fato mandou no body (`raw_payload`),
    usando o valor já validado/sanitizado em `loaded`. Isso evita que
    `load_default` (ex.: `order=0`, `icon="briefcase"`) sobrescreva campos
    existentes que simplesmente não vieram no PUT parcial.
    """
    for field_name in field_names:
        if field_name in raw_payload:
            setattr(instance, field_name, loaded[field_name])


# ---------------------------------------------------------------- services --

@bp.get("/services")
@require_admin
def list_services():
    services = Service.query.order_by(Service.order.asc()).all()
    return {"data": [s.to_dict() for s in services]}, 200


@bp.post("/services")
@require_admin
def create_service():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = service_schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    if Service.query.filter_by(slug=data["slug"]).first() is not None:
        return {"error": "slug_already_exists"}, 400

    service = Service(**data)
    db.session.add(service)
    db.session.commit()
    return {"data": service.to_dict()}, 201


@bp.put("/services/<int:service_id>")
@require_admin
def update_service(service_id):
    service = db.session.get(Service, service_id)
    if service is None:
        return {"error": "not_found"}, 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = service_schema.load(payload, partial=True)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    if "slug" in payload and data["slug"] != service.slug:
        clash = Service.query.filter(Service.slug == data["slug"], Service.id != service.id).first()
        if clash is not None:
            return {"error": "slug_already_exists"}, 400

    _apply_partial(service, data, payload, ("slug", "title", "icon", "description", "order"))
    db.session.commit()
    return {"data": service.to_dict()}, 200


@bp.delete("/services/<int:service_id>")
@require_admin
def delete_service(service_id):
    service = db.session.get(Service, service_id)
    if service is None:
        return {"error": "not_found"}, 404

    db.session.delete(service)
    db.session.commit()
    return "", 204


# ----------------------------------------------------------- testimonials --

@bp.get("/testimonials")
@require_admin
def list_testimonials():
    testimonials = Testimonial.query.order_by(Testimonial.created_at.desc()).all()
    return {"data": [t.to_admin_dict() for t in testimonials]}, 200


@bp.post("/testimonials")
@require_admin
def create_testimonial():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = testimonial_schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    testimonial = Testimonial(**data)
    db.session.add(testimonial)
    db.session.commit()
    return {"data": testimonial.to_admin_dict()}, 201


@bp.put("/testimonials/<int:testimonial_id>")
@require_admin
def update_testimonial(testimonial_id):
    testimonial = db.session.get(Testimonial, testimonial_id)
    if testimonial is None:
        return {"error": "not_found"}, 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = testimonial_schema.load(payload, partial=True)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    _apply_partial(testimonial, data, payload, ("author", "role", "content", "rating", "approved"))
    db.session.commit()
    return {"data": testimonial.to_admin_dict()}, 200


@bp.delete("/testimonials/<int:testimonial_id>")
@require_admin
def delete_testimonial(testimonial_id):
    testimonial = db.session.get(Testimonial, testimonial_id)
    if testimonial is None:
        return {"error": "not_found"}, 404

    db.session.delete(testimonial)
    db.session.commit()
    return "", 204


# ------------------------------------------------------------------ faqs --

@bp.get("/faqs")
@require_admin
def list_faqs():
    faqs = Faq.query.order_by(Faq.order.asc()).all()
    return {"data": [f.to_admin_dict() for f in faqs]}, 200


@bp.post("/faqs")
@require_admin
def create_faq():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = faq_schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    faq = Faq(**data)
    db.session.add(faq)
    db.session.commit()
    return {"data": faq.to_admin_dict()}, 201


@bp.put("/faqs/<int:faq_id>")
@require_admin
def update_faq(faq_id):
    faq = db.session.get(Faq, faq_id)
    if faq is None:
        return {"error": "not_found"}, 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = faq_schema.load(payload, partial=True)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    _apply_partial(faq, data, payload, ("question", "answer", "order"))
    db.session.commit()
    return {"data": faq.to_admin_dict()}, 200


@bp.delete("/faqs/<int:faq_id>")
@require_admin
def delete_faq(faq_id):
    faq = db.session.get(Faq, faq_id)
    if faq is None:
        return {"error": "not_found"}, 404

    db.session.delete(faq)
    db.session.commit()
    return "", 204


# ----------------------------------------------------------------- leads --

@bp.get("/leads")
@require_admin
def list_leads():
    leads = Lead.query.order_by(Lead.created_at.desc()).all()
    return {"data": [lead.to_dict() for lead in leads]}, 200


@bp.delete("/leads/<int:lead_id>")
@require_admin
def delete_lead(lead_id):
    # Só leitura/exclusão - nunca criação/edição, já que um lead é o que o
    # visitante enviou. Suporta pedido de exclusão LGPD.
    lead = db.session.get(Lead, lead_id)
    if lead is None:
        return {"error": "not_found"}, 404

    db.session.delete(lead)
    db.session.commit()
    return "", 204
