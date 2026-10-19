import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ group: string }> };

// Allowlist dos grupos: o segmento nunca vira um caminho arbitrário no Flask.
const GROUPS = new Set(["site", "notifications"]);

export async function GET(_request: Request, { params }: RouteContext) {
  const { group } = await params;
  if (!GROUPS.has(group)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return proxyAdmin(`/api/admin/settings/${group}`);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { group } = await params;
  if (!GROUPS.has(group)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Exige senha + 2º fator: o proxyAdmin já repassa o IP para o rate limit.
  return proxyAdmin(`/api/admin/settings/${group}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}
