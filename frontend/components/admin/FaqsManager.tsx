"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminFaq } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";

type FormState = { question: string; answer: string; order: string };

const EMPTY_FORM: FormState = { question: "", answer: "", order: "0" };

export default function FaqsManager() {
  const [items, setItems] = useState<AdminFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/faqs", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Não foi possível carregar as perguntas.");
        return;
      }
      setItems(extractList<AdminFaq>(data));
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

  function startEdit(item: AdminFaq) {
    setEditingId(item.id);
    setForm({
      question: item.question,
      answer: item.answer,
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
      question: form.question,
      answer: form.answer,
      order: Number(form.order) || 0,
    };

    try {
      const res = await fetch(isCreate ? "/api/admin/faqs" : `/api/admin/faqs/${editingId}`, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
    if (!confirm("Excluir esta pergunta?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
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
        <h1 className="text-xl font-semibold text-navy">Perguntas frequentes</h1>
        {editingId === null && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gold-dark"
          >
            Nova pergunta
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {editingId !== null && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 grid gap-4 rounded-lg border border-navy/10 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Pergunta</label>
            <input
              required
              value={form.question}
              onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-muted">Resposta</label>
            <textarea
              required
              rows={4}
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="max-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-slate-muted">Ordem</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              className="w-full rounded-md border border-navy/15 px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-3">
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
                <th className="px-4 py-3">Pergunta</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-navy/10">
                  <td className="px-4 py-3">{item.order}</td>
                  <td className="px-4 py-3 font-medium text-navy">{item.question}</td>
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
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-muted">
                    Nenhuma pergunta cadastrada.
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
