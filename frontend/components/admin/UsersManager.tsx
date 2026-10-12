"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminUserItem } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";
import { ADMIN_PASSWORD_MIN_LENGTH, WEAK_PASSWORD_MESSAGE } from "@/lib/adminConstants";
import { mfaErrorMessage, redirectIfUnauthorized, useMfaEnabled } from "@/lib/adminMfaClient";
import MfaCodeField from "@/components/admin/MfaCodeField";

const INPUT_CLASS =
  "w-full rounded-sm border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-hidden focus:ring-3 focus:ring-adm-accent/25";

const CREATE_ERRORS: Record<string, string> = {
  invalid_email: "E-mail inválido.",
  weak_password: WEAK_PASSWORD_MESSAGE,
  password_too_long: "A senha pode ter no máximo 128 caracteres.",
  email_taken: "Já existe um usuário com esse e-mail.",
  invalid_current_password: "Sua senha atual está incorreta.",
  too_many_requests: "Muitas tentativas. Aguarde e tente novamente.",
};

const DELETE_ERRORS: Record<string, string> = {
  cannot_delete_self: "Você não pode excluir o próprio usuário.",
  not_found: "Usuário não encontrado.",
  invalid_current_password: "Sua senha atual está incorreta.",
  too_many_requests: "Muitas tentativas. Aguarde e tente novamente.",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export default function UsersManager() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Reautenticação exigida pelo Flask pra criar/excluir um admin.
  const [currentPassword, setCurrentPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  // 2º fator (TOTP ou código de recuperação), exigido pelo Flask quando o
  // admin logado tem MFA ativo.
  const { mfaEnabled, markRequired } = useMfaEnabled();
  const [createCode, setCreateCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Não foi possível carregar os usuários.");
        return;
      }
      setItems(extractList<AdminUserItem>(data));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function cancelCreate() {
    setCreating(false);
    setEmail("");
    setPassword("");
    setCurrentPassword("");
    setCreateCode("");
  }

  function cancelDelete() {
    setConfirmingId(null);
    setDeletePassword("");
    setDeleteCode("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          current_password: currentPassword,
          ...(mfaEnabled && createCode.trim() ? { code: createCode.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (redirectIfUnauthorized(res.status, data?.error)) return;
        if (data?.error === "mfa_code_required") markRequired();
        setError(
          mfaErrorMessage(res.status, data?.error) ??
            CREATE_ERRORS[data?.error] ??
            "Não foi possível criar o usuário."
        );
        return;
      }

      const created = await res.json().catch(() => ({}));
      setSuccess(`Usuário ${created?.email ?? email} criado.`);
      cancelCreate();
      await load();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    setSuccess(null);
    const current_password = deletePassword;
    const code = deleteCode.trim();
    cancelDelete();
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password, ...(mfaEnabled && code ? { code } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (redirectIfUnauthorized(res.status, data?.error)) return;
        if (data?.error === "mfa_code_required") markRequired();
        setError(
          mfaErrorMessage(res.status, data?.error) ??
            DELETE_ERRORS[data?.error] ??
            "Não foi possível excluir."
        );
        return;
      }
      setSuccess("Usuário excluído.");
      await load();
    } catch {
      setError("Falha de conexão.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-adm-ink">Usuários do painel</h1>

      {error && (
        <p className="rounded-sm border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-sm border border-adm-success-line bg-adm-success-soft px-4 py-3 text-sm text-adm-success-ink">
          {success}
        </p>
      )}

      {creating && (
        <div className="rounded-sm border border-adm-border bg-white shadow-xs">
          <div className="border-b border-adm-border px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
              Novo usuário
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4">
            <div className="max-w-md">
              <label htmlFor="usr-field-1" className="mb-1 block text-xs font-semibold text-adm-body">E-mail</label>
              <input id="usr-field-1"
                required
                type="email"
                autoComplete="off"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="max-w-md">
              <label htmlFor="usr-field-2" className="mb-1 block text-xs font-semibold text-adm-body">
                Senha inicial (mínimo {ADMIN_PASSWORD_MIN_LENGTH} caracteres)
              </label>
              <input id="usr-field-2"
                required
                type="password"
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                value={password}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="max-w-md">
              <label htmlFor="usr-field-3" className="mb-1 block text-xs font-semibold text-adm-body">
                Sua senha atual (confirmação)
              </label>
              <input id="usr-field-3"
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                maxLength={128}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            {mfaEnabled && (
              <div className="max-w-md">
                <MfaCodeField id="usr-mfa-create" value={createCode} onChange={setCreateCode} />
              </div>
            )}
            <div className="flex items-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-sm bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60"
              >
                {saving ? "Criando..." : "Criar usuário"}
              </button>
              <button
                type="button"
                onClick={cancelCreate}
                className="rounded-sm border border-adm-border-strong px-5 py-2 text-sm text-adm-body transition hover:bg-adm-canvas"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-sm border border-adm-border bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Usuários cadastrados
          </h2>
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setError(null);
                setSuccess(null);
              }}
              className="rounded-sm bg-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-accent-strong"
            >
              + Novo usuário
            </button>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-adm-muted">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-adm-canvas text-xs font-bold uppercase tracking-wide text-adm-muted">
                <tr>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-adm-canvas">
                    <td className="min-w-36 break-all px-4 py-3 font-medium text-adm-ink">{item.email}</td>
                    <td className="px-4 py-3 text-adm-body">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {confirmingId === item.id ? (
                          <>
                            <input
                              type="password"
                              autoComplete="current-password"
                              placeholder="Sua senha atual"
                              aria-label="Sua senha atual"
                              value={deletePassword}
                              maxLength={128}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              className="w-40 rounded-sm border border-adm-border-strong px-2 py-2.5 text-xs text-adm-ink lg:py-1 focus:border-adm-focus focus:outline-hidden"
                            />
                            {mfaEnabled && (
                              <div className="w-44">
                                <MfaCodeField
                                  id={`usr-mfa-delete-${item.id}`}
                                  value={deleteCode}
                                  onChange={setDeleteCode}
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={!deletePassword || (mfaEnabled === true && !deleteCode.trim())}
                              onClick={() => handleDelete(item.id)}
                              className="rounded-sm bg-adm-danger px-2.5 py-2.5 text-xs lg:py-1 font-semibold text-white transition hover:bg-adm-danger-strong disabled:opacity-60"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={cancelDelete}
                              className="rounded-sm border border-adm-border-strong px-2.5 py-2.5 text-xs lg:py-1 text-adm-body transition hover:bg-adm-canvas"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDeletePassword("");
                              setDeleteCode("");
                              setConfirmingId(item.id);
                            }}
                            className="rounded-sm border border-adm-danger px-2.5 py-2.5 text-xs lg:py-1 font-semibold text-adm-danger transition hover:bg-adm-danger hover:text-white"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-adm-muted">
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
