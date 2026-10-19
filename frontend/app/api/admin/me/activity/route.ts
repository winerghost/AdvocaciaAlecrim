import { proxyAdmin } from "@/lib/adminProxy";

export async function GET() {
  return proxyAdmin("/api/admin/me/activity?limit=30", { method: "GET" });
}
