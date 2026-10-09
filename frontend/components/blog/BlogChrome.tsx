import Image from "next/image";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import { PRIVACY_PATH, WHATSAPP_URL } from "@/lib/constants";

// Cabeçalho e rodapé do blog, no tema .theme-ba. Mesma marca da landing
// (ícone + nome tipografado, ver Nav em components/sections.tsx), com link
// de volta para a home.

const NAV_LINKS = [
  { href: "/", label: "Início" },
  { href: "/blog", label: "Artigos" },
  { href: "/#especialidades", label: "Especialidades" },
  { href: "/#contato", label: "Contato" },
];

function Brand() {
  return (
    <Link href="/" className="flex flex-shrink-0 items-center gap-2.5 sm:gap-3" aria-label="Advocacia Alecrim - página inicial">
      {/* Arquivo local de /public - o mesmo ícone gold usado na landing. */}
      <Image
        src="/images/logo-icone.png"
        alt=""
        width={762}
        height={414}
        priority
        className="h-10 w-auto sm:h-12"
      />
      <span className="flex flex-col leading-none">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ba-text/70 sm:text-[11px]">
          Advocacia
        </span>
        <span className="text-lg font-bold uppercase tracking-wide text-gold sm:text-xl">Alecrim</span>
      </span>
    </Link>
  );
}

export function BlogHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-ba-steel/50 bg-ba-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-ba-container items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Brand />

        <nav aria-label="Principal" className="ml-auto hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-2 text-ba-nav uppercase text-ba-text/70 transition-colors duration-300 hover:text-ba-text"
            >
              {link.label}
            </Link>
          ))}
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ba-btn ba-btn-primary ba-btn-sm">
            Falar
          </a>
        </nav>

        <MobileNav links={NAV_LINKS} whatsappUrl={WHATSAPP_URL} />
      </div>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer className="border-t border-ba-steel/50">
      <div className="mx-auto flex max-w-ba-container flex-col gap-8 px-4 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">
        <Brand />
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-3.5 text-ba-nav uppercase text-ba-text/70 transition-colors duration-300 hover:text-ba-text"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-ba-steel/30">
        <p className="mx-auto max-w-ba-container px-4 py-6 text-xs text-ba-text/55 sm:px-8">
          © {new Date().getFullYear()} Dr. Alecrim Advocacia. Todos os direitos reservados. Os artigos têm caráter
          informativo e não substituem a consulta a um advogado.{" "}
          <Link href={PRIVACY_PATH} className="underline underline-offset-4 transition-colors duration-300 hover:text-ba-accent">
            Aviso de Privacidade
          </Link>
        </p>
      </div>
    </footer>
  );
}
