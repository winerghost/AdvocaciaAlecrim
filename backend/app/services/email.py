"""Notificação por e-mail de novos leads.

Se MAIL_SERVER não estiver configurado (padrão em dev/staging), o envio é
apenas logado e pulado — a captura do lead no banco não depende disso.
"""

import smtplib
import ssl
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

    use_tls = current_app.config["MAIL_USE_TLS"]
    username = current_app.config["MAIL_USERNAME"]
    if username and not use_tls:
        # Sem TLS, `smtp.login()` mandaria MAIL_PASSWORD (e depois os dados
        # do lead) em texto claro pela rede - melhor não notificar do que
        # vazar a credencial. Quem chama (app/api/leads.py) já trata a
        # exceção sem falhar a captura do lead.
        raise RuntimeError("MAIL_USE_TLS=false com MAIL_USERNAME definido - envio recusado.")

    with smtplib.SMTP(server, current_app.config["MAIL_PORT"], timeout=10) as smtp:
        if use_tls:
            # `starttls()` sem `context` usa um contexto que NÃO valida
            # certificado nem hostname - um intermediário na rede conseguiria
            # se passar pelo servidor SMTP e capturar senha + dados do lead.
            smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, current_app.config["MAIL_PASSWORD"])
        smtp.send_message(msg)
