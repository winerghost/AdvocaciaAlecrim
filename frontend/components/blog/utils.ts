// Utilitários puros do blog (sem JSX) - usados só em Server Components.

// URL pública do site, para canonical/OpenGraph/JSON-LD. Lida em runtime
// (as páginas do blog são force-dynamic), então basta definir SITE_URL no
// ambiente do container se o domínio mudar.
export const SITE_URL = (process.env.SITE_URL || "https://www.advocaciaalecrim.com.br").replace(/\/+$/, "");

export const SITE_NAME = "Advocacia Alecrim";

// O backend manda ISO 8601 em UTC. Se vier sem designador de fuso
// ("2026-01-05T12:00:00"), o JS interpretaria como horário local do
// servidor - então assume UTC explicitamente.
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const date = new Date(hasZone || !iso.includes("T") ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Palmas/TO: sem isso, um artigo publicado à noite apareceria com a data
// do dia seguinte (o container roda em UTC).
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Araguaina",
});

// "5 de janeiro de 2026" - string vazia se a data for nula/inválida.
export function formatDate(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? dateFormatter.format(date) : "";
}

// Valor para o atributo dateTime de <time> e para o JSON-LD.
export function isoDate(iso: string | null | undefined): string | undefined {
  return parseDate(iso)?.toISOString();
}

// Data a exibir: a de publicação, caindo para a de criação.
export function articleDate(article: { published_at: string | null; created_at: string | null }) {
  return article.published_at ?? article.created_at;
}

// Tempo estimado de leitura em minutos (~200 palavras/min, mínimo 1).
export function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Só aceita caminho relativo do próprio site (/api/media/...) ou http(s);
// qualquer outra coisa (data:, javascript:, lixo) vira "sem capa".
export function imageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^\/(?!\/)/.test(src) || /^https?:\/\//i.test(src)) return src;
  return null;
}

export function absoluteUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
