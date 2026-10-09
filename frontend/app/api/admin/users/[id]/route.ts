import { NextResponse } from "next/server";
import { isValidId, proxyAdmin, readJsonBody } from "@/lib/adminProxy";
import { forwardedForHeader } from "@/lib/clientIp";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // O corpo leva `current_password` - o Flask exige reautenticação pra
  // excluir um admin (ver backend/app/api/admin_users.py).
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Mesmo motivo do login: o rate limit do Flask precisa do IP real.
  return proxyAdmin(`/api/admin/users/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...forwardedForHeader(request),
    },
    body: JSON.stringify(parsed.body),
  });
}
