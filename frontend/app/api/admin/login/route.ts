import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME } from "@/lib/adminProxy";

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Único route handler que SETA o cookie admin_session. O token do Flask
// nunca é devolvido ao browser: fica só dentro do cookie httpOnly, e a
// resposta ao client só confirma sucesso/falha.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Repassa o IP real do visitante (setado pelo Nginx do host, ver
  // DEPLOY-HOSTINGER.md) para o Flask - sem isso, o rate limit de login
  // (`5 per 15 minutes`) enxerga sempre o IP interno do container do Next,
  // e vira um limite global compartilhado por todo mundo em vez de por
  // atacante. O Flask confia nesse header via ProxyFix (app/__init__.py),
  // que só considera 1 hop - o do Next, único caminho pra chegar até ele.
  const forwardedFor = request.headers.get("x-forwarded-for");

  const res = await fetch(`${API_URL}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Repassa status (401 credenciais inválidas, 429 rate limit etc.) sem
    // vazar detalhe extra - o form no client mostra sempre mensagem genérica.
    return NextResponse.json(data, { status: res.status });
  }

  const token = typeof data?.token === "string" ? data.token : null;
  const expiresIn = typeof data?.expires_in === "number" ? data.expires_in : 14400;

  if (!token) {
    return NextResponse.json({ error: "invalid_response" }, { status: 502 });
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: expiresIn,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
