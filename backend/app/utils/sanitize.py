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


# --------------------------------------------------------------------------
# HTML rico (corpo dos artigos do blog)
# --------------------------------------------------------------------------
# `sanitize_text` acima remove TODAS as tags - certo para campos de texto
# puro, mas inútil para o corpo de um artigo, que vem de um editor rico e é
# renderizado como HTML no site público. Aqui a defesa contra XSS armazenado
# é uma allowlist (lib `nh3`, binding do `ammonia`, que faz o parse com um
# parser HTML5 de verdade em vez de regex): tudo que não está explicitamente
# liberado abaixo é descartado.

# Nome de arquivo gerado por `POST /api/admin/uploads`: uuid4 hex + extensão
# derivada do tipo detectado. Mesmo padrão usado para servir `/api/media/`.
MEDIA_FILENAME_PATTERN = r"[0-9a-f]{32}\.(?:jpg|png|webp|gif)"
_MEDIA_PATH_RE = re.compile(rf"/api/media/{MEDIA_FILENAME_PATTERN}")

_HTML_ALLOWED_TAGS = {
    "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
    "blockquote", "ul", "ol", "li", "a", "img", "hr", "code", "pre",
    "figure", "figcaption", "span",
}

# `rel` não entra aqui de propósito: o nh3 recusa a combinação "rel liberado
# + link_rel forçado". O `rel` enviado pelo cliente é descartado e o
# `link_rel` (ver `sanitize_html`) grava sempre "noopener noreferrer" em
# todo <a>.
_ALIGNABLE_TAGS = ("p", "h2", "h3", "h4")
_HTML_ALLOWED_ATTRIBUTES = {
    "a": {"href", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    **{tag: {"style"} for tag in _ALIGNABLE_TAGS},
}

_HTML_URL_SCHEMES = {"http", "https", "mailto"}

# Único uso permitido de `style`: alinhamento de texto, no formato emitido
# pelo editor (`style="text-align: center"`). Qualquer outra declaração é
# descartada e o valor é reescrito de forma canônica.
_TEXT_ALIGN_RE = re.compile(
    r"(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)", re.IGNORECASE
)
# Início aceito de um `href`. Caminho interno é "/" seguido de qualquer coisa
# que NÃO seja outra barra - normal ou invertida: o navegador trata "\" como
# "/" em URLs http(s), então "/\host" é o mesmo "//host" (outro site).
_HREF_RE = re.compile(r"(?:https?://|mailto:|/(?![/\\])|#)", re.IGNORECASE)
# Caracteres que nunca aparecem num link legítimo e que o navegador ignora
# ou reinterpreta ao resolver a URL: controles C0 (tab/CR/LF são REMOVIDOS
# de dentro da URL, então "/<tab>/host" vira "//host"), DEL e a barra
# invertida ("https:\\host", "\\host", "\/host"). Chegam aqui mesmo depois
# da limpeza de controles de `sanitize_html` quando escritos como entidade
# (`&#9;`), que só o parser HTML decodifica.
_HREF_FORBIDDEN_CHARS_RE = re.compile(r"[\x00-\x1f\x7f\\]")
_DIMENSION_RE = re.compile(r"[0-9]{1,4}")
_LINK_TARGETS = {"_blank", "_self"}


def is_media_path(value) -> bool:
    """`True` se `value` é exatamente o caminho de um upload do painel
    (`/api/media/<uuid hex>.<ext>`).
    """
    return isinstance(value, str) and _MEDIA_PATH_RE.fullmatch(value) is not None


def _html_attribute_filter(tag: str, attribute: str, value: str) -> str | None:
    """Chamado pelo nh3 para cada atributo que já passou pela allowlist.
    Devolver `None` remove o atributo; devolver uma string o substitui.
    """
    value = value.strip()

    if attribute == "style":
        match = _TEXT_ALIGN_RE.search(value)
        return f"text-align: {match.group(1).lower()}" if match else None

    if tag == "a":
        if attribute == "href":
            # Além do filtro de esquema do nh3 (http/https/mailto), links
            # sem esquema só passam se forem do próprio site ("/pagina",
            # "#ancora") - nunca "//host", que herdaria o esquema da
            # página, nem as grafias que o navegador normaliza para isso.
            if _HREF_FORBIDDEN_CHARS_RE.search(value):
                return None
            return value if _HREF_RE.match(value) else None
        if attribute == "target":
            return value if value in _LINK_TARGETS else None

    if tag == "img":
        if attribute == "src":
            # Só imagens enviadas pelo próprio painel (o editor só insere
            # imagem por upload). Nada de URL externa - nem https: cada
            # visitante do artigo faria uma requisição a um servidor de
            # terceiros (rastreio por pixel, conteúdo fora do nosso
            # controle) -, de data: ou de caminhos relativos arbitrários.
            return value if is_media_path(value) else None
        if attribute in ("width", "height"):
            return value if _DIMENSION_RE.fullmatch(value) else None

    return value


def sanitize_html(value: str) -> str:
    """Sanitiza HTML de editor rico por allowlist de tags/atributos.

    `<script>`/`<style>` somem junto com o conteúdo, handlers `on*` e
    esquemas como `javascript:` são removidos, comentários também. O
    resultado é seguro para ser injetado como HTML no site público.

    É idempotente (sanitizar o que já foi sanitizado devolve o mesmo
    texto), por isso também é aplicada na LEITURA dos artigos - ver
    api/articles.py.
    """
    if not isinstance(value, str):
        return value

    # Import local: só os artigos usam HTML rico, e assim o resto do módulo
    # (usado por todos os schemas) não depende da lib.
    import nh3

    value = unicodedata.normalize("NFC", value)
    value = _CONTROL_CHARS_RE.sub("", value)

    cleaned = nh3.clean(
        value,
        tags=_HTML_ALLOWED_TAGS,
        attributes=_HTML_ALLOWED_ATTRIBUTES,
        attribute_filter=_html_attribute_filter,
        url_schemes=_HTML_URL_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    return cleaned.strip()
