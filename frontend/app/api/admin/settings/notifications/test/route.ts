import { proxyAdmin } from "@/lib/adminProxy";

export async function POST() {
  return proxyAdmin("/api/admin/settings/notifications/test", { method: "POST" });
}
