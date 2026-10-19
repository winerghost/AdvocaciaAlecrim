import { proxyAdmin } from "@/lib/adminProxy";

const GROUPS = new Set(["access", "content", "leads", "users", "settings"]);

// Repassa só parâmetros conhecidos e já validados - nada da query string
// do navegador vai cru para o Flask.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  const page = Number(url.searchParams.get("page"));
  if (Number.isInteger(page) && page > 0 && page <= 10_000) params.set("page", String(page));
  params.set("per_page", "50");
  const group = url.searchParams.get("group");
  if (group && GROUPS.has(group)) params.set("group", group);
  return proxyAdmin(`/api/admin/audit?${params.toString()}`, { method: "GET" });
}
