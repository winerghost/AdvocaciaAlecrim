from datetime import datetime, timezone

from ..extensions import db


class Lead(db.Model):
    __tablename__ = "leads"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    area = db.Column(db.String(80), nullable=True)
    message = db.Column(db.Text, nullable=True)
    consent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "area": self.area,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
