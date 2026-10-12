import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";
import { setAdminSessionCookie } from "@/lib/adminSession";
import { forwardedForHeader } from "@/lib/clientIp";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST com corpo JSON repassado ao Flask pelo proxy admin (cookie -> Bearer).
 * Usado pelas rotas /api/admin/mfa/*. Mesmo padrão de change-password:
 * repassa o IP do visitante para os rate limits do Flask enxergarem o
 * atacante e não o container do Next.
 *
 * `rotatesSession`: ativar/desativar o MFA e regenerar códigos revogam a
 * sessão anterior e o Flask devolve `token`/`expires_in` de uma sessão nova.
 * Aqui o token vai para o cookie httpOnly e é REMOVIDO do corpo, que segue
 * ao navegador sem ele. Sem `token` na resposta, nada muda.
 */
export async function proxyAdminJsonPost(
  request: Request,
  path: string,
  options: { rotatesSession?: boolean } = {}
): Promise<NextResponse> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  const res = await proxyAdmin(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...forwardedForHeader(request),
    },
    body: JSON.stringify(parsed.body),
  });

  if (!options.rotatesSession || !res.ok) return res;

  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({}, { status: res.status, headers: NO_STORE });
  }

  const { token, expires_in: expiresIn, ...rest } = data as Record<string, unknown>;
  if (typeof token === "string") {
    await setAdminSessionCookie({ token, expires_in: expiresIn });
  }
  return NextResponse.json(rest, { status: res.status, headers: NO_STORE });
}
