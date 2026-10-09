import { NextResponse } from "next/server";
import { proxyAdmin } from "@/lib/adminProxy";

// Mesmo teto do Flask (5 MB). Checado aqui só pra rejeitar cedo, sem
// gastar uma ida ao backend - quem decide de verdade (tamanho, tipo real
// do arquivo) continua sendo o Flask.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // Monta um FormData novo só com o campo esperado. Não setamos
  // Content-Type: o fetch gera o multipart/form-data com o boundary certo
  // a partir do FormData, e proxyAdmin só acrescenta o Authorization.
  const outgoing = new FormData();
  outgoing.append("file", file, file.name);

  return proxyAdmin("/api/admin/uploads", { method: "POST", body: outgoing });
}
