from datetime import datetime, timezone

from ..extensions import db


def utcnow() -> datetime:
    """Agora em UTC, sem tzinfo - é assim que as colunas `DateTime` (sem
    timezone) guardam e devolvem o valor, tanto no Postgres quanto no SQLite
    dos testes. Manter tudo "naive em UTC" evita comparar datetime com e sem
    fuso.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


class Article(db.Model):
    __tablename__ = "articles"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(160), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    excerpt = db.Column(db.String(500), nullable=False, default="")
    # HTML já sanitizado por allowlist (utils/sanitize.py::sanitize_html)
    # antes de chegar aqui - nunca gravar HTML cru nesse campo.
    content = db.Column(db.Text, nullable=False)
    # Caminho de um upload do painel, ex.: "/api/media/<arquivo>".
    cover_image = db.Column(db.String(300), nullable=True)
    published = db.Column(db.Boolean, nullable=False, default=False)
    published_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self, *, include_content: bool = True) -> dict:
        """Formato único do artigo em todas as respostas. As listagens
        passam `include_content=False` para não trafegar o corpo inteiro de
        cada artigo.
        """
        data = {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "excerpt": self.excerpt or "",
            "cover_image": self.cover_image,
            "published": bool(self.published),
            "published_at": _iso_utc(self.published_at),
            "created_at": _iso_utc(self.created_at),
            "updated_at": _iso_utc(self.updated_at),
        }
        if include_content:
            data["content"] = self.content
        return data
