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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Serviços</h1>
        {editingId === null && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gold-dark"
          >
            Novo serviço
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {editingId !== null && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 grid gap-4 rounded-lg border border-navy/10 bg-white p-6 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Slug</label>
            <input
              required
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Ícone</label>
            <input
              required
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-muted">Título</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-muted">Descrição</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Ordem</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md border border-navy/15 px-5 py-2.5 text-sm text-navy transition hover:bg-slate-bg"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-muted">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-bg text-xs uppercase tracking-wide text-slate-muted">
              <tr>
                <th className="px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Ícone</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-navy/10">
                  <td className="px-4 py-3">{item.order}</td>
                  <td className="px-4 py-3 font-medium text-navy">{item.title}</td>
                  <td className="px-4 py-3 text-slate-muted">{item.slug}</td>
                  <td className="px-4 py-3 text-slate-muted">{item.icon}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="mr-3 text-gold-dark hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-muted">
                    Nenhum serviço cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
