import { proxyAdminJsonPost } from "@/lib/adminMfaProxy";

// Repassa o IP do visitante (rate limit do Flask) e, como a troca de senha
// derruba todas as sessões, grava no cookie o token novo que o Flask devolve
// e o remove do corpo enviado ao navegador (ver lib/adminMfaProxy.ts).
export async function POST(request: Request) {
  return proxyAdminJsonPost(request, "/api/admin/change-password", {
    rotatesSession: true,
  });
}
