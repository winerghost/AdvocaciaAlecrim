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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Depoimentos</h1>
        {editingId === null && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gold-dark"
          >
            Novo depoimento
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
            <label className="mb-1 block text-xs font-medium text-slate-muted">Autor</label>
            <input
              required
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Cargo/Função</label>
            <input
              required
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-muted">Depoimento</label>
            <textarea
              required
              rows={3}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Nota (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={form.approved}
                onChange={(e) => setForm((f) => ({ ...f, approved: e.target.checked }))}
              />
              Aprovado (aparece no site)
            </label>
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
                <th className="px-4 py-3">Autor</th>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Aprovado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-navy/10">
                  <td className="px-4 py-3 font-medium text-navy">{item.author}</td>
                  <td className="px-4 py-3">{item.rating}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleApproved(item)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.approved
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-bg text-slate-muted"
                      }`}
                    >
                      {item.approved ? "Aprovado" : "Pendente"}
                    </button>
                  </td>
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
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-muted">
                    Nenhum depoimento cadastrado.
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
