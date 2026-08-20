from flask import Blueprint

from ..models import Service, Testimonial

bp = Blueprint("content", __name__, url_prefix="/api")


@bp.get("/services")
def list_services():
    services = Service.query.order_by(Service.order.asc()).all()
    return {"data": [s.to_dict() for s in services]}


@bp.get("/testimonials")
def list_testimonials():
    testimonials = (
        Testimonial.query.filter_by(approved=True)
        .order_by(Testimonial.created_at.desc())
        .all()
    )
    return {"data": [t.to_dict() for t in testimonials]}
