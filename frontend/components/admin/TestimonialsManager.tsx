"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminTestimonial } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";

type FormState = {
  author: string;
  role: string;
  content: string;
  rating: string;
  approved: boolean;
};

const EMPTY_FORM: FormState = { author: "", role: "", content: "", rating: "5", approved: true };

export default function TestimonialsManager() {
  const [items, setItems] = useState<AdminTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/testimonials", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Não foi possível carregar os depoimentos.");
        return;
      }
      setItems(extractList<AdminTestimonial>(data));
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

  function startEdit(item: AdminTestimonial) {
    setEditingId(item.id);
    setForm({
      author: item.author,
      role: item.role,
      content: item.content,
      rating: String(item.rating ?? 5),
      approved: Boolean(item.approved),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save(payload: FormState & { id?: number }) {
    setError(null);
    const { id, ...rest } = payload;
    const body = { ...rest, rating: Number(rest.rating) || 5 };
    const isCreate = !id;

    try {
      const res = await fetch(
        isCreate ? "/api/admin/testimonials" : `/api/admin/testimonials/${id}`,
        {
          method: isCreate ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "validation_error"
            ? "Confira os campos do formulário."
            : "Não foi possível salvar."
        );
        return false;
      }

      await load();
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const ok = await save({ ...form, id: editingId || undefined });
    setSaving(false);
    if (ok) cancelEdit();
  }

  async function toggleApproved(item: AdminTestimonial) {
    await save({
      id: item.id,
      author: item.author,
      role: item.role,
      content: item.content,
      rating: String(item.rating),
      approved: !item.approved,
    });
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir este depoimento?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, { method: "DELETE" });
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
      <h1 className="text-lg font-bold text-adm-ink">Depoimentos</h1>

      {error && (
        <p className="rounded border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}

      {editingId !== null && (
        <div className="rounded border border-adm-border bg-white shadow-sm">
          <div className="border-b border-adm-border px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
              {editingId ? "Editar depoimento" : "Novo depoimento"}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Autor</label>
              <input
                required
                value={form.author}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">
                Cargo/Função
              </label>
              <input
                required
                value={form.role}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-adm-body">
                Depoimento
              </label>
              <textarea
                required
                rows={3}
                value={form.content}
                maxLength={4000}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">
                Nota (1-5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-adm-body">
                <input
                  type="checkbox"
                  checked={form.approved}
                  onChange={(e) => setForm((f) => ({ ...f, approved: e.target.checked }))}
                  className="h-4 w-4 rounded border-adm-border-strong text-adm-accent focus:ring-adm-accent/25"
                />
                Aprovado (aparece no site)
              </label>
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
            Depoimentos cadastrados
          </h2>
          {editingId === null && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded bg-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-accent-strong"
            >
              + Novo depoimento
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
                  <th className="px-4 py-3">Autor</th>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-adm-canvas">
                    <td className="px-4 py-3 font-medium text-adm-ink">{item.author}</td>
                    <td className="px-4 py-3 text-adm-body">{item.rating}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleApproved(item)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          item.approved
                            ? "border border-adm-success bg-adm-success-soft text-adm-success-ink hover:bg-adm-success hover:text-white"
                            : "border border-adm-border-strong bg-adm-canvas text-adm-muted hover:bg-adm-surface-2"
                        }`}
                      >
                        {item.approved ? "Aprovado" : "Pendente"}
                      </button>
                    </td>
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
                    <td colSpan={4} className="px-4 py-6 text-center text-adm-muted">
                      Nenhum depoimento cadastrado.
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
