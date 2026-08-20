import { proxyAdmin } from "@/lib/adminProxy";

// Só leitura - criação/edição de lead não existe no painel (leads vêm
// exclusivamente do formulário público em app/api/leads/route.ts).
export async function GET() {
  return proxyAdmin("/api/admin/leads");
}
