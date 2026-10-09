import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/api";
import { ArticleCard, Cover } from "@/components/blog/ArticleCard";
import Reveal from "@/components/Reveal";
import ScrollProgress from "@/components/ScrollProgress";
import {
  SITE_NAME,
  absoluteUrl,
  articleDate,
  formatDate,
  imageSrc,
  isoDate,
  readingMinutes,
} from "@/components/blog/utils";
import { WHATSAPP_URL } from "@/lib/constants";

// Conteúdo vem do Flask a cada request (ver comentário em app/page.tsx).
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

// Quantos artigos aparecem em "Outros artigos".
const OTHERS_COUNT = 3;

// Caixa "Sobre o autor". Os textos repetem o que a landing já afirma na
// seção Sobre (components/sections.tsx) - ao mudar lá, mude aqui.
const AUTHOR = {
  name: "Dr. Alecrim",
  bio: "Advogado atuante em Palmas e em todo o Tocantins. Cada caso é conduzido pessoalmente, sem intermediários, com linguagem clara, prazos reais e retorno rápido em cada etapa.",
  highlights: [
    "Direito das Sucessões, Previdenciário, Trabalhista e Cível",
    "Atendimento direto com o advogado",
    "Atuação em todo o Tocantins",
  ],
};

// Selo arredondado dos metadados (autor, data, tempo de leitura).
const BADGE =
  "inline-flex items-center gap-2.5 rounded-[10px] bg-ba-steel/[0.22] px-5 py-[11px] text-base shadow-[inset_0_0_0_1px_rgb(var(--ba-steel)/0.85)] transition-[color,box-shadow] duration-300";

