import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

// Devolve o HTML do artigo depois de passar pelo MESMO sanitizador que o
// backend aplica ao salvar. A pré-visualização do painel renderiza só o que
// volta daqui - nunca o HTML cru do editor. Não grava nada.
// (Segmento estático: tem prioridade sobre ../[id]/route.ts, que de todo
// modo rejeitaria "preview" em isValidId.)
export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  return proxyAdmin("/api/admin/articles/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}
