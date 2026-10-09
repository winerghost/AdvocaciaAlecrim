"use client";

import { useEffect, useState } from "react";
import type { AdminLead, LeadStatus } from "@/lib/adminTypes";
import { extractList, LEAD_STATUS_LABELS } from "@/lib/adminTypes";

const STATUS_OPTIONS = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

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

  async function handleStatusChange(id: number, status: LeadStatus) {
    setError(null);
    // Otimista: atualiza a UI na hora, sem esperar o round-trip - reverte
    // via `load()` se a chamada falhar.
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError("Não foi possível atualizar o status.");
        await load();
      }
    } catch {
      setError("Falha de conexão.");
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-adm-ink">Leads</h1>

      {error && (
        <p className="rounded border border-adm-danger-line bg-adm-danger-soft px-4 py-3 text-sm text-adm-danger-ink">
          {error}
        </p>
      )}

      <div className="rounded border border-adm-border bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-adm-border px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-adm-ink">
            Leads recebidos
          </h2>
          <button
            type="button"
            onClick={load}
            className="rounded border border-adm-border-strong whitespace-nowrap px-3 py-2.5 text-xs font-semibold lg:py-1.5 text-adm-body transition hover:bg-adm-canvas"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-adm-muted">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-adm-canvas text-xs font-bold uppercase tracking-wide text-adm-muted">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Área</th>
                  <th className="px-4 py-3">Mensagem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-border">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-adm-canvas">
                    <td className="whitespace-nowrap px-4 py-3 text-adm-muted">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-adm-ink">{item.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-adm-muted">{item.phone}</td>
                    <td className="px-4 py-3 text-adm-muted">{item.email || "—"}</td>
                    <td className="px-4 py-3 text-adm-muted">{item.area || "—"}</td>
                    <td className="max-w-xs px-4 py-3 text-adm-muted">{item.message || "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={item.status}
                        onChange={(e) => handleStatusChange(item.id, e.target.value as LeadStatus)}
                        className="rounded border border-adm-border-strong bg-white px-2 py-2.5 text-xs font-medium text-adm-ink lg:py-1"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {LEAD_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
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
                    <td colSpan={8} className="px-4 py-6 text-center text-adm-muted">
                      Nenhum lead recebido ainda.
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
