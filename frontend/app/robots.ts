import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/blog/utils";

// robots.txt. O painel e a API não têm nada a indexar (o painel ainda leva
// noindex nos metadados; aqui só evita rastreamento inútil).
// Dinâmico para ler o SITE_URL do container em runtime: estático, o
// endereço do sitemap sairia congelado com o valor do build.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
