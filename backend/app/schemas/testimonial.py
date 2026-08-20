from marshmallow import Schema, ValidationError, fields, pre_load, validate

from ..utils.sanitize import sanitize_text

AUTHOR_MAX = 120
ROLE_MAX = 120
CONTENT_MAX = 4000


class TestimonialSchema(Schema):
    author = fields.Str(required=True, validate=validate.Length(min=2, max=AUTHOR_MAX))
    role = fields.Str(required=False, load_default="Cliente", validate=validate.Length(max=ROLE_MAX))
    content = fields.Str(required=True, validate=validate.Length(min=2, max=CONTENT_MAX))
    rating = fields.Int(required=False, load_default=5, validate=validate.Range(min=1, max=5))
    approved = fields.Bool(required=False, load_default=False)

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
            "author": AUTHOR_MAX * 10,
            "role": ROLE_MAX * 10,
            "content": CONTENT_MAX * 5,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        for field_name in ("author", "role"):
            raw = cleaned.get(field_name)
            if isinstance(raw, str):
                cleaned[field_name] = sanitize_text(raw, allow_newline=False)

        raw_content = cleaned.get("content")
        if isinstance(raw_content, str):
            cleaned["content"] = sanitize_text(raw_content, allow_newline=True)

        return cleaned
