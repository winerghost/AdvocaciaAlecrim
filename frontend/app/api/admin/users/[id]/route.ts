import { NextResponse } from "next/server";
import { isValidId, proxyAdmin } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/users/${id}`, { method: "DELETE" });
}
