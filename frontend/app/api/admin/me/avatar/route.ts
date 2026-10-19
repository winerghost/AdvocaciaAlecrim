import { proxyAdmin } from "@/lib/adminProxy";

// Foto de perfil da conta logada. Este handler só repassa: formato, tamanho,
// dimensões e recodificação são decididos pelo Flask, que responde o erro
// (invalid_image, file_too_large...) que a tela mostra.
export async function POST(request: Request) {
  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");

  // Repassa só o campo "file" (nada mais do formulário chega ao Flask). Sem
  // Content-Type manual: o fetch gera o boundary do multipart.
  const outgoing = new FormData();
  if (file instanceof File) outgoing.append("file", file, file.name);

  return proxyAdmin("/api/admin/me/avatar", { method: "POST", body: outgoing });
}

export async function DELETE() {
  return proxyAdmin("/api/admin/me/avatar", { method: "DELETE" });
}
