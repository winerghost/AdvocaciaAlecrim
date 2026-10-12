import { NextResponse } from "next/server";
import { forwardedForHeader } from "@/lib/clientIp";
import { isCrossSiteRequest } from "@/lib/csrf";
import {
  clearAdminMfaCookie,
  getAdminMfaToken,
  setAdminSessionCookie,
} from "@/lib/adminSession";

const NO_STORE = { "Cache-Control": "no-store" };

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Limite folgado para o código de recuperação (o formato exato é do Flask);
// só impede repassar lixo de tamanho absurdo.
const RECOVERY_CODE_MAX_LENGTH = 64;

// 2º passo do login com MFA. O mfa_token vem do cookie httpOnly setado por
// app/api/admin/login/route.ts - nunca do corpo da requisição, nunca do JS.
// Em sucesso seta o cookie de sessão (mesmo helper do login) e apaga o do MFA.
export async function POST(request: Request) {
  if (isCrossSiteRequest(request.headers)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  // Aceita exatamente um dos dois: `code` (6 dígitos) ou `recovery_code`.
  const { code, recovery_code: recoveryCode } = body as Record<string, unknown>;
  let credential: { code: string } | { recovery_code: string };
  if (typeof code === "string" && /^\d{6}$/.test(code.trim()) && recoveryCode === undefined) {
    credential = { code: code.trim() };
  } else if (
    typeof recoveryCode === "string" &&
    recoveryCode.trim().length > 0 &&
    recoveryCode.length <= RECOVERY_CODE_MAX_LENGTH &&
    code === undefined
  ) {
    credential = { recovery_code: recoveryCode.trim() };
  } else {
    return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: NO_STORE });
  }

  const mfaToken = await getAdminMfaToken();
  if (!mfaToken) {
    // Cookie expirou (5 min) ou nunca existiu: volta ao 1º passo.
    return NextResponse.json({ error: "invalid_mfa_token" }, { status: 401, headers: NO_STORE });
  }

  // Mesmo motivo do login: repassa o IP real do visitante para o rate limit.
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/login/mfa`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        ...forwardedForHeader(request),
      },
      body: JSON.stringify({ mfa_token: mfaToken, ...credential }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502, headers: NO_STORE });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // mfa_token inválido/expirado: o cookie não serve mais. Já `invalid_code`
    // mantém o cookie para o admin tentar de novo dentro dos 5 minutos.
    if (data?.error === "invalid_mfa_token") {
      await clearAdminMfaCookie();
    }
    // Repassa só o código de erro, nada além.
    const error = typeof data?.error === "string" ? data.error : "invalid_code";
    return NextResponse.json({ error }, { status: res.status, headers: NO_STORE });
  }

  if (!(await setAdminSessionCookie(data))) {
    return NextResponse.json({ error: "invalid_response" }, { status: 502, headers: NO_STORE });
  }
  await clearAdminMfaCookie();

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
