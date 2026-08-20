#!/bin/sh
set -e

echo "Aplicando schema do banco (create_all)..."
python - <<'PY'
from app import create_app
from app.extensions import db

app = create_app()
with app.app_context():
    db.create_all()
PY

echo "Populando conteúdo inicial (idempotente, só insere se estiver vazio)..."
python seed.py

echo "Iniciando gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 3 --timeout 60 --access-logfile - wsgi:app
