from datetime import datetime, timezone

from ..extensions import db
from ..utils.crypto import EncryptedText

# "novo": acabou de chegar, ninguém tratou ainda (default).
# "em_contato": alguém do escritório já respondeu/está negociando.
# "convertido": virou cliente - nunca é expurgado automaticamente por
#   `purge_leads.py`, independente da idade.
# "descartado": não virou cliente e não vai virar (spam legítimo mas não
#   pego pelo honeypot, contato errado, desistência etc.) - elegível pra
#   expurgo como qualquer status que não seja "convertido".
LEAD_STATUSES = ("novo", "em_contato", "convertido", "descartado")


class Lead(db.Model):
    __tablename__ = "leads"

    id = db.Column(db.Integer, primary_key=True)
    # name/phone/email/message: PII do titular, criptografados em repouso
    # (ver app/utils/crypto.py) - LGPD, mitiga um dump do banco vazado
    # expor esses dados em texto claro. status/created_at ficam em texto
    # plano de propósito: são usados em filtro/ordenação (`purge_leads.py`,
    # listagem do painel) e não são PII por si só.
    name = db.Column(EncryptedText, nullable=False)
    phone = db.Column(EncryptedText, nullable=False)
    email = db.Column(EncryptedText, nullable=True)
    area = db.Column(db.String(80), nullable=True)
    message = db.Column(EncryptedText, nullable=True)
    consent = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(db.String(20), nullable=False, default="novo")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "area": self.area,
            "message": self.message,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
