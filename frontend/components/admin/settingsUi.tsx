import type { ReactNode } from "react";
import MfaCodeField from "@/components/admin/MfaCodeField";

// Peças visuais das telas de Configurações (mesmos tokens adm-* das telas
// de Segurança e Senha).

export const INPUT_CLASS =
  "w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25";
export const INPUT_ERROR_CLASS = "border-adm-danger-line";
export const LABEL_CLASS = "mb-1 block text-xs font-semibold text-adm-body";
export const HINT_CLASS = "mt-1 text-xs text-adm-muted";
export const PRIMARY_BTN =
  "rounded-sm bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60";
export const SECONDARY_BTN =
  "rounded-sm border border-adm-border-strong px-5 py-2 text-sm font-semibold text-adm-body transition hover:border-adm-accent disabled:opacity-60";
export const ERROR_BOX =
  "rounded-sm border border-adm-danger-line bg-adm-danger-soft px-3 py-2 text-sm text-adm-danger-ink";
export const SUCCESS_BOX =
  "rounded-sm border border-adm-success-line bg-adm-success-soft px-3 py-2 text-sm text-adm-success-ink";

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-sm border border-adm-border bg-white shadow-xs">
      <div className="border-b border-adm-border px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">{title}</h2>
        {description && <p className="mt-1 text-xs text-adm-muted">{description}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-adm-danger-ink">
      {message}
    </p>
  );
}

/** Senha atual + 2º fator (se o MFA estiver ativo), lidos via FormData
 * pelos nomes `current_password` e `code`. */
export function ReauthFields({ mfaEnabled }: { mfaEnabled: boolean | null }) {
  return (
    <div className="space-y-4 rounded-sm border border-adm-border bg-adm-canvas p-4">
      <p className="text-xs text-adm-muted">
        Para salvar, confirme sua identidade. Isso impede que uma sessão esquecida aberta seja usada
        para trocar os dados do escritório.
      </p>
      <div>
        <label className={LABEL_CLASS} htmlFor="settings_current_password">
          Sua senha atual
        </label>
        <input
          id="settings_current_password"
          name="current_password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className={INPUT_CLASS}
        />
      </div>
      {mfaEnabled && <MfaCodeField id="settings_mfa_code" />}
    </div>
  );
}

export function LoadingOrError({
  status,
  onRetry,
}: {
  status: "loading" | "error";
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-adm-muted">
        Carregando...
      </p>
    );
  }
  return (
    <div role="alert" className={`${ERROR_BOX} flex items-center justify-between gap-3`}>
      <span>Não foi possível carregar as configurações.</span>
      <button type="button" onClick={onRetry} className="font-semibold underline">
        Tentar de novo
      </button>
    </div>
  );
}