const SHARE_BTN =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-ba-steel shadow-[inset_0_0_0_1px_rgb(var(--ba-steel)/0.3)] transition-[color,background-color,box-shadow] duration-300 hover:bg-ba-accent hover:text-white hover:shadow-ba-ring-accent";

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function describe(article: { excerpt: string | null; content: string }): string {
  const text = article.excerpt?.trim() || plainText(article.content);
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // Se a API falhar aqui, deixa a própria página lançar o erro (error.tsx).
  const article = await getArticle(slug).catch(() => null);
  if (!article) return { title: "Artigo não encontrado", robots: { index: false } };

  const description = describe(article);
  const cover = imageSrc(article.cover_image);
  const url = `/blog/${article.slug}`;

  return {
    title: article.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "pt_BR",
      siteName: SITE_NAME,
      title: article.title,
      description,
      url,
      publishedTime: isoDate(articleDate(article)),
      modifiedTime: isoDate(article.updated_at),
      // Caminho relativo: o metadataBase de app/blog/layout.tsx o torna absoluto.
      images: cover ? [{ url: cover }] : undefined,
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: article.title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  // Pede um a mais porque o artigo atual pode estar entre os mais recentes.
  const { data: recent } = await getArticles(1, OTHERS_COUNT + 1);
  const others = recent.filter((item) => item.slug !== article.slug).slice(0, OTHERS_COUNT);

  const date = articleDate(article);
  const dateLabel = formatDate(date);
  const minutes = readingMinutes(article.content);
  const cover = imageSrc(article.cover_image);
  const url = absoluteUrl(`/blog/${article.slug}`);
  const linkedinShare = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`${article.title} ${url}`)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: describe(article),
    image: cover ? [absoluteUrl(cover)] : undefined,
    datePublished: isoDate(date),
    dateModified: isoDate(article.updated_at ?? date),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absoluteUrl("/images/logo-cabecalho.png") },
    },
  };

  return (
    <>
      {/* Dados estruturados. O replace de "<" impede que um título com
          "</script>" feche a tag (recomendação da doc do Next para JSON-LD).
          Não leva nonce: type="application/ld+json" é um bloco de dados, o
          navegador não o executa e a script-src da CSP não se aplica a ele. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <ScrollProgress />

      <article>
        <header className="relative overflow-hidden px-6 pb-14 pt-[84px] lg:px-8 lg:pb-[72px] lg:pt-24">
          <div className="ba-backdrop" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-[860px] flex-col gap-[26px] break-words">
            <nav
              aria-label="Trilha de navegação"
              className="flex flex-wrap items-center gap-2.5 text-xs font-semibold uppercase tracking-ba-nav text-ba-text/[0.42]"
            >
              <Link href="/" className="-my-3 py-3 text-ba-text/55 transition-colors duration-300 hover:text-ba-accent">
                Início
              </Link>
              <span aria-hidden="true">/</span>
              <Link href="/blog" className="-my-3 py-3 text-ba-text/55 transition-colors duration-300 hover:text-ba-accent">
                Artigos
              </Link>
            </nav>

            <h1 className="text-ba-title uppercase text-ba-text [text-wrap:balance]">{article.title}</h1>

            {article.excerpt && (
              <p className="text-xl leading-[1.6] text-ba-text/[0.72] [text-wrap:balance]">{article.excerpt}</p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 border-t border-ba-steel/55 pt-[26px]">
              <Link href="/#sobre" rel="author" className={`${BADGE} text-ba-text hover:text-white hover:shadow-ba-ring-accent`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                </svg>
                {AUTHOR.name}
              </Link>
              {dateLabel && (
                <span className={`${BADGE} text-ba-text/70`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                    <rect x="3.5" y="5" width="17" height="15" rx="2" />
                    <path d="M3.5 10h17M8 3v4M16 3v4" />
                  </svg>
                  <time dateTime={isoDate(date)}>{dateLabel}</time>
                </span>
              )}
              <span className={`${BADGE} text-ba-text/70`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
                {minutes} min de leitura
              </span>
            </div>
          </div>
        </header>

        {cover && (
          <div className="mx-auto max-w-ba-article px-6 pb-16 lg:px-8">
            <Cover src={cover} eager className="aspect-[16/9] shadow-ba-ring-strong" />
          </div>
        )}

        {/* Área de leitura: faixa clara dentro do tema escuro. */}
        <div className="ba-paper py-[60px] sm:pb-24 sm:pt-[88px]">
          <div className="mx-auto max-w-ba-article px-6 lg:px-8">
            {/* O HTML do artigo chega sanitizado: o backend Flask filtra o
                conteúdo por allowlist de tags/atributos ao salvar E de novo ao
                ler (GET /api/articles/<slug>). A CSP de proxy.ts é a camada
                seguinte: mesmo que um <script> ou on*="" chegasse até aqui, o
                navegador não o executaria (script-src só aceita o nonce da
                resposta). Nenhuma das camadas dispensa a outra. */}
            <div className="article-content" dangerouslySetInnerHTML={{ __html: article.content }} />

            <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-ba-steel/20 pt-7">
              <span className="text-[11px] font-bold uppercase tracking-ba-eyebrow-wide text-ba-steel/70">
                Compartilhar
              </span>
              <div className="flex items-center gap-2.5">
                <a href={linkedinShare} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no LinkedIn" className={SHARE_BTN}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.8v1.54h.06c.53-.95 1.83-1.94 3.76-1.94 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.2c0-1.24-.02-2.84-1.8-2.84-1.8 0-2.08 1.34-2.08 2.74V21h-4V9.75Z" />
                  </svg>
                </a>
                <a href={whatsappShare} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp" className={SHARE_BTN}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12.04 2a9.9 9.9 0 0 0-8.48 15.02L2 22l5.12-1.52A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.3 14.97l-.3-.19-3.04.9.93-2.95-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3.3 3.9c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.26 0 1.33.97 2.62 1.11 2.8.14.18 1.9 3.03 4.69 4.13 2.32.91 2.79.73 3.29.68.5-.05 1.63-.66 1.86-1.3.23-.64.23-1.19.16-1.3-.07-.11-.25-.18-.52-.32-.27-.14-1.63-.8-1.88-.9-.25-.09-.43-.14-.61.14-.18.27-.7.9-.86 1.08-.16.18-.32.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.36-1.61-1.52-1.88-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.6-1.5-.84-2.05-.2-.48-.42-.49-.61-.5l-.6-.03Z" />
                  </svg>
                </a>
              </div>
            </div>

            <aside aria-label="Sobre o autor" className="mt-8 flex flex-col items-start gap-[26px] bg-ba-mist p-[34px] lg:flex-row">
              <Image
                src="/images/dr-alecrim-hero.png"
                alt={AUTHOR.name}
                width={747}
                height={1653}
                sizes="96px"
                className="h-24 w-24 flex-none rounded-full bg-ba-steel/20 object-cover object-top shadow-[inset_0_0_0_1px_rgb(var(--ba-steel)/0.25)]"
              />
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-bold uppercase tracking-ba-eyebrow-wide text-ba-steel/70">
                  Sobre o autor
                </span>
                <Link
                  href="/#sobre"
                  rel="author"
                  className="self-start text-xl font-extrabold tracking-[-0.02em] text-ba-bg transition-colors duration-300 hover:text-ba-accent-ink"
                >
                  {AUTHOR.name}
                </Link>
                <p className="text-base leading-[1.72] text-ba-slate [text-wrap:pretty]">{AUTHOR.bio}</p>
                <ul className="mt-1 flex flex-col gap-[9px]">
                  {AUTHOR.highlights.map((item) => (
                    <li
                      key={item}
                      className="relative pl-[22px] text-[15px] leading-[1.6] text-ba-slate before:absolute before:left-0 before:top-[11px] before:h-[3px] before:w-[11px] before:bg-ba-accent before:content-['']"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/#sobre"
                  className="-mb-2.5 -mt-1.5 self-start py-2.5 text-sm font-semibold text-ba-accent-ink transition-colors duration-300 hover:text-ba-bg"
                >
                  Conhecer o escritório
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </article>

      {/* CTA final: leva ao formulário de contato da landing ou ao WhatsApp. */}
      <section className="relative overflow-hidden px-6 pb-[104px] pt-[100px] lg:px-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_50%_100%,rgb(var(--ba-accent)/0.18)_0%,rgb(var(--ba-bg)/0)_65%)]"
          aria-hidden="true"
        />
        <Reveal>
          <div className="relative mx-auto flex max-w-[820px] flex-col items-center gap-6 text-center">
            <p className="ba-eyebrow">Próximo passo</p>
            <h2 className="text-ba-cta uppercase text-ba-text [text-wrap:balance]">
              Precisa de <span className="text-ba-accent">orientação</span> para o seu caso?
            </h2>
            <p className="max-w-[620px] text-lg leading-[1.65] text-ba-text/70 [text-wrap:balance]">
              Cada situação tem detalhes que um artigo não alcança. Fale com o escritório e receba uma análise
              do seu caso.
            </p>
            <div className="flex flex-col items-stretch justify-center gap-3.5 pt-2 sm:flex-row sm:items-center">
              <Link href="/#contato" className="ba-btn ba-btn-primary">
                Agendar consulta
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ba-btn ba-btn-secondary">
                Falar no WhatsApp
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {others.length > 0 && (
        <section className="border-t border-ba-steel/40 px-6 pb-[108px] pt-24 lg:px-8">
          <div className="mx-auto flex max-w-ba-container flex-col gap-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="ba-eyebrow">Outros artigos</h2>
              <Link
                href="/blog"
                className="py-2 text-ba-nav uppercase text-ba-text/70 transition-colors duration-300 hover:text-ba-accent"
              >
                Ver todos
              </Link>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((item, index) => (
                <li key={item.id}>
                  <Reveal className="h-full" delay={index * 80}>
                    <ArticleCard article={item} />
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
