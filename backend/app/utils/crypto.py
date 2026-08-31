"""Criptografia de campos sensíveis em repouso (LGPD).

`EncryptedText` é um tipo de coluna SQLAlchemy que criptografa o valor antes
de gravar no banco e descriptografa ao ler - de forma transparente pro
resto do código (`lead.phone` continua sendo uma string normal em memória;
só o que fica gravado no Postgres é ciphertext). Usa Fernet (`cryptography`
lib): AES-128-CBC + HMAC-SHA256 autenticado, com timestamp embutido.

Por que só alguns campos e não a tabela inteira: campos usados em queries/
filtros (ex. `Lead.status`, `Lead.created_at`, usados por `purge_leads.py`)
precisam continuar pesquisáveis pelo Postgres, o que criptografia a nível de
coluna simples (sem índice determinístico) não permite - por isso só os
campos de texto livre/PII (`name`, `phone`, `email`, `message`) usam
`EncryptedText`, nunca campos usados em `WHERE`/`ORDER BY`.
"""

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


def cipher() -> Fernet:
    """Instancia o Fernet a partir da config do app atual (não cacheia o
    objeto Fernet num nível de módulo porque isso prenderia a chave da
    primeira app criada - relevante em testes, que criam vários `app` com
    chaves de teste diferentes)."""
    key = current_app.config["FIELD_ENCRYPTION_KEY"]
    return Fernet(key)


class EncryptedText(TypeDecorator):
    """Coluna de texto criptografada em repouso. `NULL` passa direto (não
    criptografa ausência de valor - `Lead.email` é opcional)."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return cipher().encrypt(value.encode("utf-8")).decode("utf-8")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return cipher().decrypt(value.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            # Chave errada/rotacionada, ou dado corrompido - nunca deixa o
            # ciphertext bruto vazar pra fora nem derruba a request inteira
            # só porque 1 registro específico ficou ilegível.
            return None
