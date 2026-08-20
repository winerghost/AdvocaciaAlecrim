import { proxyAdmin } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return proxyAdmin(`/api/admin/leads/${id}`, { method: "DELETE" });
}
