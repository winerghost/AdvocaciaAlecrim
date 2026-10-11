#!/bin/sh
set -e

echo "Aplicando schema do banco (create_all + colunas novas)..."
# create_all cria tabela que falta, mas nunca altera uma que já existe:
# coluna nova em tabela antiga entra por apply_schema_upgrades (idempotente,
# ver app/utils/schema_upgrades.py). Roda aqui, antes do seed e do gunicorn,
# para o app nunca atender request com o schema pela metade.
python - <<'PY'
import sys
import time

from sqlalchemy import text

from app import create_app
from app.extensions import db
from app.utils.schema_upgrades import apply_schema_upgrades

app = create_app()
with app.app_context():
    # O compose já espera o healthcheck do db (depends_on: service_healthy),
    # mas fora dele (ou num restart do Postgres) o banco pode ainda não
    # aceitar conexões: tenta por até ~60 s antes de desistir.
    for tentativa in range(1, 31):
        try:
            db.session.execute(text("SELECT 1"))
            break
        except Exception as exc:
            db.session.rollback()
            if tentativa == 30:
                print(f"ERRO: banco indisponível: {exc.__class__.__name__}", file=sys.stderr)
                sys.exit(1)
            print(f"Aguardando o banco ({tentativa}/30)...")
            time.sleep(2)
    db.create_all()
    for change in apply_schema_upgrades():
        print(f"Schema: coluna {change} adicionada.")
PY

echo "Populando conteúdo inicial (idempotente, só insere se estiver vazio)..."
python seed.py

echo "Iniciando gunicorn..."
# 1 worker + threads (em vez de vários workers) - RATELIMIT_STORAGE_URI é
# "memory://" (ver config.py), que não é compartilhado entre processos.
# Com --workers 3, o limite de "5 per minute" em /api/leads virava até 15/min
# na prática (5 por worker, cada um com seu próprio contador) - confirmado
# empiricamente batendo o endpoint em sequência. Um processo só, com threads
# pra concorrência, mantém o contador único e o rate limit correto. Se o
# tráfego crescer a ponto de precisar de múltiplos workers/processos,
# trocar RATELIMIT_STORAGE_URI para Redis primeiro (ver AUDITORIA-SEGURANCA-PLANO.md, §3.4).
exec gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 8 --timeout 60 \
    --graceful-timeout 30 --worker-tmp-dir /dev/shm \
    --access-logfile - --error-logfile - wsgi:app
