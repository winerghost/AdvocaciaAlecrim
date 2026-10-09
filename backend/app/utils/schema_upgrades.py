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
)


def apply_schema_upgrades() -> list[str]:
    """Adiciona as colunas de `_MISSING_COLUMNS` que ainda não existem.

    Devolve o que foi alterado, como `["admin_users.token_version"]` (lista
    vazia = banco já estava em dia). Precisa de um app context ativo.
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
    return applied
