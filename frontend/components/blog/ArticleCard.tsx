import Link from "next/link";
import type { ArticleSummary } from "@/lib/api";
import { articleDate, formatDate, imageSrc, isoDate } from "./utils";

// Capa do artigo. Usa <img> comum (não next/image): as capas vêm de
// /api/media/<arquivo>, servido por um route handler do próprio Next, e o
// tamanho é controlado por CSS (aspect-ratio no wrapper + object-cover),
// então não há salto de layout nem origem remota para configurar.
export function Cover({
  src,
  className = "",
  eager = false,
}: {
  src: string | null;
  className?: string;
  eager?: boolean;
}) {
  const safeSrc = imageSrc(src);

  return (
    <div className={`relative overflow-hidden bg-ba-steel/[0.14] ${className}`}>
      {safeSrc ? (
        // alt vazio: a capa é decorativa, o título do artigo vem logo ao lado.
        <img
          src={safeSrc}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        // Sem capa: grid de linhas + brilho de acento + um "§" discreto.
        <div aria-hidden="true" className="ba-grid absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_0%,rgb(var(--ba-accent)/0.2),transparent_70%)]" />
          <span className="relative text-6xl font-extrabold leading-none text-ba-steel sm:text-7xl">§</span>
        </div>
      )}
    </div>
  );
}

function CardDate({ article }: { article: ArticleSummary }) {
  const date = articleDate(article);
  const label = formatDate(date);
  if (!label) return null;
  return (
    <time dateTime={isoDate(date)} className="ba-eyebrow ba-eyebrow-sm">
      {label}
    </time>
  );
}

function ReadMore() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-2 text-ba-button uppercase text-ba-accent">
      Ler artigo
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1">
        <path d="M5 12h13M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

// O card inteiro é clicável: o link fica no título e um ::after estica a
// área de clique até as bordas do card (um link só por card para leitores
// de tela e teclado, em vez de envolver tudo num <a>).
const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ba-accent";

const CARD =
  "group relative bg-ba-steel/[0.14] shadow-ba-ring transition-[background-color,box-shadow] duration-300 ease-in-out hover:bg-ba-steel/[0.22] hover:shadow-ba-ring-accent";

export function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <article className={`${CARD} flex h-full flex-col`}>
      <Cover src={article.cover_image} className="aspect-[16/10]" />
      <div className="flex flex-1 flex-col gap-4 p-6 [overflow-wrap:anywhere] sm:p-7">
        <CardDate article={article} />
        <h3 className="text-ba-item text-ba-text [text-wrap:balance]">
          <Link href={`/blog/${article.slug}`} className={STRETCHED_LINK}>
            {article.title}
          </Link>
        </h3>
        {article.excerpt && (
          <p className="line-clamp-3 text-ba-body-sm text-ba-text/70">{article.excerpt}</p>
        )}
        <div className="mt-auto pt-2">
          <ReadMore />
        </div>
      </div>
    </article>
  );
}

// Destaque do artigo mais recente (topo da primeira página): capa grande
// ao lado do texto no desktop, empilhado no mobile.
export function FeaturedArticle({ article }: { article: ArticleSummary }) {
  return (
    // A sombra projetada fica num wrapper: o <article> já usa box-shadow
    // para desenhar a borda interna de 1px.
    <div className="shadow-ba-card">
    <article className={`${CARD} grid lg:grid-cols-[1.15fr_1fr]`}>
      <Cover src={article.cover_image} eager className="aspect-[16/10] lg:aspect-auto lg:min-h-[420px]" />
      <div className="flex flex-col justify-center gap-5 p-6 [overflow-wrap:anywhere] sm:p-10 lg:p-14">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="rounded-ba-pill bg-ba-accent/20 px-3.5 py-2 text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-ba-text shadow-ba-ring-accent">
            Mais recente
          </span>
          <CardDate article={article} />
        </div>
        <h2 className="text-[clamp(1.625rem,1.2rem+1.8vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.025em] text-ba-text [text-wrap:balance]">
          <Link href={`/blog/${article.slug}`} className={STRETCHED_LINK}>
            {article.title}
          </Link>
        </h2>
        {article.excerpt && (
          <p className="line-clamp-4 text-ba-body text-ba-text/70">{article.excerpt}</p>
        )}
        <div className="pt-2">
          <ReadMore />
        </div>
      </div>
    </article>
    </div>
  );
}
