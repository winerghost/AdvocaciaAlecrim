import { proxyAdmin } from "@/lib/adminProxy";

// Estado da conta logada (e-mail, MFA ativo, códigos de recuperação
// restantes). Só leitura; a autenticação é a do cookie, via proxyAdmin.
export async function GET() {
  return proxyAdmin("/api/admin/me", { method: "GET" });
}
