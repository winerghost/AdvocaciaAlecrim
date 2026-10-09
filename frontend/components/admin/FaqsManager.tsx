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
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-adm-ink">Perguntas frequentes</h1>

      {error && (
        <p className="rounded border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}

      {editingId !== null && (
        <div className="rounded border border-adm-border bg-white shadow-sm">
          <div className="border-b border-adm-border px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
              {editingId ? "Editar pergunta" : "Nova pergunta"}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Pergunta</label>
              <input
                required
                value={form.question}
                maxLength={255}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-adm-body">Resposta</label>
              <textarea
                required
                rows={4}
                value={form.answer}
                maxLength={4000}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                className="w-full rounded border border-adm-border-strong px-3 py-2 text-sm text-adm-ink focus:border-adm-focus focus:outline-none focus:ring focus:ring-adm-accent/25"
              />
            </div>
            <div className="max-w-[160px]">
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
            <div className="flex items-end gap-3">
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
            Perguntas cadastradas
          </h2>
          {editingId === null && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded bg-adm-accent whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-white transition hover:bg-adm-accent-strong"
            >
              + Nova pergunta
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
                  <th className="px-4 py-3">Pergunta</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-adm-canvas">
                    <td className="px-4 py-3 text-adm-body">{item.order}</td>
                    <td className="px-4 py-3 font-medium text-adm-ink">{item.question}</td>
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
                    <td colSpan={3} className="px-4 py-6 text-center text-adm-muted">
                      Nenhuma pergunta cadastrada.
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
