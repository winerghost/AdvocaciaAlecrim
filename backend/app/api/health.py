from flask import Blueprint
from sqlalchemy import text

from ..extensions import db

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {"status": "ok", "database": db_status}
