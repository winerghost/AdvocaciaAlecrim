// URL usada em chamadas feitas pelo servidor Next (SSR / route handlers):
// dentro do docker-compose aponta para o serviço "backend" na rede interna.
const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Service = {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
};

export type Testimonial = {
  id: number;
  author: string;
  role: string;
  content: string;
  rating: number;
};

export type Faq = {
  id: number;
  question: string;
  answer: string;
};

// Artigo do blog como vem da listagem (sem o corpo). Datas em ISO 8601 UTC.
export type ArticleSummary = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  // null ou caminho relativo `/api/media/<arquivo>` servido pelo próprio Next.
  cover_image: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Artigo completo: `content` é HTML já sanitizado pelo backend (allowlist).
export type Article = ArticleSummary & { content: string };

export type PageMeta = {
  page: number;
  per_page: number;
  total: number;
  pages: number;
};

export type ArticleList = {
  data: ArticleSummary[];
  meta: PageMeta;
  // false quando a API não respondeu - a página distingue "blog vazio" de
  // "backend fora do ar" em vez de afirmar que não há artigos.
  ok: boolean;
};

export const ARTICLES_PER_PAGE = 9;

// Resposta crua da API: status HTTP + envelope `{data, meta}`. `null` quando
// nem houve resposta utilizável (rede caiu, JSON inválido).
type ApiResult<T> = { status: number; ok: boolean; data?: T; meta?: unknown };

async function fetchEnvelope<T>(path: string): Promise<ApiResult<T> | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return { status: res.status, ok: false };
    const json = await res.json();
    return { status: res.status, ok: true, data: json?.data as T, meta: json?.meta };
  } catch {
    return null;
  }
}

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  // Backend fora do ar não deve derrubar a página - cai para o fallback.
  const result = await fetchEnvelope<T>(path);
  return result?.data ?? fallback;
}

export function getServices(): Promise<Service[]> {
  return safeFetch<Service[]>("/api/services", []);
}

export function getTestimonials(): Promise<Testimonial[]> {
  return safeFetch<Testimonial[]>("/api/testimonials", []);
}

export function getFaqs(): Promise<Faq[]> {
  return safeFetch<Faq[]>("/api/faqs", []);
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Listagem paginada de artigos publicados (mais recentes primeiro). Ao
// contrário de safeFetch, preserva o `meta` de paginação da resposta.
export async function getArticles(
  page = 1,
  perPage: number = ARTICLES_PER_PAGE
): Promise<ArticleList> {
  const result = await fetchEnvelope<ArticleSummary[]>(
    `/api/articles?page=${page}&per_page=${perPage}`
  );
  const data = Array.isArray(result?.data) ? result.data : [];
  const raw = (result?.meta ?? {}) as Partial<Record<keyof PageMeta, unknown>>;
  const total = Math.max(toPositiveInt(raw.total, 0), data.length);
  const per = toPositiveInt(raw.per_page, perPage);

  return {
    data,
    meta: {
      page: toPositiveInt(raw.page, page),
      per_page: per,
      total,
      // Se o backend não mandar `pages`, deriva de total/per_page.
      pages: toPositiveInt(raw.pages, Math.ceil(total / per)),
    },
    ok: Boolean(result?.ok && Array.isArray(result.data)),
  };
}

// Um artigo pelo slug. Retorna `null` só quando a API diz que ele não existe
// (404) - aí a página responde notFound(). Qualquer outra falha (backend fora
// do ar, 5xx) lança erro: responder 404 nesse caso faria buscadores
// desindexarem um artigo que existe. Quem captura é app/blog/error.tsx.
export async function getArticle(slug: string): Promise<Article | null> {
  const result = await fetchEnvelope<Article>(`/api/articles/${encodeURIComponent(slug)}`);
  if (result?.status === 404) return null;
  if (!result?.ok || !result.data) {
    throw new Error(`Falha ao carregar o artigo "${slug}" (status ${result?.status ?? "sem resposta"})`);
  }
  return result.data;
}
