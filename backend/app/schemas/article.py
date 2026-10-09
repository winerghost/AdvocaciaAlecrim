import html
import re
import unicodedata
from datetime import timezone

from marshmallow import Schema, ValidationError, fields, post_load, pre_load, validate

from ..utils.sanitize import is_media_path, sanitize_html, sanitize_text

SLUG_MAX = 160
TITLE_MAX = 200
EXCERPT_MAX = 500
CONTENT_MAX = 200_000
COVER_IMAGE_MAX = 300

# Mesmo formato de slug de `ServiceSchema`: vira parte da URL pública do
# artigo - só letras minúsculas, números e hífen.
_SLUG_RE = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

_NON_SLUG_CHARS_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str, max_length: int = SLUG_MAX) -> str:
    """Gera um slug a partir de um texto livre: remove acentos ("Ação" ->
    "acao"), baixa a caixa e troca qualquer sequência de outros caracteres
    por um hífen. Pode devolver string vazia (ex.: título só com símbolos) -
    quem chama decide o fallback.
    """
    normalized = unicodedata.normalize("NFKD", value or "")
    without_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    ascii_only = without_accents.encode("ascii", "ignore").decode("ascii").lower()
    slug = _NON_SLUG_CHARS_RE.sub("-", ascii_only).strip("-")
    return slug[:max_length].strip("-")


_HTML_TAG_RE = re.compile(r"<[^>]*>")
_EMBED_TAG_RE = re.compile(r"<(?:img|hr)\b", re.IGNORECASE)
# Espaços "invisíveis" que o strip() não remove (zero-width e BOM).
_INVISIBLE_CHARS = "\u200b\u200c\u200d\u2060\ufeff"


def is_blank_html(value: str) -> bool:
    """`True` se o HTML (já sanitizado) não mostra nada: sem imagem/linha e
    sem texto depois de tirar as tags. O editor do painel devolve "<p></p>"
    quando está vazio - mesma regra de `isContentEmpty` em
    frontend/components/admin/ArticlesManager.tsx, que sozinha só valia para
    quem salvava pelo painel.
    """
    if _EMBED_TAG_RE.search(value):
        return False
    text = html.unescape(_HTML_TAG_RE.sub("", value))
    return "".join(ch for ch in text if ch not in _INVISIBLE_CHARS).strip() == ""


def _validate_content_not_blank(value):
    if is_blank_html(value):
        raise ValidationError("Escreva o conteúdo do artigo.")


def _validate_cover_image(value):
    if value is not None and not is_media_path(value):
        raise ValidationError("Imagem de capa inválida. Envie a imagem pelo painel.")


class ArticleSchema(Schema):
    # Opcional: ausente/vazio = a API gera a partir do título (ver
    # api/articles.py - depende de consultar o banco para evitar colisão).
    slug = fields.Str(
        required=False,
        validate=[
            validate.Length(min=1, max=SLUG_MAX),
            validate.Regexp(_SLUG_RE, error="Slug inválido. Use apenas letras minúsculas, números e hífen."),
        ],
    )
    title = fields.Str(required=True, validate=validate.Length(min=2, max=TITLE_MAX))
    excerpt = fields.Str(required=False, load_default="", validate=validate.Length(max=EXCERPT_MAX))
    content = fields.Str(
        required=True,
        validate=[validate.Length(min=1, max=CONTENT_MAX), _validate_content_not_blank],
    )
    cover_image = fields.Str(
        required=False,
        allow_none=True,
        load_default=None,
        validate=[validate.Length(max=COVER_IMAGE_MAX), _validate_cover_image],
    )
    published = fields.Bool(required=False, load_default=False)
    published_at = fields.DateTime(required=False, allow_none=True, load_default=None, format="iso")

    @pre_load
    def sanitize_input(self, data, **kwargs):
        """Mesmo padrão de `ServiceSchema.sanitize_input`. A diferença é o
        `content`: é HTML de editor rico, então passa pela allowlist de
        `sanitize_html` em vez de ter as tags removidas.
        """
        if not isinstance(data, dict):
            return data

        cleaned = dict(data)

        _RAW_CEILINGS = {
            "slug": SLUG_MAX * 10,
            "title": TITLE_MAX * 10,
            "excerpt": EXCERPT_MAX * 10,
            "content": CONTENT_MAX * 2,
            "cover_image": COVER_IMAGE_MAX * 10,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        raw_title = cleaned.get("title")
        if isinstance(raw_title, str):
            cleaned["title"] = sanitize_text(raw_title, allow_newline=False)

        if "slug" in cleaned:
            raw_slug = cleaned["slug"]
            if isinstance(raw_slug, str):
                raw_slug = sanitize_text(raw_slug, allow_newline=False).lower()
            if raw_slug is None or raw_slug == "":
                # Slug null ou vazio = "gere pra mim", igual a não mandar.
                del cleaned["slug"]
            else:
                cleaned["slug"] = raw_slug

        if "excerpt" in cleaned:
            raw_excerpt = cleaned["excerpt"]
            if raw_excerpt is None:
                cleaned["excerpt"] = ""
            elif isinstance(raw_excerpt, str):
                cleaned["excerpt"] = sanitize_text(raw_excerpt, allow_newline=False)

        raw_content = cleaned.get("content")
        if isinstance(raw_content, str):
            cleaned["content"] = sanitize_html(raw_content)

        raw_cover = cleaned.get("cover_image")
        if isinstance(raw_cover, str):
            cleaned["cover_image"] = raw_cover.strip() or None

        return cleaned

    @post_load
    def normalize_dates(self, data, **kwargs):
        # Guarda sempre "naive em UTC" (ver models/article.py::utcnow). Uma
        # data enviada sem fuso é interpretada como UTC.
        published_at = data.get("published_at")
        if published_at is not None and published_at.tzinfo is not None:
            try:
                data["published_at"] = published_at.astimezone(timezone.utc).replace(tzinfo=None)
            except OverflowError:
                # Data na borda do calendário com fuso (ex.: ano 0001 +05:00)
                # não existe em UTC - antes estourava em 500. Mesma mensagem
                # que o marshmallow usa para data inválida.
                raise ValidationError({"published_at": ["Not a valid datetime."]}) from None
        return data
