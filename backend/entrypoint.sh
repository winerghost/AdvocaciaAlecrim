#!/bin/sh
set -e

echo "Aplicando schema do banco (create_all + colunas novas)..."
# create_all cria tabela que falta, mas nunca altera uma que já existe:
# coluna nova em tabela antiga entra por apply_schema_upgrades (idempotente,
# ver app/utils/schema_upgrades.py). Roda aqui, antes do seed e do gunicorn,
# para o app nunca atender request com o schema pela metade.
python - <<'PY'
from app import create_app
from app.extensions import db
from app.utils.schema_upgrades import apply_schema_upgrades

app = create_app()
with app.app_context():
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
exec gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 8 --timeout 60 --access-logfile - wsgi:app
