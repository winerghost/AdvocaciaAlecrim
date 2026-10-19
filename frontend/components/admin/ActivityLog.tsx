"use client";

import { useCallback, useEffect, useState } from "react";
import { redirectIfUnauthorized } from "@/lib/adminMfaClient";
import { describeUserAgent, eventLabel, formatDateTime, isWarningEvent } from "@/lib/adminFormat";
import { LoadingOrError, SECONDARY_BTN, SettingsCard } from "@/components/admin/settingsUi";

type AuditItem = {
  id: number;
  created_at: string | null;
  event: string;
  actor_id: number | null;
  actor_email?: string | null;
  target: string | null;
  detail: Record<string, string>;
  ip: string | null;
  user_agent: string | null;
};

type Meta = { page: number; per_page: number; total: number; pages: number };

const GROUPS: { value: string; label: string }[] = [
  { value: "", label: "Tudo" },
  { value: "access", label: "Acessos e segurança" },
  { value: "content", label: "Conteúdo" },
  { value: "leads", label: "Leads" },
  { value: "users", label: "Usuários" },
  { value: "settings", label: "Configurações" },
];

const TARGET_LABELS: Record<string, string> = {
  article: "Artigo",
  service: "Serviço",
  testimonial: "Depoimento",
  faq: "FAQ",
  lead: "Lead",
  admin: "Administrador",
};

// Detalhes que só fazem sentido para o operador técnico.
const HIDDEN_DETAIL_KEYS = new Set(["email"]);

function targetLabel(target: string | null): string | null {
  if (!target) return null;
  const match = /^([a-z_]+)#(\d+)$/.exec(target);
  if (!match) return target;
  return `${TARGET_LABELS[match[1]] ?? match[1]} #${match[2]}`;
}

function detailText(item: AuditItem): string | null {
  const parts = Object.entries(item.detail ?? {})
    .filter(([key]) => !HIDDEN_DETAIL_KEYS.has(key) || item.event.startsWith("admin_user_"))
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? parts.join(" · ") : null;
}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (redirectIfUnauthorized(res.status, body?.error)) return null;
  if (!res.ok || !Array.isArray(body?.data)) throw new Error("load_failed");
  return body;
}

function EventRow({ item, showActor }: { item: AuditItem; showActor: boolean }) {
  const target = targetLabel(item.target);
  const detail = detailText(item);
  const warn = isWarningEvent(item.event);
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className={`text-sm font-medium ${warn ? "text-adm-danger-ink" : "text-adm-ink"}`}>
          {eventLabel(item.event)}
          {target && <span className="font-normal text-adm-muted"> · {target}</span>}
        </p>
        <p className="text-xs text-adm-muted">
          {showActor && (
            <>
              {item.actor_email ?? (item.actor_id ? `Admin #${item.actor_id} (removido)` : "Não identificado")}
              {" · "}
            </>
          )}
          {describeUserAgent(item.user_agent)}
          {item.ip ? ` · IP ${item.ip}` : ""}
        </p>
        {detail && <p className="break-words text-xs text-adm-muted">{detail}</p>}
      </div>
      <time dateTime={item.created_at ?? undefined} className="shrink-0 text-xs text-adm-muted">
        {formatDateTime(item.created_at) ?? "-"}
      </time>
    </li>
  );
}

function MyAccess() {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const body = await getJson("/api/admin/me/activity");
      if (!body) return;
      setItems(body.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  return (
    <SettingsCard
      title="Seus acessos"
      description="Logins, saídas e mudanças de segurança da sua conta. Se aparecer algo que não foi você, troque a senha e use “Sair de outros dispositivos” em Segurança."
    >
      {status !== "ready" ? (
        <LoadingOrError status={status} onRetry={load} />
      ) : items && items.length > 0 ? (
        <ul className="divide-y divide-adm-border">
          {items.map((item) => (
            <EventRow key={item.id} item={item} showActor={false} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-adm-muted">Nenhum acesso registrado ainda.</p>
      )}
    </SettingsCard>
  );
}

function PanelActivity() {
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (group) params.set("group", group);
      const body = await getJson(`/api/admin/audit?${params.toString()}`);
      if (!body) return;
      setItems(body.data);
      setMeta(body.meta ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [group, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega ao trocar filtro/página
    void load();
  }, [load]);

  return (
    <SettingsCard
      title="Atividade do painel"
      description="O que todos os administradores fizeram. Os registros são guardados por 90 dias e não podem ser editados nem apagados pelo painel."
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="audit_group" className="text-xs font-semibold text-adm-body">
          Mostrar
        </label>
        <select
          id="audit_group"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(1);
          }}
          className="rounded-sm border border-adm-border-strong px-2 py-1.5 text-sm text-adm-ink"
        >
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        {meta && status === "ready" && (
          <span className="text-xs text-adm-muted">{meta.total} registro(s)</span>
        )}
      </div>

      {status !== "ready" ? (
        <LoadingOrError status={status} onRetry={load} />
      ) : items.length > 0 ? (
        <ul className="divide-y divide-adm-border">
          {items.map((item) => (
            <EventRow key={item.id} item={item} showActor />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-adm-muted">Nenhum registro.</p>
      )}

      {meta && meta.pages > 1 && (
        <nav aria-label="Páginas da atividade" className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || status === "loading"}
            className={SECONDARY_BTN}
          >
            Anterior
          </button>
          <span className="text-xs text-adm-muted">
            Página {meta.page} de {meta.pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
            disabled={page >= meta.pages || status === "loading"}
            className={SECONDARY_BTN}
          >
            Próxima
          </button>
        </nav>
      )}
    </SettingsCard>
  );
}

export default function ActivityLog() {
  return (
    <div className="max-w-3xl space-y-6">
      <MyAccess />
      <PanelActivity />
    </div>
  );
}
