"""Política de senha dos administradores - fonte única de verdade.

Usada por `POST /api/admin/users` (criar admin), `POST
/api/admin/change-password` (trocar a própria senha) e pelo `seed.py` (admin
inicial). Antes cada um conferia só o tamanho, e `aaaaaaaaaa` passava.

Vale só para senha NOVA: o hash de quem já tem conta não é reavaliado no
login - a regra pega na próxima troca.

De propósito não exige "uma maiúscula, um número, um símbolo": isso empurra
para `Senha@123` e não barra nada do que importa. O que se recusa aqui é o
que um atacante tenta primeiro - senha curta, repetição, sequência, o próprio
e-mail da conta e as senhas óbvias para este escritório.
"""

import re

MIN_PASSWORD_LENGTH = 12
# Teto de tamanho para qualquer senha recebida (login, senha atual, senha
# nova). Senha não passa por sanitize_text (alterar caracteres mudaria a
# credencial), então o limite é a única barreira: sem ele dava pra mandar
# centenas de KB a cada tentativa e fazer o servidor gastar CPU no hash.
MAX_PASSWORD_LENGTH = 128
# Barra `aaaaaaaaaaaa`, `abababababab`, `112211221122`... Maiúscula e
# minúscula contam como o mesmo caractere.
MIN_DISTINCT_CHARS = 5
# Parte local do e-mail mais curta que isso (ex.: "ana@...") não entra na
# checagem de "senha contém o e-mail": recusaria senhas boas por acaso.
MIN_EMAIL_FRAGMENT_LENGTH = 4

# Códigos de erro da API - os mesmos de antes, o frontend depende deles.
WEAK_PASSWORD = "weak_password"
PASSWORD_TOO_LONG = "password_too_long"

# Senhas comuns com 12+ caracteres (as mais curtas já caem no tamanho
# mínimo). Tudo em minúsculas: a comparação ignora maiúsculas/minúsculas.
COMMON_PASSWORDS = frozenset(
    {
        "1q2w3e4r5t6y",
        "1q2w3e4r5t6y7u",
        "1qaz2wsx3edc",
        "1qaz2wsx3edc4rfv",
        "q1w2e3r4t5y6",
        "zaq12wsxcde3",
        "qwerty123456",
        "qwertyuiop123",
        "qweasdzxc123",
        "asdfghjkl123",
        "123456123456",
        "123456654321",
        "123456789abc",
        "123456789012",
        "1234567890123",
        "112233445566",
        "121212121212",
        "abc123abc123",
        "abcd12345678",
        "password1234",
        "password12345",
        "passw0rd1234",
        "p@ssw0rd1234",
        "p@ssword1234",
        "iloveyou1234",
        "letmein12345",
        "welcome12345",
        "changeme1234",
        "trustno1trustno1",
        "senha1234567",
        "senha12345678",
        "senha123senha",
        "s3nh@1234567",
        "mudar1234567",
        "mudar@123456",
        "brasil123456",
        "advocacia123",
        "advocacia2025",
        "advocacia2026",
        "advocacia@2026",
        "alecrim12345",
        "alecrim@2026",
        "advocaciaalecrim",
        "dralecrim2026",
    }
)

