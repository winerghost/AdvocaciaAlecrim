"use client";

import { FormEvent, useState } from "react";
import { useMfaEnabled } from "@/lib/adminMfaClient";
import {
  fieldErrorMessage,
  saveSettingsGroup,
  useSettingsGroup,
} from "@/lib/adminSettingsClient";
import { formatPhoneDisplay, type SiteSettings } from "@/lib/siteContact";
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
  SettingsCard,
  SUCCESS_BOX,
} from "@/components/admin/settingsUi";

// Só os campos de texto desta aba (SEO e formulário têm abas próprias).
type EditableKey =
  | "phone"
  | "contact_email"
  | "instagram"
  | "location"
  | "controller_name"
  | "controller_registration"
  | "controller_address"
  | "dpo_name";

type FieldDef = {
  key: EditableKey;
  label: string;
  hint?: string;
  maxLength: number;
  type?: "text" | "email" | "tel";
  placeholder?: string;
  required?: boolean;
};

const CONTACT_FIELDS: FieldDef[] = [
  {
    key: "phone",
    label: "Telefone / WhatsApp",
    hint: "Usado nos botões de WhatsApp, no link de ligação e na seção Contato.",
    maxLength: 40,
    type: "tel",
    placeholder: "(63) 99999-0000",
    required: true,
  },
  { key: "contact_email", label: "E-mail de contato", maxLength: 254, type: "email", required: true },
  {
    key: "instagram",
    label: "Instagram",
    hint: "Só o usuário, sem o link. Deixe vazio para esconder o Instagram do site.",
    maxLength: 80,
    placeholder: "advocaciaalecrim_",
  },
  {
    key: "location",
    label: "Localização",
    hint: "Texto exibido na seção Contato.",
    maxLength: 120,
    required: true,
  },
];

const LEGAL_FIELDS: FieldDef[] = [
  { key: "controller_name", label: "Nome do advogado ou razão social", maxLength: 200 },
  {
    key: "controller_registration",
    label: "Registro profissional",
    hint: "Nº de inscrição na OAB/TO e, se houver, CNPJ.",
    maxLength: 200,
  },
  { key: "controller_address", label: "Endereço completo do escritório", maxLength: 300 },
  { key: "dpo_name", label: "Encarregado pelo tratamento de dados (LGPD)", maxLength: 200 },
];

const ALL_FIELDS = [...CONTACT_FIELDS, ...LEGAL_FIELDS];

function displayValue(key: EditableKey, values: SiteSettings): string {
  // Telefone é guardado só em dígitos com DDI; no formulário, formatado.
  return key === "phone" ? formatPhoneDisplay(values.phone) : values[key];
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function SiteSettingsForm() {
  const { state, reload, replace } = useSettingsGroup<SiteSettings>("site");
  const { mfaEnabled, markRequired } = useMfaEnabled();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // `formKey` remonta o formulário depois de salvar: os campos voltam a
  // refletir o que o servidor gravou (já normalizado) e a senha é limpa.
  const [formKey, setFormKey] = useState(0);

  if (state.status !== "ready") {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={state.status} onRetry={reload} />
      </div>
    );
  }

  const values = state.data.values;
  const legalDate = formatDate(values.legal_updated_at);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const changes: Record<string, string> = {};
    for (const field of ALL_FIELDS) {
      const raw = String(data.get(field.key) ?? "");
      if (raw.trim() !== displayValue(field.key, values).trim()) changes[field.key] = raw;
    }
    if (Object.keys(changes).length === 0) {
      setMessage({ kind: "error", text: "Nenhuma alteração para salvar." });
      return;
    }

    setSaving(true);
    const code = String(data.get("code") ?? "").trim();
    const result = await saveSettingsGroup<SiteSettings>("site", changes, {
      current_password: String(data.get("current_password") ?? ""),
      ...(code ? { code } : {}),
    });
    setSaving(false);
    if (!result) return; // sessão expirou: já redirecionou para o login

    if (result.ok) {
      replace(result.data);
      setFormKey((k) => k + 1);
      setMessage({ kind: "ok", text: "Configurações salvas. O site já mostra os novos dados." });
      return;
    }
    if (result.mfaRequired) markRequired();
    setFieldErrors(result.fieldErrors);
    setMessage({ kind: "error", text: result.message });
  }

  function renderField(field: FieldDef) {
    const error = fieldErrorMessage(fieldErrors[field.key]);
    const errorId = `${field.key}-error`;
    const hintId = `${field.key}-hint`;
    return (
      <div key={field.key}>
        <label className={LABEL_CLASS} htmlFor={`site_${field.key}`}>
          {field.label}
        </label>
        <input
          id={`site_${field.key}`}
          name={field.key}
          type={field.type ?? "text"}
          defaultValue={displayValue(field.key, values)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          required={field.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errorId : null, field.hint ? hintId : null].filter(Boolean).join(" ") || undefined}
          className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ""}`}
        />
        {field.hint && (
          <p id={hintId} className={HINT_CLASS}>
            {field.hint}
          </p>
        )}
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      <SettingsCard
        title="Contato e redes sociais"
        description="Aparecem no topo, na seção Contato, no botão flutuante de WhatsApp, no blog e no Aviso de Privacidade."
      >
        {CONTACT_FIELDS.map(renderField)}
      </SettingsCard>

      <SettingsCard
        title="Dados legais"
        description={`Exibidos no Aviso de Privacidade (LGPD). Campos vazios aparecem como "[PREENCHER]" na página.${
          legalDate ? ` Última alteração: ${legalDate}.` : ""
        }`}
      >
        {LEGAL_FIELDS.map(renderField)}
      </SettingsCard>

      <ReauthFields mfaEnabled={mfaEnabled} />

      {message && (
        <p role={message.kind === "ok" ? "status" : "alert"} className={message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
          {message.text}
        </p>
      )}

      <button type="submit" disabled={saving} className={PRIMARY_BTN}>
        {saving ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
