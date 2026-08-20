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
    <div className="max-w-md space-y-6">
      <h1 className="text-lg font-bold text-[#343a40]">Trocar senha</h1>

      <div className="rounded border border-[#dee2e6] bg-white shadow-sm">
        <div className="border-b border-[#dee2e6] px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#343a40]">
            Alterar senha de acesso
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-[#495057]"
              htmlFor="current_password"
            >
              Senha atual
            </label>
            <input
              id="current_password"
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold text-[#495057]"
              htmlFor="new_password"
            >
              Nova senha
            </label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold text-[#495057]"
              htmlFor="confirm_password"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
            />
          </div>

          {status === "error" && errorMsg && (
            <p className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-3 py-2 text-sm text-[#842029]">
              {errorMsg}
            </p>
          )}
          {status === "success" && (
            <p className="rounded border border-[#c3e6cb] bg-[#d4edda] px-3 py-2 text-sm text-[#155724]">
              Senha alterada com sucesso.
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded bg-[#007bff] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0069d9] disabled:opacity-60"
          >
            {status === "loading" ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
