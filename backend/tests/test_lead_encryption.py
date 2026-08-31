"""Confirma que EncryptedText (app/utils/crypto.py) está de fato
criptografando em repouso, não só "parecendo" funcionar porque o ORM
descriptografa tudo de volta de forma transparente."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from sqlalchemy import text

from app.models import Lead
from purge_leads import find_expired_leads, run as run_purge

PLAIN_PHONE = "11987654321"
PLAIN_EMAIL = "joana@example.com"
PLAIN_NAME = "Joana da Silva Muito Específica"


def test_raw_db_value_is_not_plaintext(app):
    from app.extensions import db

    lead = Lead(name=PLAIN_NAME, phone=PLAIN_PHONE, email=PLAIN_EMAIL, consent=True)
    db.session.add(lead)
    db.session.commit()
    lead_id = lead.id

    # SQL cru bypassa o TypeDecorator (que só atua quando o SQLAlchemy Core
    # conhece o tipo da coluna) - é o valor que realmente está gravado no
    # banco, exatamente como um `pg_dump`/acesso direto ao Postgres veria.
    row = db.session.execute(
        text("SELECT name, phone, email FROM leads WHERE id = :id"), {"id": lead_id}
    ).one()

    assert row.name != PLAIN_NAME
    assert row.phone != PLAIN_PHONE
    assert row.email != PLAIN_EMAIL
    assert PLAIN_PHONE not in row.phone
    assert PLAIN_NAME not in row.name


def test_orm_read_decrypts_transparently(app):
    from app.extensions import db

    lead = Lead(name=PLAIN_NAME, phone=PLAIN_PHONE, email=PLAIN_EMAIL, consent=True)
    db.session.add(lead)
    db.session.commit()
    lead_id = lead.id

    db.session.expire_all()  # força reler do banco, não usar o objeto em memória
    reloaded = db.session.get(Lead, lead_id)

    assert reloaded.name == PLAIN_NAME
    assert reloaded.phone == PLAIN_PHONE
    assert reloaded.email == PLAIN_EMAIL


def test_null_email_stays_null_not_encrypted_empty_string(app):
    from app.extensions import db

    lead = Lead(name=PLAIN_NAME, phone=PLAIN_PHONE, email=None, consent=True)
    db.session.add(lead)
    db.session.commit()

    row = db.session.execute(
        text("SELECT email FROM leads WHERE id = :id"), {"id": lead.id}
    ).one()
    assert row.email is None


def test_wrong_key_fails_to_decrypt_without_crashing(app):
    """Se a FIELD_ENCRYPTION_KEY for trocada sem migrar os dados antigos,
    ler um lead gravado com a chave anterior não deve derrubar a
    aplicação - deve voltar None pro campo (ver InvalidToken em
    app/utils/crypto.py)."""
    from app.extensions import db

    lead = Lead(name=PLAIN_NAME, phone=PLAIN_PHONE, consent=True)
    db.session.add(lead)
    db.session.commit()
    lead_id = lead.id

    # Troca a chave em runtime no mesmo app/banco (mais simples e robusto
    # do que subir outro app inteiro contra o mesmo sqlite em memória, que
    # não é compartilhável entre duas engines diferentes).
    original_key = app.config["FIELD_ENCRYPTION_KEY"]
    try:
        app.config["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
        db.session.expire_all()
        reloaded = db.session.get(Lead, lead_id)
        assert reloaded.phone is None
        assert reloaded.name is None
    finally:
        app.config["FIELD_ENCRYPTION_KEY"] = original_key
        db.session.expire_all()


# ------------------------------------------------------------- purge_leads --

def _make_lead(db, status: str, days_old: int) -> Lead:
    lead = Lead(name=PLAIN_NAME, phone=PLAIN_PHONE, consent=True, status=status)
    db.session.add(lead)
    db.session.commit()
    # created_at tem default na criação - sobrescreve depois do insert pra
    # simular um lead antigo sem esperar o tempo de verdade passar.
    lead.created_at = datetime.now(timezone.utc) - timedelta(days=days_old)
    db.session.commit()
    return lead


def test_purge_skips_converted_leads_regardless_of_age(app):
    from app.extensions import db

    kept = _make_lead(db, status="convertido", days_old=400)
    _make_lead(db, status="novo", days_old=400)

    expired_ids = {lead.id for lead in find_expired_leads(retention_days=180)}

    assert kept.id not in expired_ids


def test_purge_skips_recent_leads(app):
    from app.extensions import db

    recent = _make_lead(db, status="novo", days_old=5)

    expired_ids = {lead.id for lead in find_expired_leads(retention_days=180)}

    assert recent.id not in expired_ids


def test_purge_deletes_old_non_converted_leads(app):
    from app.extensions import db

    old = _make_lead(db, status="descartado", days_old=200)
    kept = _make_lead(db, status="convertido", days_old=200)
    # Captura os IDs ANTES do purge: depois que `old` for de fato apagado
    # e a sessão expirar os objetos no commit, acessar `old.id` de novo
    # levantaria ObjectDeletedError em vez de devolver o valor já conhecido.
    old_id, kept_id = old.id, kept.id

    deleted_count = run_purge(dry_run=False, app=app)

    # `run_purge` empurra seu próprio app-context (`with app.app_context():`
    # dentro de purge_leads.run) - o Flask-SQLAlchemy escopa a sessão por
    # contexto, então isso usa uma Session diferente da do teste, que só
    # sabe do delete depois de expirar seu cache local. Em produção isso
    # nem existe: `purge_leads.py` roda como processo separado (cron),
    # nunca dividindo memória com o processo do servidor web.
    db.session.expire_all()

    assert deleted_count == 1
    assert db.session.get(Lead, old_id) is None
    assert db.session.get(Lead, kept_id) is not None


def test_purge_dry_run_does_not_delete(app):
    from app.extensions import db

    old = _make_lead(db, status="novo", days_old=200)
    old_id = old.id

    counted = run_purge(dry_run=True, app=app)

    assert counted == 1
    assert db.session.get(Lead, old_id) is not None
