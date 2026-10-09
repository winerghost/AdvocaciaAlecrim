import type { Metadata } from "next";
import { BlogFooter, BlogHeader } from "@/components/blog/BlogChrome";
import { SITE_NAME, SITE_URL } from "@/components/blog/utils";

export const metadata: Metadata = {
  // Base para resolver canonical e imagens OpenGraph relativas (/api/media/...).
  metadataBase: new URL(SITE_URL),
  title: {
    default: `Artigos | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    // .theme-ba liga os tokens do design system (ver globals.css). A fonte
    // Figtree é carregada no layout raiz (app/layout.tsx).
    <div className="theme-ba flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-ba-pill focus:bg-ba-accent focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <BlogHeader />
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <BlogFooter />
    </div>
  );
}
