from marshmallow import Schema, ValidationError, fields, pre_load, validate

from ..utils.sanitize import sanitize_text

QUESTION_MAX = 255
ANSWER_MAX = 4000


class FaqSchema(Schema):
    question = fields.Str(required=True, validate=validate.Length(min=2, max=QUESTION_MAX))
    answer = fields.Str(required=True, validate=validate.Length(min=2, max=ANSWER_MAX))
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
            "question": QUESTION_MAX * 10,
            "answer": ANSWER_MAX * 5,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        raw_question = cleaned.get("question")
        if isinstance(raw_question, str):
            cleaned["question"] = sanitize_text(raw_question, allow_newline=False)

        raw_answer = cleaned.get("answer")
        if isinstance(raw_answer, str):
            cleaned["answer"] = sanitize_text(raw_answer, allow_newline=True)

        return cleaned
