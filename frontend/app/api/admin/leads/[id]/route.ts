import { NextResponse } from "next/server";
import { isValidId, proxyAdmin, readJsonBody } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ id: string }> };

// Único campo editável de um lead é o status (ver LeadStatusSchema no
// backend) - não existe PUT de name/phone/email/message, o lead é o que o
// visitante enviou.
export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/leads/${id}`, { method: "DELETE" });
}