# Palavras óbvias (genéricas e do contexto do escritório). A senha é
# recusada quando, tirando números e símbolos, sobra só uma delas - pega a
# família inteira `Advocacia2026`, `Alecrim@12345`, `senha_123456!`,
# `Admin#2026#2026` sem precisar listar cada ano/sufixo.
COMMON_BASE_WORDS = frozenset(
    {
        "senha",
        "senhas",
        "minhasenha",
        "novasenha",
        "senhaforte",
        "senhasegura",
        "senhaadmin",
        "senhadoadmin",
        "password",
        "passwd",
        "passe",
        "admin",
        "adm",
        "administrador",
        "administrator",
        "root",
        "usuario",
        "user",
        "login",
        "painel",
        "teste",
        "test",
        "mudar",
        "trocar",
        "troqueasenha",
        "changeme",
        "welcome",
        "bemvindo",
        "letmein",
        "iloveyou",
        "qwerty",
        "qwertyuiop",
        "asdfgh",
        "asdfghjkl",
        "abc",
        "abcd",
        "abcdef",
        "brasil",
        "brazil",
        "palmas",
        "tocantins",
        "palmasto",
        "advocacia",
        "advogado",
        "advogada",
        "advogados",
        "escritorio",
        "direito",
        "juridico",
        "justica",
        "alecrim",
        "dralecrim",
        "doutoralecrim",
        "advocaciaalecrim",
        "alecrimadvocacia",
        "alecrimadvogados",
    }
)

# Sequências "de teclado": qualquer senha que seja um trecho contínuo delas
# (ou delas ao contrário) é recusada - `123456789012`, `abcdefghijkl`,
# `qwertyuiopas`, `210987654321`...
_SEQUENCES = (
    "0123456789" * 13,
    "1234567890" * 13,
    "abcdefghijklmnopqrstuvwxyz" * 5,
    "qwertyuiopasdfghjklzxcvbnm" * 5,
    "qwertyuiop" * 13,
    "asdfghjkl" * 15,
)

_NON_LETTERS_RE = re.compile(r"[^a-z]+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def _is_sequence(lowered: str) -> bool:
    return any(lowered in seq or lowered[::-1] in seq for seq in _SEQUENCES)


def _email_fragments(email) -> set[str]:
    """Trechos do e-mail da conta que não podem aparecer na senha: o
    endereço inteiro, a parte antes do @ e essa parte sem pontuação
    (`dr.alecrim` -> `dralecrim`).
    """
    if not isinstance(email, str):
        return set()
    normalized = email.strip().lower()
    local = normalized.split("@", 1)[0]
    fragments = {normalized, local, _NON_ALNUM_RE.sub("", local)}
    return {f for f in fragments if len(f) >= MIN_EMAIL_FRAGMENT_LENGTH}


def password_problem(password, email=None) -> tuple[str, str] | None:
    """Por que `password` não serve como senha de admin, ou `None` se serve.

    Devolve `(código, motivo)`: o código é o erro da API (`weak_password` ou
    `password_too_long`); o motivo é um trecho em português que completa a
    frase "a senha ..." - usado pelo seed, nunca contém a senha.

    `email` é o e-mail da conta dona da senha (opcional).
    """
    if not isinstance(password, str):
        return WEAK_PASSWORD, "não é um texto"
    if len(password) < MIN_PASSWORD_LENGTH:
        return WEAK_PASSWORD, f"tem menos de {MIN_PASSWORD_LENGTH} caracteres"
    if len(password) > MAX_PASSWORD_LENGTH:
        return PASSWORD_TOO_LONG, f"tem mais de {MAX_PASSWORD_LENGTH} caracteres"
    if not password.strip():
        return WEAK_PASSWORD, "é só espaço em branco"

    lowered = password.lower()

    if len(set(lowered)) < MIN_DISTINCT_CHARS:
        return (
            WEAK_PASSWORD,
            f"é repetitiva (menos de {MIN_DISTINCT_CHARS} caracteres distintos)",
        )
    if _is_sequence(lowered):
        return WEAK_PASSWORD, "é uma sequência previsível"

    compact = _NON_ALNUM_RE.sub("", lowered)
    if any(f in lowered or f in compact for f in _email_fragments(email)):
        return WEAK_PASSWORD, "contém o e-mail da conta"

    if (
        lowered.strip() in COMMON_PASSWORDS
        or compact in COMMON_PASSWORDS
        or _NON_LETTERS_RE.sub("", lowered) in COMMON_BASE_WORDS
    ):
        return WEAK_PASSWORD, "é uma senha comum, fácil de adivinhar"

    return None
