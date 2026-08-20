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
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-[#343a40]">Leads</h1>

      {error && (
        <p className="rounded border border-[#f5c2c7] bg-[#f8d7da] px-4 py-3 text-sm text-[#842029]">
          {error}
        </p>
      )}

      <div className="rounded border border-[#dee2e6] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#dee2e6] px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#343a40]">
            Leads recebidos
          </h2>
          <button
            type="button"
            onClick={load}
            className="rounded border border-[#ced4da] px-3 py-1.5 text-xs font-semibold text-[#495057] transition hover:bg-[#f4f6f9]"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-[#6c757d]">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f4f6f9] text-xs font-bold uppercase tracking-wide text-[#6c757d]">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Área</th>
                  <th className="px-4 py-3">Mensagem</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-[#f4f6f9]">
                    <td className="whitespace-nowrap px-4 py-3 text-[#6c757d]">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#343a40]">{item.name}</td>
                    <td className="px-4 py-3 text-[#6c757d]">{item.phone}</td>
                    <td className="px-4 py-3 text-[#6c757d]">{item.email || "—"}</td>
                    <td className="px-4 py-3 text-[#6c757d]">{item.area || "—"}</td>
                    <td className="max-w-xs px-4 py-3 text-[#6c757d]">{item.message || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
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
                    <td colSpan={7} className="px-4 py-6 text-center text-[#6c757d]">
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
