"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function ChangePasswordForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current_password") || "");
    const newPassword = String(data.get("new_password") || "");
    const confirmPassword = String(data.get("confirm_password") || "");

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
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(
          body?.error === "invalid_current_password"
            ? "Senha atual incorreta."
            : body?.error === "weak_password"
              ? "A nova senha é muito fraca. Escolha uma senha mais forte."
              : "Não foi possível trocar a senha agora."
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
    <div className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold text-navy">Trocar senha</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-navy/10 bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted" htmlFor="current_password">
            Senha atual
          </label>
          <input
            id="current_password"
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted" htmlFor="new_password">
            Nova senha
          </label>
          <input
            id="new_password"
            name="new_password"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted" htmlFor="confirm_password">
            Confirmar nova senha
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
          />
        </div>

        {status === "error" && errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {status === "success" && (
          <p className="text-sm text-green-700">Senha alterada com sucesso.</p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
        >
          {status === "loading" ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
