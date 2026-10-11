import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/api";
import { SITE_URL, isoDate } from "@/components/blog/utils";

// Artigos vêm do Flask a cada requisição (o backend não existe no build).
export const dynamic = "force-dynamic";

// Limite de segurança do loop de páginas (50 x 50 = 2500 artigos).
const PER_PAGE = 50;
const MAX_PAGES = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/` },
    { url: `${SITE_URL}/blog` },
    { url: `${SITE_URL}/privacidade` },
  ];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, meta, ok } = await getArticles(page, PER_PAGE);
    if (!ok) break;
    for (const article of data) {
      const lastModified = isoDate(article.updated_at ?? article.published_at ?? article.created_at);
      entries.push({
        url: `${SITE_URL}/blog/${encodeURIComponent(article.slug)}`,
        ...(lastModified ? { lastModified } : {}),
      });
    }
    if (page >= meta.pages) break;
  }

  return entries;
}
