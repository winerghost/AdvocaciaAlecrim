import { proxyAdminJsonPost } from "@/lib/adminMfaProxy";

export async function POST(request: Request) {
  return proxyAdminJsonPost(request, "/api/admin/mfa/enable", { rotatesSession: true });
}
