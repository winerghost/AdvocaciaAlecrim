import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME } from "@/lib/adminConstants";

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export { ADMIN_COOKIE_NAME };

export async function getAdminToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE_NAME)?.value ?? null;
}

/**
 * Proxy fino para as rotas /api/admin/** do Flask: lê o cookie httpOnly,
 * monta o header Authorization Bearer e repassa status/corpo exatamente
 * como vieram do backend (mesmo padrão de app/api/leads/route.ts). O
 * token do Flask nunca chega no JS do navegador - só existe aqui, no
 * servidor Next, e dentro do cookie httpOnly.
 *
 * Se não houver cookie, responde 401 direto sem nem chamar o Flask.
 */
export async function proxyAdmin(path: string, init?: RequestInit): Promise<NextResponse> {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  // 204 (DELETE bem-sucedido) não pode ter corpo - a spec HTTP proíbe, e
  // NextResponse.json(...) com status 204 lança um erro interno do Next
  // (Response with null body status cannot have body), virando 500.
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/**
 * Valida que o segmento `[id]` das rotas de proxy (faqs/leads/services/
 * testimonials) é só dígitos antes de compor a URL de destino no Flask.
 * Todo `id` real nesses modelos é um inteiro auto-increment do SQLAlchemy
 * - qualquer outra coisa (`..`, `%2F`, texto) é rejeitada aqui em vez de
 * virar parte da URL repassada, fechando a possibilidade de o segmento
 * alcançar um path diferente do endpoint pretendido.
 */
export function isValidId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * Checagem básica da FORMA do corpo (é um objeto JSON, não array/nulo) -
 * mesmo espírito de app/api/leads/route.ts: não reimplementa validação de
 * negócio (isso é responsabilidade do Flask), só evita repassar lixo óbvio.
 */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  return { ok: true, body };
}
