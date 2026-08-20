from datetime import datetime, timezone

from ..extensions import db


class AdminUser(db.Model):
    """Único usuário administrador do painel (`/admin`). Não é multiusuário -
    o bootstrap (`seed.py`) só cria uma linha aqui, e não há rota de
    cadastro/registro exposta pela API.
    """

    __tablename__ = "admin_users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        # NUNCA serializar password_hash, mesmo em rotas administrativas.
        return {"email": self.email}
