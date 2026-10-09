import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, proxyAdmin } from "@/lib/adminProxy";

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

  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
