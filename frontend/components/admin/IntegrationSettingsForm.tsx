"use client";

import { FormEvent } from "react";
import { useMfaEnabled } from "@/lib/adminMfaClient";
import { fieldErrorMessage, useSettingsForm } from "@/lib/adminSettingsClient";
import {
  ERROR_BOX,
  FieldError,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LoadingOrError,
  PRIMARY_BTN,
  ReauthFields,
  SettingsCard,
  SUCCESS_BOX,
} from "@/components/admin/settingsUi";

type Integrations = {
  ai_enabled: boolean;
  ai_model: string;
  ai_reasoning_effort: string;
  ai_timeout_seconds: number;
  ai_daily_limit: number;
};

const EFFORTS: { value: string; label: string }[] = [
  { value: "", label: "Não enviar (modelos sem raciocínio)" },
  { value: "none", label: "Nenhum" },
  { value: "minimal", label: "Mínimo" },
  { value: "low", label: "Baixo (mais rápido e barato)" },
  { value: "medium", label: "Médio" },
  { value: "high", label: "Alto" },
  { value: "xhigh", label: "Muito alto" },
  { value: "max", label: "Máximo (mais lento e caro)" },
];

export default function IntegrationSettingsForm() {
  const form = useSettingsForm<Integrations>("integrations", "Configuração da IA salva.");
  const { mfaEnabled } = useMfaEnabled();

  if (form.state.status !== "ready") {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={form.state.status} onRetry={form.reload} />
      </div>
    );
  }

  const { values } = form.state.data;
  const extra = form.state.data;
  const choices = extra.model_choices?.length ? extra.model_choices : [values.ai_model];
  const limitMax = extra.daily_limit_max ?? 200;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      ai_enabled: data.get("ai_enabled") === "on",
      ai_model: String(data.get("ai_model") ?? ""),
      ai_reasoning_effort: String(data.get("ai_reasoning_effort") ?? ""),
      ai_timeout_seconds: Number(data.get("ai_timeout_seconds")),
      ai_daily_limit: Number(data.get("ai_daily_limit")),
    };
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof Integrations)[]) {
      if (next[key] !== values[key]) changes[key] = next[key];
    }
    await form.submit(event.currentTarget, changes);
  }

  const err = (key: keyof Integrations) => fieldErrorMessage(form.fieldErrors[key]);

  return (
    <form key={form.formKey} onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      {!extra.ai_key_configured && (
        <p role="status" className="rounded-sm border border-adm-border-strong bg-adm-canvas px-3 py-2 text-sm text-adm-body">
          A chave da OpenAI ainda não está configurada no servidor (<code>OPENAI_API_KEY</code>). As opções
          podem ser salvas, mas o assistente só funciona depois disso. Por segurança, a chave nunca é
          cadastrada pelo painel.
        </p>
      )}

      <SettingsCard
        title="Assistente de IA dos artigos"
        description="Sugere rascunhos, melhorias e títulos no editor de artigos. Cada pedido tem custo na OpenAI."
      >
        <label className="flex items-start gap-3 text-sm text-adm-ink">
          <input type="checkbox" name="ai_enabled" defaultChecked={values.ai_enabled} className="mt-0.5 h-4 w-4 accent-adm-accent" />
          <span>Assistente ligado</span>
        </label>

        <div>
          <label className={LABEL_CLASS} htmlFor="ai_model">
            Modelo
          </label>
          <select id="ai_model" name="ai_model" defaultValue={values.ai_model} className={INPUT_CLASS}>
            {choices.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <p className={HINT_CLASS}>
            Outros modelos entram na lista pela variável <code>OPENAI_MODEL_CHOICES</code> do servidor.
          </p>
          <FieldError id="ai_model-error" message={err("ai_model")} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="ai_reasoning_effort">
            Esforço de raciocínio
          </label>
          <select id="ai_reasoning_effort" name="ai_reasoning_effort" defaultValue={values.ai_reasoning_effort} className={INPUT_CLASS}>
            {EFFORTS.map((effort) => (
              <option key={effort.value} value={effort.value}>
                {effort.label}
              </option>
            ))}
          </select>
          <FieldError id="ai_reasoning_effort-error" message={err("ai_reasoning_effort")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS} htmlFor="ai_timeout_seconds">
              Tempo máximo de espera (5 a 55 s)
            </label>
            <input
              id="ai_timeout_seconds"
              name="ai_timeout_seconds"
              type="number"
              min={5}
              max={55}
              step={1}
              defaultValue={values.ai_timeout_seconds}
              className={INPUT_CLASS}
            />
            <FieldError id="ai_timeout_seconds-error" message={err("ai_timeout_seconds")} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="ai_daily_limit">
              Pedidos por dia, por administrador (1 a {limitMax})
            </label>
            <input
              id="ai_daily_limit"
              name="ai_daily_limit"
              type="number"
              min={1}
              max={limitMax}
              step={1}
              defaultValue={values.ai_daily_limit}
              className={INPUT_CLASS}
            />
            <FieldError id="ai_daily_limit-error" message={err("ai_daily_limit")} />
          </div>
        </div>
        <p className={HINT_CLASS}>Mudar o limite diário zera a contagem do dia.</p>
      </SettingsCard>

      <ReauthFields mfaEnabled={mfaEnabled || form.mfaRequired} />

      {form.message && (
        <p role={form.message.kind === "ok" ? "status" : "alert"} className={form.message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
          {form.message.text}
        </p>
      )}

      <button type="submit" disabled={form.saving} className={PRIMARY_BTN}>
        {form.saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
