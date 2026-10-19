"use client";

import { FormEvent, useState } from "react";
import { useMfaEnabled } from "@/lib/adminMfaClient";
import { fieldErrorMessage, useSettingsForm } from "@/lib/adminSettingsClient";
import { OTHER_AREA, type SiteSettings } from "@/lib/siteContact";
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

function parseAreas(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LeadFormSettings() {
  const form = useSettingsForm<SiteSettings>("site", "Formulário atualizado.");
  const { mfaEnabled } = useMfaEnabled();
  const [retention, setRetention] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (form.state.status !== "ready") {
    return (
      <div className="max-w-2xl">
        <LoadingOrError status={form.state.status} onRetry={form.reload} />
      </div>
    );
  }

  const values = form.state.data.values;
  const retentionValue = retention === null ? values.lead_retention_days : Number(retention);
  const reducing = Number.isInteger(retentionValue) && retentionValue < values.lead_retention_days;
  const areasError = fieldErrorMessage(form.fieldErrors.lead_areas);
  const retentionError = fieldErrorMessage(form.fieldErrors.lead_retention_days);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = {};
    const areas = parseAreas(String(data.get("lead_areas") ?? ""));
    if (areas.join("\n") !== values.lead_areas.join("\n")) changes.lead_areas = areas;
    if (retentionValue !== values.lead_retention_days) {
      if (reducing && !confirmed) return; // botão fica desabilitado; defesa extra
      changes.lead_retention_days = retentionValue;
    }
    if (await form.submit(event.currentTarget, changes)) {
      setRetention(null);
      setConfirmed(false);
    }
  }

  return (
    <form key={form.formKey} onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      <SettingsCard
        title="Áreas de interesse"
        description={`Opções do campo "Área de interesse" no formulário de contato. "${OTHER_AREA}" aparece sempre no fim. Leads antigos guardam a área com que foram enviados.`}
      >
        <div>
          <label className={LABEL_CLASS} htmlFor="lead_areas">
            Uma área por linha (até 10)
          </label>
          <textarea
            id="lead_areas"
            name="lead_areas"
            rows={6}
            maxLength={700}
            defaultValue={values.lead_areas.join("\n")}
            aria-invalid={areasError ? true : undefined}
            aria-describedby={areasError ? "lead_areas-error" : undefined}
            className={`${INPUT_CLASS} ${areasError ? INPUT_ERROR_CLASS : ""}`}
          />
          <FieldError id="lead_areas-error" message={areasError} />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Retenção de dados (LGPD)"
        description='Depois deste prazo, os contatos que não estão marcados como "convertido" são apagados pela rotina automática. O Aviso de Privacidade mostra o mesmo prazo.'
      >
        <div>
          <label className={LABEL_CLASS} htmlFor="lead_retention_days">
            Prazo em dias (30 a 730)
          </label>
          <input
            id="lead_retention_days"
            type="number"
            inputMode="numeric"
            min={30}
            max={730}
            step={1}
            value={retention ?? String(values.lead_retention_days)}
            onChange={(e) => {
              setRetention(e.target.value);
              setConfirmed(false);
            }}
            aria-invalid={retentionError ? true : undefined}
            aria-describedby={`lead_retention_days-hint${retentionError ? " lead_retention_days-error" : ""}`}
            className={`${INPUT_CLASS} max-w-40 ${retentionError ? INPUT_ERROR_CLASS : ""}`}
          />
          <p id="lead_retention_days-hint" className={HINT_CLASS}>
            Hoje: {values.lead_retention_days} dias.
          </p>
          <FieldError id="lead_retention_days-error" message={retentionError} />
        </div>
        {reducing && (
          <label className={`${ERROR_BOX} flex items-start gap-3`}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Entendo que, ao reduzir o prazo, os contatos com mais de {retentionValue} dias (exceto os convertidos) serão
              apagados na próxima execução da rotina, sem como recuperar.
            </span>
          </label>
        )}
      </SettingsCard>

      <ReauthFields mfaEnabled={mfaEnabled || form.mfaRequired} />

      {form.message && (
        <p role={form.message.kind === "ok" ? "status" : "alert"} className={form.message.kind === "ok" ? SUCCESS_BOX : ERROR_BOX}>
          {form.message.text}
        </p>
      )}

      <button type="submit" disabled={form.saving || (reducing && !confirmed)} className={PRIMARY_BTN}>
        {form.saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
