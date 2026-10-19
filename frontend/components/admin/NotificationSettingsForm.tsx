"use client";

import { FormEvent, useState } from "react";
import { redirectIfUnauthorized, useMfaEnabled } from "@/lib/adminMfaClient";
import {
  fieldErrorMessage,
  saveSettingsGroup,
  useSettingsGroup,
} from "@/lib/adminSettingsClient";
import {
  ERROR_BOX,
  FieldError,
  HINT_CLASS,
  INPUT_CLASS,
  INPUT_ERROR_CLASS,
  LABEL_CLASS,
  LoadingOrError,
  PRIMARY_BTN,
  ReauthFields,
  SECONDARY_BTN,
  SettingsCard,
  SUCCESS_BOX,
} from "@/components/admin/settingsUi";

type NotificationSettings = {
  lead_email_enabled: boolean;
  lead_email_recipients: string[];
};

type Message = { kind: "ok" | "error"; text: string } | null;

function parseRecipients(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item.toLowerCase() === b[i].toLowerCase());
}

export default function NotificationSettingsForm() {
  const { state, reload, replace } = useSettingsGroup<NotificationSettings>("notifications");
  const { mfaEnabled, markRequired } = useMfaEnabled();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [testMessage, setTestMessage] = useState<Message>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState(0);

  if (state.status !== "ready") {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={state.status} onRetry={reload} />
      </div>
    );
  }

  const { values, mail_configured: mailConfigured, fallback_recipient: fallback } = state.data;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const enabled = data.get("lead_email_enabled") === "on";
    const recipients = parseRecipients(String(data.get("lead_email_recipients") ?? ""));

    const changes: Record<string, unknown> = {};
    if (enabled !== values.lead_email_enabled) changes.lead_email_enabled = enabled;
    if (!sameList(recipients, values.lead_email_recipients)) changes.lead_email_recipients = recipients;
    if (Object.keys(changes).length === 0) {
      setMessage({ kind: "error", text: "Nenhuma alteração para salvar." });
      return;
    }

    setSaving(true);
    const code = String(data.get("code") ?? "").trim();
    const result = await saveSettingsGroup<NotificationSettings>("notifications", changes, {
      current_password: String(data.get("current_password") ?? ""),
      ...(code ? { code } : {}),
    });
    setSaving(false);
    if (!result) return;

    if (result.ok) {
      replace(result.data);
      setFormKey((k) => k + 1);
      setMessage({ kind: "ok", text: "Preferências de aviso salvas." });
      return;
    }
    if (result.mfaRequired) markRequired();
    setFieldErrors(result.fieldErrors);
    setMessage({ kind: "error", text: result.message });
  }

  async function sendTest() {
    setTestMessage(null);
    setTesting(true);
    try {
      const res = await fetch("/api/admin/settings/notifications/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (redirectIfUnauthorized(res.status, body?.error)) return;
      if (res.ok) {
        const sentTo: string[] = Array.isArray(body?.data?.sent_to) ? body.data.sent_to : [];
        setTestMessage({ kind: "ok", text: `E-mail de teste enviado para ${sentTo.join(", ")}.` });
      } else {
        setTestMessage({
          kind: "error",
          text:
            body?.error === "mail_not_configured"
              ? "O envio de e-mail não está configurado no servidor."
              : body?.error === "rate_limited" || res.status === 429
                ? "Limite de testes atingido. Tente de novo mais tarde."
                : body?.error === "mail_send_failed"
                  ? "O servidor de e-mail recusou o envio. Verifique a configuração SMTP."
                  : "Não foi possível enviar o teste agora.",
        });
      }
    } catch {
      setTestMessage({ kind: "error", text: "Falha de conexão. Tente novamente." });
    } finally {
      setTesting(false);
    }
  }

  const recipientsError = fieldErrorMessage(fieldErrors.lead_email_recipients);

  return (
    <div className="max-w-2xl space-y-6">
      {!mailConfigured && (
        <p role="status" className="rounded-sm border border-adm-border-strong bg-adm-canvas px-3 py-2 text-sm text-adm-body">
          O envio de e-mail ainda não está configurado no servidor (variáveis <code>MAIL_*</code>). As
          preferências podem ser salvas, mas nenhum aviso será enviado até isso ser feito.
        </p>
      )}

      <form key={formKey} onSubmit={handleSubmit} className="space-y-6" noValidate>
        <SettingsCard
          title="Aviso de novo contato"
          description="E-mail enviado quando alguém preenche o formulário do site. Por segurança (LGPD), o aviso traz só o número do contato e a hora; os dados ficam no painel, em Leads."
        >
          <label className="flex items-start gap-3 text-sm text-adm-ink">
            <input
              type="checkbox"
              name="lead_email_enabled"
              defaultChecked={values.lead_email_enabled}
              className="mt-0.5 h-4 w-4 accent-adm-accent"
            />
            <span>Enviar aviso por e-mail a cada novo contato</span>
          </label>

          <div>
            <label className={LABEL_CLASS} htmlFor="lead_email_recipients">
              Quem recebe o aviso
            </label>
            <textarea
              id="lead_email_recipients"
              name="lead_email_recipients"
              rows={4}
              maxLength={1400}
              defaultValue={values.lead_email_recipients.join("\n")}
              aria-invalid={recipientsError ? true : undefined}
              aria-describedby={`lead_email_recipients-hint${recipientsError ? " lead_email_recipients-error" : ""}`}
              className={`${INPUT_CLASS} ${recipientsError ? INPUT_ERROR_CLASS : ""}`}
            />
            <p id="lead_email_recipients-hint" className={HINT_CLASS}>
              Até 5 e-mails, um por linha.
              {fallback ? ` Se ficar vazio, o aviso vai para ${fallback} (padrão do servidor).` : ""}
            </p>
            <FieldError id="lead_email_recipients-error" message={recipientsError} />
          </div>
        </SettingsCard>

        <ReauthFields mfaEnabled={mfaEnabled} />

        {message && (
          <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
            {message.text}
          </p>
        )}

        <button type="submit" disabled={saving} className={PRIMARY_BTN}>
          {saving ? "Salvando..." : "Salvar preferências"}
        </button>
      </form>

      <SettingsCard
        title="Testar envio"
        description="Envia um e-mail de teste para os destinatários salvos. Salve as alterações antes de testar."
      >
        {testMessage && (
          <p role={testMessage.kind === "ok" ? "status" : "alert"} className={testMessage.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
            {testMessage.text}
          </p>
        )}
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || !mailConfigured}
          className={SECONDARY_BTN}
        >
          {testing ? "Enviando..." : "Enviar e-mail de teste"}
        </button>
      </SettingsCard>
    </div>
  );
}
