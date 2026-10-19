"""Expurgo de retenção de leads (LGPD).

Apaga leads que NÃO estão marcados como "convertido" (ver
`app/models/lead.py::LEAD_STATUSES`) e que passaram de
`LEAD_RETENTION_DAYS` (padrão 180 dias, configurável em `backend/.env`) —
um lead marcado "convertido" no painel `/admin` nunca é apagado
automaticamente, independente da idade.

Não roda sozinho: precisa de um agendador externo (cron na VPS). Ver
`DEPLOY-HOSTINGER.md` pro exemplo de crontab.

Uso:
    python purge_leads.py            # apaga de verdade
    python purge_leads.py --dry-run  # só mostra quantos/quais seriam apagados
    # ou, com o compose já rodando:
    docker compose exec backend python purge_leads.py
"""

import argparse
from datetime import datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import AuditEvent, Lead
from app.models.lead import LEAD_STATUSES

assert "convertido" in LEAD_STATUSES  # documenta a premissa do filtro abaixo


def _cutoff(retention_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=retention_days)


def find_expired_leads(retention_days: int):
    """Retorna a query (não executada ainda) dos leads elegíveis pro
    expurgo - separado de `run()` pra ser testável sem precisar apagar de
    verdade."""
    return Lead.query.filter(
        Lead.status != "convertido",
        Lead.created_at < _cutoff(retention_days),
    )


def purge_old_audit_events(retention_days: int, dry_run: bool = False) -> int:
    """Apaga a trilha de auditoria (IP/navegador dos admins) mais velha que
    AUDIT_RETENTION_DAYS. Roda no mesmo cron dos leads."""
    query = AuditEvent.query.filter(AuditEvent.created_at < _cutoff(retention_days))
    count = query.count()
    if count and not dry_run:
        query.delete(synchronize_session=False)
        db.session.commit()
    prefix = "[dry-run] " if dry_run else ""
    print(f"{prefix}Auditoria: {count} evento(s) com mais de {retention_days} dias.")
    return count


def run(dry_run: bool = False, app=None) -> int:
    # `app` é injetável só pra testes (que já têm um app de teste com banco
    # em memória e chave de criptografia fixas) - em uso real (CLI/cron)
    # sempre cria um app de verdade via create_app().
    app = app or create_app()
    with app.app_context():
        purge_old_audit_events(app.config["AUDIT_RETENTION_DAYS"], dry_run=dry_run)

        retention_days = app.config["LEAD_RETENTION_DAYS"]
        expired = find_expired_leads(retention_days).all()
        count = len(expired)

        if count == 0:
            print(f"Nenhum lead elegível pro expurgo (retenção: {retention_days} dias).")
            return 0

        if dry_run:
            print(
                f"[dry-run] {count} lead(s) seriam apagados "
                f"(status != 'convertido', criados há mais de {retention_days} dias). "
                "IDs: " + ", ".join(str(lead.id) for lead in expired)
            )
            return count

        # IDs só (nunca nome/telefone/e-mail/mensagem) — mesmo padrão de
        # log já usado em app/api/leads.py, nada de PII em texto claro no
        # log da aplicação.
        ids = [lead.id for lead in expired]
        for lead in expired:
            db.session.delete(lead)
        db.session.commit()
        print(f"Expurgo: {count} lead(s) apagados (retenção: {retention_days} dias). IDs: {ids}")
        return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só mostra o que seria apagado, sem apagar de verdade.",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)
