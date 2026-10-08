"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminUserItem } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";

const INPUT_CLASS =
  "w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25";

const CREATE_ERRORS: Record<string, string> = {
  invalid_email: "E-mail inválido.",
  weak_password: "A senha precisa ter pelo menos 10 caracteres.",
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
  }

  function cancelDelete() {
    setConfirmingId(null);
    setDeletePassword("");
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
        body: JSON.stringify({ email, password, current_password: currentPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(CREATE_ERRORS[data?.error] ?? "Não foi possível criar o usuário.");
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
    cancelDelete();
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(DELETE_ERRORS[data?.error] ?? "Não foi possível excluir.");
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
      <h1 className="text-lg font-bold text-[#343a40]">Usuários do painel</h1>

      {error && (
        <p className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-4 py-3 text-sm text-[#842029]">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded border border-[#badbcc] bg-[#d1e7dd] px-4 py-3 text-sm text-[#0f5132]">
          {success}
        </p>
      )}

      {creating && (
        <div className="rounded border border-[#dee2e6] bg-white shadow-sm">
          <div className="border-b border-[#dee2e6] px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#343a40]">
              Novo usuário
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4">
            <div className="max-w-md">
              <label className="mb-1 block text-xs font-semibold text-[#495057]">E-mail</label>
              <input
                required
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="max-w-md">
              <label className="mb-1 block text-xs font-semibold text-[#495057]">
                Senha inicial (mínimo 10 caracteres)
              </label>
              <input
                required
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="max-w-md">
              <label className="mb-1 block text-xs font-semibold text-[#495057]">
                Sua senha atual (confirmação)
              </label>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[#007bff] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0069d9] disabled:opacity-60"
              >
                {saving ? "Criando..." : "Criar usuário"}
              </button>
              <button
                type="button"
                onClick={cancelCreate}
                className="rounded border border-[#ced4da] px-5 py-2 text-sm text-[#495057] transition hover:bg-[#f4f6f9]"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded border border-[#dee2e6] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#dee2e6] px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#343a40]">
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
              className="rounded bg-[#007bff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0069d9]"
            >
              + Novo usuário
            </button>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-[#6c757d]">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f4f6f9] text-xs font-bold uppercase tracking-wide text-[#6c757d]">
                <tr>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#f4f6f9]">
                    <td className="px-4 py-3 font-medium text-[#343a40]">{item.email}</td>
                    <td className="px-4 py-3 text-[#495057]">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {confirmingId === item.id ? (
                          <>
                            <input
                              type="password"
                              autoComplete="current-password"
                              placeholder="Sua senha atual"
                              aria-label="Sua senha atual"
                              value={deletePassword}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              className="w-40 rounded border border-[#ced4da] px-2 py-1 text-xs text-[#343a40] focus:border-[#80bdff] focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={!deletePassword}
                              onClick={() => handleDelete(item.id)}
                              className="rounded bg-[#dc3545] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#bb2d3b] disabled:opacity-60"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={cancelDelete}
                              className="rounded border border-[#ced4da] px-2.5 py-1 text-xs text-[#495057] transition hover:bg-[#f4f6f9]"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDeletePassword("");
                              setConfirmingId(item.id);
                            }}
                            className="rounded border border-[#dc3545] px-2.5 py-1 text-xs font-semibold text-[#dc3545] transition hover:bg-[#dc3545] hover:text-white"
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
                    <td colSpan={3} className="px-4 py-6 text-center text-[#6c757d]">
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
