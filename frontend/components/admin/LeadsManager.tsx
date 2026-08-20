"use client";

import { useEffect, useState } from "react";
import type { AdminLead } from "@/lib/adminTypes";
import { extractList } from "@/lib/adminTypes";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

export default function LeadsManager() {
  const [items, setItems] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Não foi possível carregar os leads.");
        return;
      }
      setItems(extractList<AdminLead>(data));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: number) {
    if (!confirm("Excluir este lead? Essa ação não pode ser desfeita.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
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
        <h1 className="text-xl font-semibold text-navy">Leads</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-navy/15 px-4 py-2 text-sm text-navy transition hover:bg-slate-bg"
        >
          Atualizar
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-muted">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-bg text-xs uppercase tracking-wide text-slate-muted">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Mensagem</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-navy/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-muted">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-navy">{item.name}</td>
                  <td className="px-4 py-3 text-slate-muted">{item.phone}</td>
                  <td className="px-4 py-3 text-slate-muted">{item.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-muted">{item.area || "—"}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-muted">{item.message || "—"}</td>
                  <td className="px-4 py-3 text-right">
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
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-muted">
                    Nenhum lead recebido ainda.
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
