import { NextResponse } from "next/server";

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Nome gerado pelo backend no upload: hash hexadecimal + extensão de imagem.
// A regex estrita impede que o segmento alcance qualquer outro caminho do
// Flask (`..`, barras codificadas etc.) - mesmo espírito de isValidId.
const MEDIA_NAME = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

type RouteContext = { params: Promise<{ name: string }> };

// Rota PÚBLICA: é o endereço que as imagens dos artigos usam no navegador
// (o Flask fica só na rede interna do docker-compose). Repassa os bytes em
// stream, sem carregar o arquivo inteiro na memória do Next.
export async function GET(_request: Request, { params }: RouteContext) {
  const { name } = await params;
  if (!MEDIA_NAME.test(name)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/media/${name}`, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Só repassa o Content-Type se for mesmo de imagem; qualquer outra coisa
  // vira octet-stream (junto com o nosniff global do next.config.js, o
  // navegador não interpreta o conteúdo como HTML/script).
  const upstreamType = res.headers.get("content-type") || "";
  const headers = new Headers({
    "Content-Type": upstreamType.startsWith("image/") ? upstreamType : "application/octet-stream",
    // O nome do arquivo é um hash do conteúdo: nunca muda, pode cachear pra sempre.
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(res.body, { status: 200, headers });
}
