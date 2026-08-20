"""Notificação por e-mail de novos leads.

Se MAIL_SERVER não estiver configurado (padrão em dev/staging), o envio é
apenas logado e pulado — a captura do lead no banco não depende disso.
"""

import smtplib
from email.message import EmailMessage

from flask import current_app

from ..models import Lead
from ..utils.sanitize import header_safe, sanitize_text


def notify_new_lead(lead: Lead) -> None:
    server = current_app.config.get("MAIL_SERVER")
    if not server:
        current_app.logger.info(
            "MAIL_SERVER não configurado; pulando notificação por e-mail do lead #%s", lead.id
        )
        return

    # Defesa em profundidade: os campos do lead já são sanitizados no
    # momento em que chegam pela API (backend/app/schemas/lead.py), mas
    # nunca confiamos apenas nisso ao montar headers de e-mail — um lead
    # pode ter chegado ao banco por outro caminho (seed, admin, migração
    # futura). Qualquer CR/LF é removido de novo aqui antes de virar
    # Subject, o que impede header injection (adicionar Bcc/To extra etc.).
    safe_name = header_safe(lead.name or "")

    msg = EmailMessage()
    msg["Subject"] = f"Novo contato do site — {safe_name}"
    msg["From"] = current_app.config["MAIL_USERNAME"] or "no-reply@localhost"
    msg["To"] = current_app.config["MAIL_TO"]
    msg.set_content(
        "Novo contato recebido pelo site:\n\n"
        f"Nome: {safe_name}\n"
        f"Telefone: {header_safe(lead.phone or '')}\n"
        f"E-mail: {header_safe(lead.email or '') or '-'}\n"
        f"Área de interesse: {header_safe(lead.area or '') or '-'}\n\n"
        f"Mensagem:\n{sanitize_text(lead.message or '', allow_newline=True) or '-'}"
    )

    with smtplib.SMTP(server, current_app.config["MAIL_PORT"], timeout=10) as smtp:
        if current_app.config["MAIL_USE_TLS"]:
            smtp.starttls()
        if current_app.config["MAIL_USERNAME"]:
            smtp.login(current_app.config["MAIL_USERNAME"], current_app.config["MAIL_PASSWORD"])
        smtp.send_message(msg)
