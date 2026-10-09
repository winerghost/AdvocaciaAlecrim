import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

// Assistente de IA do editor de artigos: repassa o pedido (redigir, melhorar
// ou corrigir o conteúdo/resumo) ao Flask, que é quem fala com a OpenAI e
// devolve o texto já sanitizado. Não grava nada - o painel mostra o retorno
// como sugestão e o admin decide se aplica.
// A resposta pode levar perto de um minuto (rascunho de artigo inteiro); não
// há timeout aqui, quem limita o tempo é o backend (504 ai_timeout).
// (Segmento estático: tem prioridade sobre ../[id]/route.ts, que de todo
// modo rejeitaria "ai" em isValidId.)
export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // O assistente é um extra: se o Flask estiver fora do ar ou derrubar a
  // conexão no meio do pedido, o painel recebe um erro JSON conhecido (e
  // mostra o aviso dentro do próprio assistente) em vez de um 500 do Next.
  try {
    return await proxyAdmin("/api/admin/articles/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.body),
    });
  } catch {
    return NextResponse.json({ error: "ai_upstream_error" }, { status: 502 });
  }
}
