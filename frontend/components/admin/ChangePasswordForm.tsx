"use client";

import { FormEvent, useState } from "react";
import { ADMIN_PASSWORD_MIN_LENGTH, WEAK_PASSWORD_MESSAGE } from "@/lib/adminConstants";
import { mfaErrorMessage, redirectIfUnauthorized, useMfaEnabled } from "@/lib/adminMfaClient";
import MfaCodeField from "@/components/admin/MfaCodeField";

type Status = "idle" | "loading" | "success" | "error";

export default function ChangePasswordForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { mfaEnabled, markRequired } = useMfaEnabled();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current_password") || "");
    const newPassword = String(data.get("new_password") || "");
    const confirmPassword = String(data.get("confirm_password") || "");
    // Com MFA ativo o Flask exige também o 2º fator (TOTP ou recuperação).
    const mfaCode = String(data.get("code") || "").trim();

    if (newPassword !== confirmPassword) {
      setErrorMsg("A nova senha e a confirmação não coincidem.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          ...(mfaEnabled && mfaCode ? { code: mfaCode } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (redirectIfUnauthorized(res.status, body?.error)) return;
        if (body?.error === "mfa_code_required") markRequired();
        setErrorMsg(
          mfaErrorMessage(res.status, body?.error) ??
            (body?.error === "invalid_current_password"
              ? "Senha atual incorreta."
              : body?.error === "weak_password"
                ? WEAK_PASSWORD_MESSAGE
                : body?.error === "password_too_long"
                  ? "A nova senha pode ter no máximo 128 caracteres."
                  : "Não foi possível trocar a senha agora.")
        );
        setStatus("error");
        return;
      }

      form.reset();
      setStatus("success");
    } catch {
      setErrorMsg("Falha de conexão. Tente novamente.");
      setStatus("error");
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-sm border border-adm-border bg-white shadow-xs">
        <div className="border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Alterar senha de acesso
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-adm-body"
              htmlFor="current_password"
            >
              Senha atual
            </label>
            <input
              id="current_password"
              maxLength={128}
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold text-adm-body"
              htmlFor="new_password"
            >
              Nova senha (mínimo {ADMIN_PASSWORD_MIN_LENGTH} caracteres)
            </label>
            <input
              id="new_password"
              minLength={ADMIN_PASSWORD_MIN_LENGTH}
              maxLength={128}
              name="new_password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold text-adm-body"
              htmlFor="confirm_password"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirm_password"
              maxLength={128}
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25"
            />
          </div>

          {mfaEnabled && <MfaCodeField id="mfa_code" />}

          {status === "error" && errorMsg && (
            <p
              role="alert"
              className="rounded-sm border border-adm-danger-line bg-adm-danger-soft px-3 py-2 text-sm text-adm-danger-ink"
            >
              {errorMsg}
            </p>
          )}
          {status === "success" && (
            <p
              role="status"
              className="rounded-sm border border-adm-success-line bg-adm-success-soft px-3 py-2 text-sm text-adm-success-ink"
            >
              Senha alterada com sucesso. As sessões abertas em outros dispositivos foram
              encerradas; esta continua ativa.
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-sm bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60"
          >
            {status === "loading" ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
