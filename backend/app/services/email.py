"""Notificação por e-mail de novos leads.

Se MAIL_SERVER não estiver configurado (padrão em dev/staging), o envio é
apenas logado e pulado — a captura do lead no banco não depende disso.

O e-mail é só um AVISO: diz que chegou um contato, qual o número dele e
quando. Nenhum dado da pessoa (nome, telefone, e-mail, área, mensagem) vai
no assunto, no corpo ou em qualquer header - nem um Reply-To com o endereço
dela. Motivo (LGPD): no banco esses campos são cifrados e expurgados depois
de LEAD_RETENTION_DAYS, mas uma cópia na caixa de entrada de MAIL_TO fica
em texto claro, fora do expurgo e fora do alcance de um pedido de exclusão.
Quem recebe o aviso vê os dados no painel, autenticado.
"""

import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from flask import current_app

from ..models import Lead
from .site_settings import lead_notification_settings

# Horário de Brasília. Offset fixo (o Brasil não tem horário de verão desde
# 2019) em vez de `zoneinfo`, que dependeria de tzdata instalado na imagem.
_BRASILIA = timezone(timedelta(hours=-3))


def _received_at(lead: Lead) -> str:
    # `created_at` volta do banco sem tzinfo, mas é sempre UTC (ver o
    # default em app/models/lead.py).
    created_at = lead.created_at or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at.astimezone(_BRASILIA).strftime("%d/%m/%Y às %H:%M")


def _sender() -> str:
    return current_app.config["MAIL_USERNAME"] or "no-reply@localhost"


def build_new_lead_message(lead: Lead, recipients: list[str] | None = None) -> EmailMessage:
    """Monta o aviso. Só `lead.id` e `lead.created_at` podem ser lidos aqui
    - ver o motivo no topo do arquivo. `recipients` vem do painel
    (Configurações > Notificações), já validado; sem ele, MAIL_TO."""
    msg = EmailMessage()
    msg["Subject"] = f"Novo contato recebido pelo site (nº {lead.id})"
    msg["From"] = _sender()
    msg["To"] = ", ".join(recipients) if recipients else current_app.config["MAIL_TO"]
    msg.set_content(
        "Um novo contato chegou pelo formulário do site.\n\n"
        f"Número do contato: {lead.id}\n"
        f"Recebido em: {_received_at(lead)} (horário de Brasília)\n\n"
        "Por segurança, os dados da pessoa não são enviados por e-mail.\n"
        "Para ver o contato, entre no painel administrativo do site e abra\n"
        'a seção "Leads".\n\n'
        "Esta é uma mensagem automática; não responda a este e-mail.\n"
    )
    return msg


def mail_configured() -> bool:
    return bool(current_app.config.get("MAIL_SERVER"))


def _send(msg: EmailMessage) -> None:
    server = current_app.config.get("MAIL_SERVER")
    use_tls = current_app.config["MAIL_USE_TLS"]
    username = current_app.config["MAIL_USERNAME"]
    if username and not use_tls:
        # Sem TLS, `smtp.login()` mandaria MAIL_PASSWORD em texto claro
        # pela rede - melhor não notificar do que vazar a credencial. Quem
        # chama (app/api/leads.py) já trata a exceção sem falhar a captura
        # do lead.
        raise RuntimeError("MAIL_USE_TLS=false com MAIL_USERNAME definido - envio recusado.")

    with smtplib.SMTP(server, current_app.config["MAIL_PORT"], timeout=10) as smtp:
        if use_tls:
            # `starttls()` sem `context` usa um contexto que NÃO valida
            # certificado nem hostname - um intermediário na rede conseguiria
            # se passar pelo servidor SMTP e capturar a senha.
            smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, current_app.config["MAIL_PASSWORD"])
        smtp.send_message(msg)


def notify_new_lead(lead: Lead) -> None:
    if not mail_configured():
        current_app.logger.info(
            "MAIL_SERVER não configurado; pulando notificação por e-mail do lead #%s", lead.id
        )
        return

    enabled, recipients = lead_notification_settings(current_app.config.get("MAIL_TO"))
    if not enabled or not recipients:
        current_app.logger.info(
            "Aviso de lead desligado no painel; pulando notificação do lead #%s", lead.id
        )
        return

    _send(build_new_lead_message(lead, recipients))


def send_test_message(recipients: list[str]) -> None:
    """E-mail de teste do painel (Configurações > Notificações). Mesmo
    transporte do aviso de lead, sem nenhum dado de lead."""
    msg = EmailMessage()
    msg["Subject"] = "Teste de aviso do site Advocacia Alecrim"
    msg["From"] = _sender()
    msg["To"] = ", ".join(recipients)
    msg.set_content(
        "Este é um e-mail de teste enviado pelo painel administrativo do site\n"
        "(Configurações > Notificações).\n\n"
        "Se você recebeu esta mensagem, os avisos de novos contatos vão chegar\n"
        "neste endereço.\n\n"
        "Esta é uma mensagem automática; não responda a este e-mail.\n"
    )
    _send(msg)
