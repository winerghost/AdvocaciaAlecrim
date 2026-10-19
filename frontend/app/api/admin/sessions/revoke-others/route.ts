import { proxyAdminJsonPost } from "@/lib/adminMfaProxy";

// Encerra as outras sessões: o Flask derruba todos os tokens e devolve um
// novo, que vai para o cookie desta sessão (ver lib/adminMfaProxy.ts).
export async function POST(request: Request) {
  return proxyAdminJsonPost(request, "/api/admin/sessions/revoke-others", { rotatesSession: true });
}
