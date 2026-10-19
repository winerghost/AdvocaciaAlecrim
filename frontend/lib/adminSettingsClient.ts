"use client";

import { useCallback, useEffect, useState } from "react";
import { mfaErrorMessage, redirectIfUnauthorized } from "@/lib/adminMfaClient";

// Leitura/gravação das telas de Configurações > Site e Notificações
// (proxy em app/api/admin/settings/[group]/route.ts).

export type SettingsGroup = "site" | "notifications";

export type SettingsResponse<T> = {
  values: T;
  mail_configured?: boolean;
  fallback_recipient?: string | null;
};

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: SettingsResponse<T> };

export function useSettingsGroup<T>(group: SettingsGroup) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/settings/${group}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (redirectIfUnauthorized(res.status, body?.error)) return;
      if (!res.ok || !body?.data?.values) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", data: body.data as SettingsResponse<T> });
    } catch {
      setState({ status: "error" });
    }
  }, [group]);

  useEffect(() => {
    // Busca inicial ao montar a tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const replace = useCallback((data: SettingsResponse<T>) => {
    setState({ status: "ready", data });
  }, []);

  return { state, reload: load, replace };
}

export type SaveResult<T> =
  | { ok: true; data: SettingsResponse<T> }
  | { ok: false; message: string; fieldErrors: Record<string, string>; mfaRequired: boolean };

/** PUT parcial: só as chaves alteradas + reautenticação (senha e 2º fator). */
export async function saveSettingsGroup<T>(
  group: SettingsGroup,
  changes: Record<string, unknown>,
  reauth: { current_password: string; code?: string }
): Promise<SaveResult<T> | null> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/settings/${group}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...changes, ...reauth }),
    });
  } catch {
    return { ok: false, message: "Falha de conexão. Tente novamente.", fieldErrors: {}, mfaRequired: false };
  }
  const body = await res.json().catch(() => ({}));
  if (redirectIfUnauthorized(res.status, body?.error)) return null;
  if (res.ok && body?.data?.values) return { ok: true, data: body.data };

  const error = body?.error;
  const details =
    body?.details && typeof body.details === "object" ? (body.details as Record<string, string>) : {};
  const message =
    mfaErrorMessage(res.status, error) ??
    (error === "invalid_current_password"
      ? "Senha atual incorreta."
      : error === "validation_error"
        ? "Revise os campos destacados."
        : error === "no_changes"
          ? "Nenhuma alteração para salvar."
          : "Não foi possível salvar agora. Tente novamente.");
  return { ok: false, message, fieldErrors: details, mfaRequired: error === "mfa_code_required" };
}

const FIELD_ERRORS: Record<string, string> = {
  invalid_phone: "Telefone inválido. Use DDD + número, ex.: (63) 99999-0000.",
  invalid_email: "E-mail inválido.",
  invalid_instagram: "Informe só o usuário (letras, números, ponto e _), sem o link.",
  required: "Campo obrigatório.",
  too_long: "Texto longo demais.",
  invalid_text: "Texto inválido.",
  invalid_recipients: "Informe até 5 e-mails válidos, um por linha.",
  invalid_boolean: "Valor inválido.",
};

export function fieldErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return FIELD_ERRORS[code] ?? "Valor inválido.";
}
