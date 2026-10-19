import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

// Estado da conta logada (e-mail, nome, MFA, datas). A autenticação é a do
// cookie, via proxyAdmin.
export async function GET() {
  return proxyAdmin("/api/admin/me", { method: "GET" });
}

// Perfil (Configurações > Perfil): nome e e-mail. Trocar o e-mail exige
// senha + 2º fator no Flask; o proxyAdmin já repassa o IP para o rate limit.
export async function PUT(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  return proxyAdmin("/api/admin/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}
