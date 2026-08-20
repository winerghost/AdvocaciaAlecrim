"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminService } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";

type FormState = {
  slug: string;
  title: string;
  icon: string;
  description: string;
  order: string;
};

const EMPTY_FORM: FormState = { slug: "", title: "", icon: "", description: "", order: "0" };

export default function ServicesManager() {
  const [items, setItems] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Não foi possível carregar os serviços.");
        return;
      }
      setItems(extractList<AdminService>(data));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setEditingId(0);
    setForm(EMPTY_FORM);
  }

  function startEdit(item: AdminService) {
    setEditingId(item.id);
    setForm({
      slug: item.slug,
      title: item.title,
      icon: item.icon,
      description: item.description,
      order: String(item.order ?? 0),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const isCreate = !editingId;
    const payload = {
      slug: form.slug,
      title: form.title,
      icon: form.icon,
      description: form.description,
      order: Number(form.order) || 0,
    };

    try {
      const res = await fetch(
        isCreate ? "/api/admin/services" : `/api/admin/services/${editingId}`,
        {
          method: isCreate ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "validation_error"
            ? "Confira os campos do formulário."
            : "Não foi possível salvar."
        );
        return;
      }

      cancelEdit();
      await load();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir este serviço?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Não foi possível excluir.");
        return;
      }
      await load();
    } catch {
      setError("Falha de conexão.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-[#343a40]">Serviços</h1>

      {error && (
        <p className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-4 py-3 text-sm text-[#842029]">
          {error}
        </p>
      )}

      {editingId !== null && (
        <div className="rounded border border-[#dee2e6] bg-white shadow-sm">
          <div className="border-b border-[#dee2e6] px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#343a40]">
              {editingId ? "Editar serviço" : "Novo serviço"}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#495057]">Slug</label>
              <input
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#495057]">Ícone</label>
              <input
                required
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#495057]">Título</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#495057]">Descrição</label>
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#495057]">Ordem</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                className="w-full rounded border border-[#ced4da] px-3 py-2 text-sm text-[#343a40] focus:border-[#80bdff] focus:outline-none focus:ring focus:ring-[#007bff]/25"
              />
            </div>
            <div className="flex items-end gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[#007bff] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0069d9] disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
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
            Serviços cadastrados
          </h2>
          {editingId === null && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded bg-[#007bff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0069d9]"
            >
              + Novo serviço
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
                  <th className="px-4 py-3">Ordem</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Ícone</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#f4f6f9]">
                    <td className="px-4 py-3 text-[#495057]">{item.order}</td>
                    <td className="px-4 py-3 font-medium text-[#343a40]">{item.title}</td>
                    <td className="px-4 py-3 text-[#6c757d]">{item.slug}</td>
                    <td className="px-4 py-3 text-[#6c757d]">{item.icon}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded border border-[#007bff] px-2.5 py-1 text-xs font-semibold text-[#007bff] transition hover:bg-[#007bff] hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="rounded border border-[#dc3545] px-2.5 py-1 text-xs font-semibold text-[#dc3545] transition hover:bg-[#dc3545] hover:text-white"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#6c757d]">
                      Nenhum serviço cadastrado.
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
