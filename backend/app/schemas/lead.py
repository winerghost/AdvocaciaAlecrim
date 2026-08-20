from marshmallow import Schema, ValidationError, fields, pre_load, validate, validates

from ..utils.sanitize import is_valid_br_phone, sanitize_text

# Precisa ficar em sincronia com as <option> do <select name="area"> em
# frontend/components/LeadForm.tsx. O <select> é só UX: aqui é onde a regra
# "quais áreas são aceitas" é de fato imposta, já que a API pode ser chamada
# diretamente sem passar pelo <select>.
AREA_CHOICES = (
    "Inventário Judicial",
    "Aposentadoria",
    "Ação Trabalhista",
    "Ação Cível",
    "Outro",
)

# Limites de tamanho — além de UX, evitam payloads absurdamente grandes
# sendo persistidos no Postgres ou indo parar em um e-mail de notificação.
NAME_MAX = 120
PHONE_MAX = 20
AREA_MAX = 80
MESSAGE_MAX = 2000


class LeadSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=NAME_MAX))
    phone = fields.Str(required=True, validate=validate.Length(min=8, max=PHONE_MAX))
    email = fields.Email(required=False, allow_none=True, load_default=None)
    area = fields.Str(
        required=False,
        allow_none=True,
        load_default=None,
        validate=validate.OneOf(AREA_CHOICES),
    )
    message = fields.Str(required=False, allow_none=True, load_default=None, validate=validate.Length(max=MESSAGE_MAX))
    consent = fields.Bool(required=True, validate=validate.Equal(True, error="É necessário aceitar o uso dos dados (LGPD)."))
    # Honeypot: campo invisível no formulário real; se vier preenchido, é bot.
    website = fields.Str(required=False, load_default="")

    @pre_load
    def sanitize_input(self, data, **kwargs):
        """Trim/normaliza e sanitiza (remove HTML/caracteres de controle)
        todo campo de texto ANTES de qualquer validação de formato — a
        entrada nunca é confiável só porque o frontend tem `required`/
        `type="email"`. Isso roda mesmo para chamadas diretas na API,
        sem passar pelo formulário.
        """
        if not isinstance(data, dict):
            return data

        cleaned = dict(data)

        # Corta de imediato qualquer payload absurdamente grande, antes de
        # gastar CPU sanitizando/rodando regex em cima dele (o limite final
        # "de negócio" de cada campo é validado depois, já sobre o valor
        # sanitizado — isto aqui é só uma cerca larga contra abuso).
        _RAW_CEILINGS = {
            "name": NAME_MAX * 10,
            "phone": PHONE_MAX * 10,
            "email": 320 * 10,
            "area": AREA_MAX * 10,
            "message": MESSAGE_MAX * 5,
        }
        for field_name, ceiling in _RAW_CEILINGS.items():
            raw = cleaned.get(field_name)
            if isinstance(raw, str) and len(raw) > ceiling:
                raise ValidationError({field_name: ["Valor muito longo."]})

        # Campos "de uma linha só": nunca podem carregar quebra de linha,
        # que é o vetor usado para header injection (name entra no Subject
        # do e-mail de notificação).
        for field_name in ("name", "phone", "email", "area", "website"):
            raw = cleaned.get(field_name)
            if isinstance(raw, str):
                cleaned[field_name] = sanitize_text(raw, allow_newline=False)

        # Mensagem pode ter múltiplas linhas (corpo do e-mail/exibição no
        # painel), mas ainda assim sem HTML nem caracteres de controle.
        raw_message = cleaned.get("message")
        if isinstance(raw_message, str):
            cleaned["message"] = sanitize_text(raw_message, allow_newline=True)

        return cleaned

    @validates("phone")
    def validate_phone_format(self, value, **kwargs):
        if not is_valid_br_phone(value):
            raise ValidationError("Telefone inválido. Use um número BR válido, ex.: (11) 91234-5678.")

    @validates("name")
    def validate_name_not_blank(self, value, **kwargs):
        # Depois da sanitização (que remove tags/controles e apara espaços),
        # o nome pode ter ficado vazio ou curto demais mesmo que o payload
        # original parecesse ter conteúdo (ex.: só tags HTML).
        if len(value) < 2:
            raise ValidationError("Nome muito curto.")
