from marshmallow import EXCLUDE, Schema, ValidationError, fields, pre_load, validate, validates_schema

from ..utils.sanitize import sanitize_html, sanitize_text
from .article import CONTENT_MAX, EXCERPT_MAX, TITLE_MAX, _INVISIBLE_CHARS, is_blank_html

INSTRUCTIONS_MAX = 1000

FIELDS = ("content", "excerpt", "title")
ACTIONS = ("draft", "improve", "fix")


def _is_blank_text(value: str) -> bool:
    return "".join(ch for ch in value if ch not in _INVISIBLE_CHARS).strip() == ""


class ArticleAISchema(Schema):
    """Pedido ao assistente de escrita (POST /api/admin/articles/ai).

    Os textos são sanitizados aqui do mesmo jeito que seriam ao salvar o
    artigo (`ArticleSchema`): o modelo recebe exatamente o que ficaria
    gravado. Isso também garante que nenhum deles carrega uma tag capaz de
    fechar as seções delimitadas do prompt (ver services/article_ai.py).
    """

    class Meta:
        # O painel pode mandar o formulário inteiro (slug, capa...); o que
        # não é usado aqui é ignorado em vez de virar erro.
        unknown = EXCLUDE

    field = fields.Str(required=True, validate=validate.OneOf(FIELDS, error="Campo inválido."))
    action = fields.Str(required=True, validate=validate.OneOf(ACTIONS, error="Ação inválida."))
    title = fields.Str(required=False, load_default="", validate=validate.Length(max=TITLE_MAX))
    content = fields.Str(required=False, load_default="", validate=validate.Length(max=CONTENT_MAX))
    excerpt = fields.Str(required=False, load_default="", validate=validate.Length(max=EXCERPT_MAX))
    instructions = fields.Str(
        required=False, load_default="", validate=validate.Length(max=INSTRUCTIONS_MAX)
    )

    @pre_load
    def sanitize_input(self, data, **kwargs):
        if not isinstance(data, dict):
            return data

        cleaned = dict(data)

        _RAW_CEILINGS = {
            "title": TITLE_MAX * 10,
            "content": CONTENT_MAX * 2,
            "excerpt": EXCERPT_MAX * 10,
            "instructions": INSTRUCTIONS_MAX * 10,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if raw is None:
                # null = campo vazio, igual a não mandar.
                cleaned.pop(field_name, None)
            elif isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        for field_name in ("title", "excerpt"):
            raw = cleaned.get(field_name)
            if isinstance(raw, str):
                cleaned[field_name] = sanitize_text(raw, allow_newline=False)

        raw_instructions = cleaned.get("instructions")
        if isinstance(raw_instructions, str):
            cleaned["instructions"] = sanitize_text(raw_instructions, allow_newline=True)

        raw_content = cleaned.get("content")
        if isinstance(raw_content, str):
            cleaned["content"] = sanitize_html(raw_content)

        return cleaned

    @validates_schema
    def validate_required_inputs(self, data, **kwargs):
        """O que cada combinação campo/ação precisa para ter com o que
        trabalhar. Só roda se os campos passaram nas validações acima.
        """
        field, action = data["field"], data["action"]
        has_title = not _is_blank_text(data["title"])
        has_content = not is_blank_html(data["content"])
        has_excerpt = not _is_blank_text(data["excerpt"])

        if field == "title":
            if action == "draft":
                if not has_content and not has_excerpt and _is_blank_text(data["instructions"]):
                    raise ValidationError(
                        {
                            "content": [
                                "Escreva o conteúdo, o resumo ou as orientações para gerar o título."
                            ]
                        }
                    )
            elif not has_title:
                raise ValidationError({"title": ["Escreva o título do artigo."]})
        elif field == "content":
            if action == "draft":
                if not has_title and _is_blank_text(data["instructions"]):
                    raise ValidationError(
                        {"title": ["Informe o título ou as orientações para redigir o artigo."]}
                    )
            elif not has_content:
                raise ValidationError({"content": ["Escreva o conteúdo do artigo."]})
        elif action == "draft":
            if not has_content and not has_title:
                raise ValidationError(
                    {"content": ["Escreva o conteúdo ou o título do artigo para gerar o resumo."]}
                )
        elif not has_excerpt:
            raise ValidationError({"excerpt": ["Escreva o resumo do artigo."]})
