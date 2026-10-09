"""Checagens de segredos feitas no boot (`create_app`) e no `seed.py`.

A regra geral: um valor que já apareceu em arquivo versionado (default
antigo do código, placeholders dos `.env.example`) é público - usá-lo como
segredo equivale a não ter segredo. Essas funções só DIZEM qual é o problema
(texto pronto para mensagem de erro); quem chama decide se derruba o boot.

Nenhuma delas devolve, loga ou embute o valor do segredo na mensagem.
"""

import os

from sqlalchemy.engine import make_url

# Todo valor "de exemplo" que existe (ou já existiu) em arquivo versionado:
# default antigo de config.py, backend/.env.example e .env.example da raiz.
# Uma lista só, usada para SECRET_KEY, senha do banco e senha do admin
# inicial: copiar o placeholder de um campo para outro é igualmente inseguro.
KNOWN_PLACEHOLDERS = frozenset(
    {
        "change-me-in-production",
        "troque-por-uma-chave-aleatoria-longa",
        "troque-por-uma-senha-forte",
        "troque-a-senha",
    }
)

# E-mail de exemplo de backend/.env.example (ADMIN_EMAIL).
PLACEHOLDER_ADMIN_EMAILS = frozenset({"admin@example.com"})

MIN_SECRET_KEY_LENGTH = 32

# Barra chaves triviais do tipo "aaaa...a" ou "abcabcabc...", que passam no
# tamanho mínimo sem ter nada de aleatório. De propósito NÃO é um medidor de
# entropia: uma chave aleatória de verdade com 32+ caracteres (hex, base64,
# urlsafe) tem muito mais que 8 caracteres distintos, então nunca é recusada.
MIN_SECRET_KEY_DISTINCT_CHARS = 8

# Único opt-in para tolerar segredo fraco/de exemplo: FLASK_ENV dizendo
# explicitamente que NÃO é produção. Ausente, vazio, "production" ou qualquer
# outro valor = regime estrito (o boot falha).
INSECURE_ALLOWED_FLASK_ENVS = frozenset({"development", "testing"})


def insecure_config_allowed() -> bool:
    """`True` só com `FLASK_ENV=development` ou `FLASK_ENV=testing`."""
    return os.environ.get("FLASK_ENV", "").strip().lower() in INSECURE_ALLOWED_FLASK_ENVS


def is_known_placeholder(value) -> bool:
    return isinstance(value, str) and value.strip().lower() in KNOWN_PLACEHOLDERS


def secret_key_problem(secret_key) -> str | None:
    """Motivo pelo qual a `SECRET_KEY` não serve, ou `None` se está ok."""
    if not isinstance(secret_key, str) or not secret_key:
        return "não está definida"
    if is_known_placeholder(secret_key):
        return "está usando um valor de exemplo (público)"
    if len(secret_key) < MIN_SECRET_KEY_LENGTH:
        return f"tem menos de {MIN_SECRET_KEY_LENGTH} caracteres"
    if len(set(secret_key)) < MIN_SECRET_KEY_DISTINCT_CHARS:
        return (
            f"é trivial (menos de {MIN_SECRET_KEY_DISTINCT_CHARS} caracteres "
            "distintos)"
        )
    return None


def database_url_has_placeholder_password(database_url) -> bool:
    """`True` se a senha embutida na URL do banco é um placeholder versionado.

    URL sem senha (ex.: o SQLite de dev/testes) ou que nem dá para
    interpretar devolve `False` - essa checagem só existe para barrar o
    valor de exemplo; URL inválida é problema do SQLAlchemy, que reclama
    por conta própria logo adiante.
    """
    if not isinstance(database_url, str) or not database_url:
        return False
    try:
        password = make_url(database_url).password
    except Exception:
        return False
    return is_known_placeholder(password)
