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
      <h1 className="text-lg font-bold text-adm-ink">Serviços</h1>

      {error && (
        <p className="rounded border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}

      {editingId !== null && (
        <div className="rounded border border-adm-border bg-white shadow-sm">
          <div className="border-b border-adm-border px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
              {editingId ? "Editar serviço" : "Novo serviço"}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Slug</label>
              <input
                required
                value={form.slug}
                maxLength={80}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Ícone</label>
              <input
                required
                value={form.icon}
                maxLength={40}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-adm-body">Título</label>
              <input
                required
                value={form.title}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-adm-body">Descrição</label>
              <textarea
                required
                rows={3}
                value={form.description}
                maxLength={4000}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Ordem</label>
              <input
                type="number"
                value={form.order}
                min={0}
                max={9999}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="flex items-end gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-adm-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-adm-accent-strong disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded border border-adm-border-strong px-5 py-2 text-sm text-adm-body transition hover:bg-adm-canvas"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded border border-adm-border bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Serviços cadastrados
          </h2>
          {editingId === null && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded bg-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-accent-strong"
            >
              + Novo serviço
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
                  <th className="px-4 py-3">Ordem</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Ícone</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-adm-canvas">
                    <td className="px-4 py-3 text-adm-body">{item.order}</td>
                    <td className="px-4 py-3 font-medium text-adm-ink">{item.title}</td>
                    <td className="px-4 py-3 text-adm-muted">{item.slug}</td>
                    <td className="px-4 py-3 text-adm-muted">{item.icon}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded border border-adm-accent px-2.5 py-2.5 text-xs lg:py-1 font-semibold text-adm-accent transition hover:bg-adm-accent hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="rounded border border-adm-danger px-2.5 py-2.5 text-xs lg:py-1 font-semibold text-adm-danger transition hover:bg-adm-danger hover:text-white"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-adm-muted">
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
