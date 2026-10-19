from datetime import datetime, timezone

from ..extensions import db


class SiteSetting(db.Model):
    """Configurações editáveis pelo painel, uma linha por grupo ("site",
    "notifications"). `value` guarda SÓ o que o admin mudou: os defaults
    moram no código (app/services/site_settings.py), então a tabela vazia
    é um estado válido e o site continua igual a antes.

    Tabela nova: nasce sozinha pelo `db.create_all()` do entrypoint.
    """

    __tablename__ = "site_settings"

    key = db.Column(db.String(64), primary_key=True)
    value = db.Column(db.JSON, nullable=False, default=dict)
    # Sem FK de propósito: excluir um admin não pode apagar nem travar a
    # configuração que ele salvou.
    updated_by_id = db.Column(db.Integer, nullable=True)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
