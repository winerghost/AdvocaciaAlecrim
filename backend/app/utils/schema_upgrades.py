"""Ajustes de schema aplicados sozinhos a cada boot (entrypoint.sh e seed.py).

O schema deste projeto nasce de `db.create_all()`, que cria tabela que
falta mas NUNCA altera uma que já existe. Coluna nova em tabela antiga
(caso do banco de produção) precisa entrar por aqui - sem SQL manual na VPS.

Regras para tudo neste arquivo:
- idempotente: roda em todo boot, e a segunda vez não faz nada;
- seguro em banco vazio: se a tabela nem existe, quem cria é o
  `create_all()` (já com a coluna), e aqui não há o que fazer;
- só o que funciona igual em PostgreSQL (produção) e SQLite (dev/testes):
  olha as colunas pelo inspector em vez de depender de
  `ADD COLUMN IF NOT EXISTS`, que o SQLite não tem.
"""

from sqlalchemy import inspect, text

from ..extensions import db

# (tabela, coluna, DDL da coluna). O DDL precisa valer em PostgreSQL e em
# SQLite; `NOT NULL` com `DEFAULT` constante preenche as linhas existentes
# nos dois. Nomes fixos do código - nunca entra dado de fora neste SQL.
_MISSING_COLUMNS = (
    # Versão do token de sessão do admin - ver utils/auth.py (logout).
    ("admin_users", "token_version", "INTEGER NOT NULL DEFAULT 0"),
    # Andamento do lead - banco anterior ao painel de leads não tinha.
    ("leads", "status", "VARCHAR(20) NOT NULL DEFAULT 'novo'"),
)

# Campos de `Lead` que viraram `EncryptedText` (Text). Em banco anterior à
# criptografia são VARCHAR curtos, e o ciphertext (maior que o texto) não
# cabe neles.
_LEAD_ENCRYPTED_COLUMNS = ("name", "phone", "email", "message")

# Todo token Fernet começa com a versão (0x80) + timestamp em base64url, o
# que dá sempre este prefixo. Serve para separar linha já criptografada de
# linha legada em texto claro SEM tentar decifrar (uma linha cifrada com
# outra chave seria confundida com texto claro e cifrada de novo).
_FERNET_PREFIX = "gAAAAA"


def apply_schema_upgrades() -> list[str]:
    """Adiciona as colunas de `_MISSING_COLUMNS` que ainda não existem.

    Também alarga as colunas de `leads` e criptografa leads antigos em texto
    claro. Devolve o que foi alterado, como `["admin_users.token_version"]`
    (lista vazia = banco já estava em dia). Precisa de um app context ativo.
    """
    applied = []
    for table, column, ddl in _MISSING_COLUMNS:
        # Inspector novo a cada item: ele guarda cache do que já leu.
        inspector = inspect(db.engine)
        if not inspector.has_table(table):
            continue
        if column in {c["name"] for c in inspector.get_columns(table)}:
            continue
        with db.engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        applied.append(f"{table}.{column}")

    # Ordem importa: primeiro cabe o ciphertext, depois ele é gravado.
    applied.extend(_widen_lead_columns())
    converted = _encrypt_plaintext_leads()
    if converted:
        applied.append(f"leads: {converted} linha(s) criptografada(s)")
    return applied


def _widen_lead_columns() -> list[str]:
    """`leads.name/phone/email/message` de VARCHAR(n) para TEXT.

    Só PostgreSQL: o SQLite não aplica o tamanho do VARCHAR e nem tem
    `ALTER COLUMN TYPE`.
    """
    if db.engine.dialect.name != "postgresql":
        return []
    inspector = inspect(db.engine)
    if not inspector.has_table("leads"):
        return []

    changed = []
    for column in inspector.get_columns("leads"):
        if column["name"] not in _LEAD_ENCRYPTED_COLUMNS:
            continue
        if getattr(column["type"], "length", None) is None:
            continue  # já é TEXT (ou sem limite)
        with db.engine.begin() as connection:
            connection.execute(
                text(f"ALTER TABLE leads ALTER COLUMN {column['name']} TYPE TEXT")
            )
        changed.append(f"leads.{column['name']} -> TEXT")
    return changed


def _encrypt_plaintext_leads() -> int:
    """Criptografa os leads gravados antes de `EncryptedText` existir.

    Lê/grava o valor bruto por SQL (o ORM tentaria decifrar). Linha que já
    é um token Fernet fica como está; roda de novo sem efeito. Devolve
    quantas linhas foram convertidas.
    """
    from .crypto import cipher

    inspector = inspect(db.engine)
    if not inspector.has_table("leads"):
        return 0
    present = {c["name"] for c in inspector.get_columns("leads")}
    columns = [c for c in _LEAD_ENCRYPTED_COLUMNS if c in present]
    if not columns:
        return 0

    fernet = cipher()
    converted = 0
    with db.engine.begin() as connection:
        rows = connection.execute(
            text(f"SELECT id, {', '.join(columns)} FROM leads")
        ).mappings().all()
        for row in rows:
            updates = {
                column: fernet.encrypt(row[column].encode("utf-8")).decode("utf-8")
                for column in columns
                if row[column] is not None and not row[column].startswith(_FERNET_PREFIX)
            }
            if not updates:
                continue
            assignments = ", ".join(f"{column} = :{column}" for column in updates)
            connection.execute(
                text(f"UPDATE leads SET {assignments} WHERE id = :id"),
                {**updates, "id": row["id"]},
            )
            converted += 1
    return converted
