import { NextResponse } from "next/server";
import { proxyAdmin } from "@/lib/adminProxy";
import {
  clearAdminMfaCookie,
  clearAdminSessionCookie,
  clearLegacyAdminSessionCookie,
} from "@/lib/adminSession";

// Sair = invalidar o token no Flask E apagar o cookie. O token é stateless,
// mas o Flask guarda uma versão por admin (POST /api/admin/logout sobe essa
// versão); sem essa chamada, um token copiado antes do "Sair" continuaria
// valendo até expirar sozinho.
//
// O cookie é apagado SEMPRE, dê o que der na chamada ao Flask (backend fora
// do ar, timeout, token já expirado/inválido = 401): o logout nunca pode
// ficar preso num erro de rede.
export async function POST() {
  try {
    // Sem cookie, proxyAdmin responde 401 sem nem chamar o Flask.
    await proxyAdmin("/api/admin/logout", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // De propósito sem tratamento - ver comentário acima.
  }

  await clearAdminSessionCookie();
  // Sobra do 2º passo do login, se o admin abandonou o fluxo no meio.
  await clearAdminMfaCookie();
  await clearLegacyAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
