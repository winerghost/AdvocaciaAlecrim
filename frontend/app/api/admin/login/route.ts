import { NextResponse } from "next/server";
import { setAdminMfaCookie, setAdminSessionCookie } from "@/lib/adminSession";
import { forwardedForHeader } from "@/lib/clientIp";
import { isCrossSiteRequest } from "@/lib/csrf";

const NO_STORE = { "Cache-Control": "no-store" };

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Junto com login/mfa, os únicos route handlers que SETAM o cookie
// admin_session (via lib/adminSession.ts). O token do Flask
// nunca é devolvido ao browser: fica só dentro do cookie httpOnly, e a
// resposta ao client só confirma sucesso/falha.
export async function POST(request: Request) {
  // Login CSRF: página de outro site não pode logar o navegador do admin em
  // uma conta escolhida por ela. Ver lib/csrf.ts.
  if (isCrossSiteRequest(request.headers)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  // Repassa o IP real do visitante (setado pelo Nginx do host, ver
  // DEPLOY-HOSTINGER.md) para o Flask - sem isso, o rate limit de login
  // (`5 per 15 minutes`) enxerga sempre o IP interno do container do Next,
  // e vira um limite global compartilhado por todo mundo em vez de por
  // atacante. O Flask confia nesse header via ProxyFix (app/__init__.py),
  // que só considera 1 hop - o do Next, único caminho pra chegar até ele.
  // Vai um único IP, o que o Nginx acrescentou, e nunca o header recebido do
  // cliente (ver lib/clientIp.ts).
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/login`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      ...forwardedForHeader(request),
    },
    body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502, headers: NO_STORE });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Repassa status (401 credenciais inválidas, 429 rate limit etc.) sem
    // vazar detalhe extra - o form no client mostra sempre mensagem genérica.
    return NextResponse.json(data, { status: res.status, headers: NO_STORE });
  }

  // Admin com MFA: o Flask devolve `mfa_required` + `mfa_token` (sem `token`).
  // O mfa_token vai só para um cookie httpOnly curto; o JavaScript recebe
  // apenas a indicação de que falta o 2º passo (app/api/admin/login/mfa).
  if (data?.mfa_required === true) {
    const mfaToken = typeof data?.mfa_token === "string" ? data.mfa_token : null;
    if (!mfaToken) {
      return NextResponse.json({ error: "invalid_response" }, { status: 502, headers: NO_STORE });
    }
    await setAdminMfaCookie(mfaToken, data?.expires_in);
    return NextResponse.json({ mfa_required: true }, { status: 200, headers: NO_STORE });
  }

  if (!(await setAdminSessionCookie(data))) {
    return NextResponse.json({ error: "invalid_response" }, { status: 502, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
