"""Notificação por e-mail de novos leads.

Se MAIL_SERVER não estiver configurado (padrão em dev/staging), o envio é
apenas logado e pulado — a captura do lead no banco não depende disso.
"""

import smtplib
from email.message import EmailMessage

from flask import current_app

from ..models import Lead


def notify_new_lead(lead: Lead) -> None:
    server = current_app.config.get("MAIL_SERVER")
    if not server:
        current_app.logger.info(
            "MAIL_SERVER não configurado; pulando notificação por e-mail do lead #%s", lead.id
        )
        return

    msg = EmailMessage()
    msg["Subject"] = f"Novo contato do site — {lead.name}"
    msg["From"] = current_app.config["MAIL_USERNAME"] or "no-reply@localhost"
    msg["To"] = current_app.config["MAIL_TO"]
    msg.set_content(
        "Novo contato recebido pelo site:\n\n"
        f"Nome: {lead.name}\n"
        f"Telefone: {lead.phone}\n"
        f"E-mail: {lead.email or '-'}\n"
        f"Área de interesse: {lead.area or '-'}\n\n"
        f"Mensagem:\n{lead.message or '-'}"
    )

    with smtplib.SMTP(server, current_app.config["MAIL_PORT"], timeout=10) as smtp:
        if current_app.config["MAIL_USE_TLS"]:
            smtp.starttls()
        if current_app.config["MAIL_USERNAME"]:
            smtp.login(current_app.config["MAIL_USERNAME"], current_app.config["MAIL_PASSWORD"])
        smtp.send_message(msg)
