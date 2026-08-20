from marshmallow import Schema, fields, validate


class LeadSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    phone = fields.Str(required=True, validate=validate.Length(min=8, max=20))
    email = fields.Email(required=False, allow_none=True, load_default=None)
    area = fields.Str(required=False, allow_none=True, load_default=None, validate=validate.Length(max=80))
    message = fields.Str(required=False, allow_none=True, load_default=None, validate=validate.Length(max=2000))
    consent = fields.Bool(required=True)
    # Honeypot: campo invisível no formulário real; se vier preenchido, é bot.
    website = fields.Str(required=False, load_default="")
