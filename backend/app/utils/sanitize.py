"""Sanitização de entrada de usuário — fonte única de verdade no backend.

O frontend (Next.js) só coleta os dados e dá feedback de UX (required,
type="email" etc.). Toda validação/sanitização "de verdade" acontece aqui,
antes de qualquer persistência ou uso em e-mail, para blindar contra:

- XSS armazenado (tags HTML em campos exibidos depois em um painel).
- Header injection em e-mail (\r/\n usados para forjar headers SMTP extras).
- Payloads absurdamente grandes / caracteres de controle inúteis.
"""

import re
import unicodedata

# Remove qualquer tag HTML (ex.: <script>, <img onerror=...>, <b>) mantendo
# apenas o texto entre elas. Não tentamos "consertar" o HTML, só eliminamos
# a possibilidade de uma tag ser interpretada por um navegador/painel depois.
_HTML_TAG_RE = re.compile(r"<[^>]*>")

# Caracteres de controle C0/C1 (exceto os espaços em branco "normais" que
# tratamos separadamente): nulos, escapes, etc. Nunca fazem sentido em texto
# de formulário e são um vetor clássico de log/header injection.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Quebras de linha (CR/LF) e tabs — usadas explicitamente para header
# injection em e-mail (Subject/From/To). Tratadas à parte pois alguns campos
# (mensagem) podem querer permitir quebras de linha "normais" no corpo, mas
# nunca em campos que viram header.
_CRLF_RE = re.compile(r"[\r\n]+")

# Espaços múltiplos (depois de já termos removido tabs/controles) viram um
# único espaço, e as pontas são aparadas.
_MULTI_SPACE_RE = re.compile(r"\s+")

# Aceita telefones BR em formatos comuns:
#   11987654321 / (11) 98765-4321 / 11 8765-4321 / +55 11 98765-4321
# Exige DDD (2 dígitos) + número de 8 ou 9 dígitos, com DDI opcional (+55/55).
_PHONE_DIGITS_RE = re.compile(r"^(?:55)?([1-9][0-9])(9?[0-9]{8})$")


def strip_html(value: str) -> str:
    """Remove tags HTML, deixando só o texto (neutraliza XSS armazenado)."""
    return _HTML_TAG_RE.sub("", value)


def strip_control_chars(value: str, *, allow_newline: bool = False) -> str:
    """Remove caracteres de controle. Por padrão remove CR/LF também
    (essencial para campos usados em headers de e-mail); quando
    ``allow_newline=True`` (ex.: mensagem, usada só no corpo do e-mail),
    normaliza CRLF/CR para LF e mantém quebras de linha simples.
    """
    value = _CONTROL_CHARS_RE.sub("", value)
    if allow_newline:
        # Normaliza \r\n e \r soltos para \n, mas nunca deixa \r sobrar.
        value = value.replace("\r\n", "\n").replace("\r", "\n")
    else:
        value = _CRLF_RE.sub(" ", value)
    return value


def sanitize_text(value: str, *, allow_newline: bool = False, collapse_spaces: bool = True) -> str:
    """Pipeline padrão de sanitização de texto vindo do usuário:
    normaliza unicode, remove HTML, remove caracteres de controle/CRLF
    (ou os normaliza, se ``allow_newline``) e apara espaços nas pontas.
    """
    if not isinstance(value, str):
        return value

    value = unicodedata.normalize("NFKC", value)
    value = strip_html(value)
    value = strip_control_chars(value, allow_newline=allow_newline)

    if collapse_spaces:
        if allow_newline:
            # Colapsa espaços/tabs dentro de cada linha, preservando as quebras.
            lines = [_MULTI_SPACE_RE.sub(" ", line).strip() for line in value.split("\n")]
            value = "\n".join(lines).strip()
        else:
            value = _MULTI_SPACE_RE.sub(" ", value).strip()

    return value


def header_safe(value: str) -> str:
    """Garante que um valor é seguro para uso em um header de e-mail
    (Subject/From/To) — remove qualquer CR/LF residual. Chamado de novo no
    momento de montar o e-mail (defesa em profundidade), mesmo que o valor
    já tenha passado pela sanitização de entrada.
    """
    if not isinstance(value, str):
        return value
    return _CRLF_RE.sub(" ", value).strip()


def normalize_phone_digits(value: str) -> str:
    """Extrai só os dígitos de um telefone (remove +, espaços, parênteses,
    hífen etc.) para validação/armazenamento consistente.
    """
    return re.sub(r"\D", "", value or "")


def is_valid_br_phone(value: str) -> bool:
    """Valida um telefone brasileiro: DDD (2 dígitos) + 8 ou 9 dígitos,
    com DDI 55 opcional. Aceita o valor já formatado (com parênteses,
    espaços, hífen, +55 etc.) — a validação é feita sobre os dígitos.
    """
    digits = normalize_phone_digits(value)
    return bool(_PHONE_DIGITS_RE.match(digits))
