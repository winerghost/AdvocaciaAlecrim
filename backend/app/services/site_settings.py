"""Configurações editáveis pelo painel (menu Configurações).

Fonte única das chaves aceitas, dos defaults e da validação. Regras:

- Allowlist rígida: só as chaves declaradas em `GROUPS` existem. Nada de
  `setattr` genérico nem de guardar chave desconhecida.
- Defaults no código; o banco (`site_settings`) guarda só o que o admin
  mudou. Tabela vazia = site exatamente como antes.
- Leitura tolerante: um valor salvo que não passa mais na validação (ex.: a
  regra ficou mais rígida) é ignorado e cai no default, em vez de quebrar.
- Só o grupo "site" é público (`PUBLIC_GROUPS`). "notifications" tem
  e-mails internos e só sai pelas rotas /api/admin.
- Segredos (senha SMTP, chaves de API) NUNCA entram aqui: ficam no env.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from email_validator import EmailNotValidError, validate_email

from ..extensions import db
from ..models import SiteSetting
from ..utils.sanitize import is_valid_br_phone, normalize_phone_digits, sanitize_text


class SettingError(ValueError):
    """Valor inválido para uma chave. `code` vai para a resposta da API."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


Validator = Callable[[Any], Any]

MAX_EMAIL_LENGTH = 254
MAX_RECIPIENTS = 5
_INSTAGRAM_RE = re.compile(r"[A-Za-z0-9._]{1,30}")
# Horário de Brasília (mesmo motivo de services/email.py: sem tzdata).
_BRASILIA = timezone(timedelta(hours=-3))


# ------------------------------------------------------------ validadores --

def _text(max_length: int, *, required: bool = False) -> Validator:
    def validate(value):
        if not isinstance(value, str) or len(value) > max_length * 4:
            raise SettingError("invalid_text")
        clean = sanitize_text(value, allow_newline=False)
        if len(clean) > max_length:
            raise SettingError("too_long")
        if required and not clean:
            raise SettingError("required")
        return clean

    return validate


def _phone(value):
    if not isinstance(value, str) or len(value) > 40:
        raise SettingError("invalid_phone")
    if not is_valid_br_phone(value):
        raise SettingError("invalid_phone")
    digits = normalize_phone_digits(value)
    # Guarda sempre com o DDI 55 (formato de wa.me e de tel:+55...). Decide
    # pelo tamanho, não pelo prefixo: "55" também é DDD (RS).
    return digits if len(digits) >= 12 else f"55{digits}"


