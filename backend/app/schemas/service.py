from marshmallow import Schema, ValidationError, fields, pre_load, validate

from ..utils.sanitize import sanitize_text

SLUG_MAX = 80
TITLE_MAX = 120
ICON_MAX = 40
DESCRIPTION_MAX = 4000

# Usado como identificador na URL pública (ex.: /servicos/<slug>) - só
# letras minúsculas, números e hífen, sem espaço/acento/HTML.
_SLUG_RE = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class ServiceSchema(Schema):
    slug = fields.Str(
        required=True,
        validate=[
            validate.Length(min=1, max=SLUG_MAX),
            validate.Regexp(_SLUG_RE, error="Slug inválido. Use apenas letras minúsculas, números e hífen."),
        ],
    )
    title = fields.Str(required=True, validate=validate.Length(min=2, max=TITLE_MAX))
    icon = fields.Str(required=False, load_default="briefcase", validate=validate.Length(max=ICON_MAX))
    description = fields.Str(required=True, validate=validate.Length(min=2, max=DESCRIPTION_MAX))
    order = fields.Int(required=False, load_default=0)

    @pre_load
    def sanitize_input(self, data, **kwargs):
        """Mesmo padrão de `LeadSchema.sanitize_input`: sanitiza texto antes
        de qualquer validação de formato, nunca aceitando HTML/caracteres
        de controle nesses campos (reutiliza `utils/sanitize.py`).
        """
        if not isinstance(data, dict):
            return data

        cleaned = dict(data)

        _RAW_CEILINGS = {
            "slug": SLUG_MAX * 10,
            "title": TITLE_MAX * 10,
            "icon": ICON_MAX * 10,
            "description": DESCRIPTION_MAX * 5,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        for field_name in ("slug", "title", "icon"):
            raw = cleaned.get(field_name)
            if isinstance(raw, str):
                cleaned[field_name] = sanitize_text(raw, allow_newline=False)
                if field_name == "slug":
                    cleaned[field_name] = cleaned[field_name].lower()

        raw_description = cleaned.get("description")
        if isinstance(raw_description, str):
            cleaned["description"] = sanitize_text(raw_description, allow_newline=True)

        return cleaned
