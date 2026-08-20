import { NextResponse } from "next/server";

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Proxy simples: o navegador só fala com o Next; o Flask fica só na rede
// interna do docker-compose, sem porta pública exposta.
//
// Este handler NÃO reimplementa validação de negócio (formato de e-mail,
// telefone, tamanho de campos, obrigatoriedade, LGPD etc.) - isso é feito
// e é fonte de verdade só no backend Flask (app/schemas/lead.py). Aqui só
// checamos a FORMA básica do corpo (é um objeto JSON) para evitar repassar
// lixo óbvio e devolver um 500 feio; qualquer regra "de verdade" retorna
// como validation_error vindo do Flask e é só repassada ao cliente.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