def _email_value(value) -> str:
    if not isinstance(value, str) or len(value) > MAX_EMAIL_LENGTH:
        raise SettingError("invalid_email")
    clean = sanitize_text(value, allow_newline=False).strip().lower()
    try:
        # Só sintaxe, sem DNS (mesmo critério de api/admin_users.py).
        return validate_email(clean, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise SettingError("invalid_email") from exc


def _email(value):
    return _email_value(value)


def _instagram(value):
    if not isinstance(value, str) or len(value) > 80:
        raise SettingError("invalid_instagram")
    clean = value.strip().lstrip("@").strip("/")
    if not clean:
        return ""  # vazio = esconde o Instagram no site
    if not _INSTAGRAM_RE.fullmatch(clean):
        raise SettingError("invalid_instagram")
    return clean


def _bool(value):
    if not isinstance(value, bool):
        raise SettingError("invalid_boolean")
    return value


def _email_list(value):
    if not isinstance(value, list) or len(value) > MAX_RECIPIENTS:
        raise SettingError("invalid_recipients")
    result: list[str] = []
    for item in value:
        email = _email_value(item)
        if email not in result:
            result.append(email)
    return result


# ------------------------------------------------------------- registro --

# chave -> (default, validador). A ordem é a ordem exibida no painel.
GROUPS: dict[str, dict[str, tuple[Any, Validator]]] = {
    "site": {
        # Contato (substitui frontend/lib/constants.ts, que vira fallback).
        "phone": ("5563999941821", _phone),
        "contact_email": ("alecrimrio@gmail.com", _email),
        "instagram": ("advocaciaalecrim_", _instagram),
        "location": ("Palmas, Tocantins — atendimento em todo o estado", _text(120, required=True)),
        # Dados legais do Aviso de Privacidade (LGPD). Vazio = a página
        # mostra "[PREENCHER ...]", como antes.
        "controller_name": ("", _text(200)),
        "controller_registration": ("", _text(200)),
        "controller_address": ("", _text(300)),
        "dpo_name": ("", _text(200)),
    },
    "notifications": {
        # Liga/desliga o aviso por e-mail de novo lead.
        "lead_email_enabled": (True, _bool),
        # Vazio = usa MAIL_TO do env (comportamento de antes).
        "lead_email_recipients": ([], _email_list),
    },
}

PUBLIC_GROUPS = frozenset({"site"})

# Chaves que, ao mudar, atualizam a data do Aviso de Privacidade.
_LEGAL_KEYS = frozenset(
    {"controller_name", "controller_registration", "controller_address", "dpo_name"}
)
# Campo calculado pelo servidor (somente leitura para o painel).
LEGAL_UPDATED_AT = "legal_updated_at"


def _defaults(group: str) -> dict:
    values = {key: (list(default) if isinstance(default, list) else default)
              for key, (default, _validator) in GROUPS[group].items()}
    if group == "site":
        values[LEGAL_UPDATED_AT] = None
    return values


def _stored(group: str) -> SiteSetting | None:
    return db.session.get(SiteSetting, group)


def get_settings(group: str) -> dict:
    """Defaults + overrides salvos que ainda são válidos."""
    values = _defaults(group)
    row = _stored(group)
    stored = row.value if row is not None and isinstance(row.value, dict) else {}
    for key, (_default, validator) in GROUPS[group].items():
        if key not in stored:
            continue
        try:
            values[key] = validator(stored[key])
        except SettingError:
            pass  # valor antigo inválido: fica o default
    if group == "site":
        legal = stored.get(LEGAL_UPDATED_AT)
        if isinstance(legal, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", legal):
            values[LEGAL_UPDATED_AT] = legal
    return values


def validate_update(group: str, payload: dict) -> tuple[dict, dict]:
    """Valida uma atualização parcial. Devolve (valores limpos, erros por
    chave). Chave desconhecida é erro, não é ignorada em silêncio."""
    spec = GROUPS[group]
    clean: dict = {}
    errors: dict = {}
    for key, value in payload.items():
        if key not in spec:
            errors[key] = "unknown_field"
            continue
        try:
            clean[key] = spec[key][1](value)
        except SettingError as exc:
            errors[key] = exc.code
    return clean, errors


def save_settings(group: str, changes: dict, admin_id: int) -> tuple[dict, list[str]]:
    """Grava as mudanças. Devolve (configuração completa, chaves que
    realmente mudaram)."""
    current = get_settings(group)
    changed = [key for key, value in changes.items() if current.get(key) != value]
    row = _stored(group)
    stored = dict(row.value) if row is not None and isinstance(row.value, dict) else {}

    for key in changed:
        stored[key] = changes[key]
    if group == "site" and _LEGAL_KEYS.intersection(changed):
        stored[LEGAL_UPDATED_AT] = datetime.now(_BRASILIA).date().isoformat()

    if changed:
        if row is None:
            row = SiteSetting(key=group, value=stored, updated_by_id=admin_id)
            db.session.add(row)
        else:
            # Atribuir um dict NOVO: o SQLAlchemy não percebe mutação dentro
            # de uma coluna JSON.
            row.value = stored
            row.updated_by_id = admin_id
        db.session.commit()

    return get_settings(group), changed


def lead_notification_settings(fallback_recipient: str | None) -> tuple[bool, list[str]]:
    """(ligado?, destinatários) para o aviso de novo lead. Sem lista salva,
    usa MAIL_TO. Nunca levanta: o aviso não pode derrubar a captura."""
    try:
        settings = get_settings("notifications")
    except Exception:
        db.session.rollback()
        settings = _defaults("notifications")
    recipients = settings["lead_email_recipients"] or (
        [fallback_recipient] if fallback_recipient else []
    )
    return bool(settings["lead_email_enabled"]), recipients
