import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticles } from "@/lib/api";
import { ArticleCard, FeaturedArticle } from "@/components/blog/ArticleCard";
import Reveal from "@/components/Reveal";

// Mesmo motivo de app/page.tsx: o backend não existe durante o
// `docker build`, então uma página estática/ISR congelaria a lista vazia.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const DESCRIPTION =
  "Artigos e orientações em linguagem clara sobre inventário e sucessões, aposentadoria, direito trabalhista e cível, pelo escritório Advocacia Alecrim.";

// ?page=2 -> 2. Qualquer valor ausente ou inválido cai na primeira página.
function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function pageHref(page: number): string {
  return page <= 1 ? "/blog" : `/blog?page=${page}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  const title = page > 1 ? `Artigos - página ${page}` : "Artigos e orientações jurídicas";

  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: pageHref(page) },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Advocacia Alecrim",
      title,
      description: DESCRIPTION,
      url: pageHref(page),
    },
  };
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={back ? "rotate-180" : undefined}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function Pagination({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;

  return (
    <nav aria-label="Paginação" className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-ba-steel/50 pt-8 sm:mt-20">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} rel="prev" className="ba-btn ba-btn-secondary ba-btn-sm">
          <Arrow back />
          Mais recentes
        </Link>
      ) : (
        <span />
      )}
      <p className="order-last w-full text-center text-ba-nav uppercase text-ba-text/55 sm:order-none sm:w-auto">
        Página {page} de {pages}
      </p>
      {page < pages ? (
        <Link href={pageHref(page + 1)} rel="next" className="ba-btn ba-btn-secondary ba-btn-sm">
          Mais antigos
          <Arrow />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl bg-ba-steel/[0.14] px-6 py-16 text-center shadow-ba-ring sm:px-12">
      <h2 className="text-ba-h3 uppercase text-ba-text">{title}</h2>
      <p className="mt-4 text-ba-body text-ba-text/70">{children}</p>
      <Link href="/" className="ba-btn ba-btn-secondary ba-btn-sm mt-8">
        Voltar para o início
      </Link>
    </div>
  );
}

export default async function BlogPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const { data: articles, meta, ok } = await getArticles(page);

  // Página além da última (ex.: ?page=99 com 2 páginas) não existe.
  if (ok && articles.length === 0 && page > 1) notFound();

  // Destaque só na primeira página; nas demais, todos entram na grade.
  const featured = page === 1 ? articles[0] : undefined;
  const rest = featured ? articles.slice(1) : articles;

  return (
    <>
      <section className="relative overflow-hidden border-b border-ba-steel/30">
        <div className="ba-backdrop" aria-hidden="true" />
        <div className="relative mx-auto max-w-ba-container px-4 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:pb-24 lg:pt-32">
          <p className="ba-eyebrow">Blog · Advocacia Alecrim</p>
          <h1 className="mt-6 text-ba-h1 uppercase text-ba-text">
            Artigos <span className="text-ba-accent">jurídicos</span>
          </h1>
          <p className="mt-6 max-w-2xl text-ba-lead text-ba-text/70">
            Orientações em linguagem clara sobre inventário e sucessões, aposentadoria, direito trabalhista e
            cível - para você entender os seus direitos antes de decidir.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-ba-container px-4 py-14 sm:px-8 sm:py-20 lg:py-28">
        {!ok ? (
          <EmptyState title="Artigos indisponíveis no momento">
            Não foi possível carregar os artigos agora. Tente novamente em alguns instantes.
          </EmptyState>
        ) : articles.length === 0 ? (
          <EmptyState title="Nenhum artigo publicado ainda">
            Em breve publicaremos orientações e novidades por aqui.
          </EmptyState>
        ) : (
          <>
            {featured && (
              <Reveal>
                <FeaturedArticle article={featured} />
              </Reveal>
            )}

            {rest.length > 0 && (
              <>
                <h2 className={featured ? "ba-eyebrow mb-8 mt-16 sm:mt-24" : "sr-only"}>
                  {featured ? "Mais artigos" : `Artigos - página ${page}`}
                </h2>
                <ul className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                  {rest.map((article, index) => (
                    <li key={article.id}>
                      <Reveal className="h-full" delay={(index % 3) * 80}>
                        <ArticleCard article={article} />
                      </Reveal>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Pagination page={page} pages={meta.pages} />
          </>
        )}
      </section>
    </>
  );
}
