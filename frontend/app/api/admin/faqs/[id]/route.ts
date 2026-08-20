import { NextResponse } from "next/server";
import { proxyAdmin, readJsonBody } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/faqs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return proxyAdmin(`/api/admin/faqs/${id}`, { method: "DELETE" });
}
