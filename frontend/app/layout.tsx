import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Fonte do design system (.theme-ba). O next/font baixa a fonte no BUILD e
// a hospeda junto do app (o navegador não fala com o Google). A classe
// `figtree.variable` apenas define --font-figtree no <html>; quem a aplica
// é o escopo .theme-ba (landing e blog) - o painel admin segue com a fonte
// de sistema definida em globals.css.
// ATENÇÃO: em `next build` (produção), se fonts.googleapis.com/gstatic.com
// estiverem inacessíveis, o build FALHA ("Failed to fetch `Figtree` from
// Google Fonts") - o fallback abaixo só vale no navegador e no `next dev`.
// Se o ambiente de build não tiver essa saída de rede, troque por
// next/font/local com os .woff2 versionados no repositório.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
  fallback: ["Helvetica", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Dr. Alecrim | Advocacia em Palmas e todo o Tocantins",
  description:
    "Advogado atuante em Palmas e em todo o Tocantins, com foco em Direito das Sucessões, Previdenciário, Trabalhista e Cível.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Obriga TODA página a ser renderizada a cada requisição, nunca no build.
  // A CSP (proxy.ts) só deixa rodar script com o nonce daquela resposta, e o
  // Next só consegue colocar o nonce nos scripts dele quando renderiza com a
  // requisição em mãos. Uma página pré-renderizada no build (era o caso de
  // /login e da página 404) sairia com scripts sem nonce: o navegador
  // bloquearia todos e a página ficaria sem JavaScript - no /login, sem
  // conseguir entrar. Feito aqui, no layout raiz, para valer também para
  // páginas criadas no futuro.
  await connection();

  return (
    <html lang="pt-BR" className={figtree.variable}>
      <body className="bg-white text-ba-bg antialiased">{children}</body>
    </html>
  );
}
