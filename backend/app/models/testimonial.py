from datetime import datetime, timezone

from ..extensions import db


class Testimonial(db.Model):
    __tablename__ = "testimonials"

    id = db.Column(db.Integer, primary_key=True)
    author = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(120), default="Cliente")
    content = db.Column(db.Text, nullable=False)
    rating = db.Column(db.Integer, default=5)
    approved = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "author": self.author,
            "role": self.role,
            "content": self.content,
            "rating": self.rating,
        }
