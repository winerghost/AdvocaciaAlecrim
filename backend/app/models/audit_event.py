from datetime import datetime, timezone

from ..extensions import db


class AuditEvent(db.Model):
    """Trilha de auditoria do painel, consultável em Configurações >
    Atividade. Só inserção: nenhuma rota edita ou apaga linhas; o expurgo
    por idade roda no `purge_leads.py` (AUDIT_RETENTION_DAYS).

    NUNCA gravar conteúdo de lead, senha, código, token ou e-mail digitado
    por quem não está autenticado - `detail` leva só ids, contagens e
    motivos (ver app/utils/audit.py). IP e navegador são dados pessoais do
    admin: por isso o prazo de retenção.

    Tabela nova: nasce sozinha pelo `db.create_all()` do entrypoint.
    """

    __tablename__ = "audit_events"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(
        db.DateTime, nullable=False, index=True, default=lambda: datetime.now(timezone.utc)
    )
    event = db.Column(db.String(64), nullable=False, index=True)
    # Admin que fez (ou em cuja conta aconteceu). Sem FK: excluir o admin
    # não pode apagar a trilha do que ele fez.
    actor_id = db.Column(db.Integer, nullable=True, index=True)
    target = db.Column(db.String(64), nullable=True)
    detail = db.Column(db.JSON, nullable=True)
    ip = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(200), nullable=True)

    def to_dict(self) -> dict:
        created_at = self.created_at
        if created_at is not None and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return {
            "id": self.id,
            "created_at": created_at.isoformat() if created_at else None,
            "event": self.event,
            "actor_id": self.actor_id,
            "target": self.target,
            "detail": self.detail or {},
            "ip": self.ip,
            "user_agent": self.user_agent,
        }
