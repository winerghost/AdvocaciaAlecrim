import { NextResponse } from "next/server";
import { isValidId, proxyAdmin, readJsonBody } from "@/lib/adminProxy";

type RouteContext = { params: Promise<{ id: string }> };

// GET devolve o artigo completo (com `content`) - a listagem em
// /api/admin/articles vem sem o HTML pra não pesar a tabela.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/articles/${id}`);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  return proxyAdmin(`/api/admin/articles/${id}`, {
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

  return proxyAdmin(`/api/admin/articles/${id}`, { method: "DELETE" });
}
