import Image from "next/image";
import type { Service, Testimonial } from "@/lib/api";
import { WHATSAPP_URL } from "@/lib/constants";
import LeadForm from "./LeadForm";
import MobileNav from "./MobileNav";
import Reveal from "./Reveal";
import { Check, ServiceIcon } from "./icons";

const NAV_LINKS = [
  { href: "#top", label: "Home" },
  { href: "#sobre", label: "Sobre" },
  { href: "#especialidades", label: "Especialidades" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#contato", label: "Contato" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <a href="#top" className="flex flex-shrink-0 items-center">
          <Image
            src="/images/logo-cabecalho.png"
            alt="Advocacia Alecrim"
            width={1536}
            height={293}
            priority
            className="h-9 w-auto sm:h-11"
          />
        </a>

        {/* Desktop: links inline. Some das telas dão >= 768px (md) */}
        <nav className="ml-auto hidden items-center gap-6 md:flex lg:gap-8">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-slate-bg transition hover:text-gold">
              {link.label}
            </a>
          ))}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-navy transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Falar
          </a>
        </nav>

        {/* Mobile: menu sanduíche */}
        <MobileNav links={NAV_LINKS} whatsappUrl={WHATSAPP_URL} />
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[560px] items-center overflow-hidden bg-navy"
      style={{
        backgroundImage:
          "radial-gradient(circle at 78% 30%, #1c2942 0%, #0f172a 55%, #080d18 100%)",
      }}
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      <div className="animate-aurora-1 pointer-events-none absolute -right-[8%] -top-[15%] aspect-square w-[60vw] max-w-[620px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.14)_0%,transparent_68%)]" />
      <div className="animate-aurora-2 pointer-events-none absolute -left-[10%] -bottom-[20%] aspect-square w-[50vw] max-w-[480px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.07)_0%,transparent_70%)]" />

      <div className="pointer-events-none absolute bottom-0 right-2 hidden h-full w-[42%] max-w-[560px] items-end justify-end opacity-90 sm:flex">
        <Image
          src="/images/dr-alecrim-hero.png"
          alt="Dr. Alecrim"
          width={560}
          height={860}
          priority
          className="h-full w-full object-contain object-right-bottom"
          style={{
            maskImage:
              "radial-gradient(ellipse 68% 72% at 62% 52%, #000 26%, rgba(0,0,0,0.6) 58%, transparent 86%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 68% 72% at 62% 52%, #000 26%, rgba(0,0,0,0.6) 58%, transparent 86%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <div className="max-w-xl">
          <div
            className="animate-fade-in-up mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.07] px-4 py-2"
            style={{ animationDelay: "0s" }}
          >
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-gold" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold sm:text-xs">
              Advocacia em Palmas · Tocantins
            </span>
          </div>

          <h1
            className="animate-fade-in-up mb-5 text-3xl font-semibold leading-[1.12] tracking-tight text-white sm:mb-6 sm:text-5xl sm:leading-[1.06] md:text-6xl"
            style={{ animationDelay: "0.1s" }}
          >
            Seu direito conduzido com <span className="text-gold">clareza</span>, agilidade e atenção à sua família.
          </h1>

          <p
            className="animate-fade-in-up mb-8 max-w-md text-sm font-light leading-relaxed text-white/70 sm:mb-9 sm:text-lg"
            style={{ animationDelay: "0.2s" }}
          >
            Inventários, aposentadorias, ações trabalhistas e cíveis. Atendimento pessoal do Dr. Alecrim, do primeiro contato à conclusão do processo.
          </p>

          <div
            className="animate-fade-in-up mb-10 flex flex-col gap-3 sm:mb-12 sm:flex-row sm:flex-wrap sm:gap-3.5"
            style={{ animationDelay: "0.3s" }}
          >
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 rounded-md bg-gold px-8 py-4 text-sm font-semibold text-navy transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              Agendar Consulta
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </a>
            <a
              href="#especialidades"
              className="inline-flex items-center justify-center rounded-md border border-white/20 px-8 py-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:border-gold/50 hover:bg-white/5"
            >
              Ver Especialidades
            </a>
          </div>

          <div
            className="animate-fade-in-up flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:flex-wrap sm:gap-6 sm:pt-7"
            style={{ animationDelay: "0.4s" }}
          >
            {[
              "Primeira consulta gratuita",
              "Atendimento em todo o Tocantins",
              "Resposta no mesmo dia",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <Check className="flex-none text-gold" size={17} />
                <span className="text-sm text-white/60">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const TRUST_STATS = [
  { value: "100%", label: "Foco em Direito das Sucessões" },
  { value: "1:1", label: "Atendimento Personalizado" },
  { value: "Ágil", label: "Condução Eficiente" },
  { value: "TO", label: "Todo o Tocantins" },
];

export function TrustStrip() {
  return (
    <div className="bg-navy px-4 py-14 sm:px-8">
      <Reveal className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
        {TRUST_STATS.map((stat) => (
          <div key={stat.label} className="text-center opacity-75">
            <div className="text-2xl font-bold text-gold sm:text-3xl">{stat.value}</div>
            <div className="mt-2 text-xs text-slate-bg sm:text-sm">{stat.label}</div>
          </div>
        ))}
      </Reveal>
    </div>
  );
}

export function About() {
  return (
    <section id="sobre" className="bg-white px-4 py-20 sm:px-8 sm:py-28">
      <Reveal className="mx-auto grid max-w-6xl gap-12 sm:grid-cols-2 sm:items-center">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark">Sobre</p>
          <h2 className="mb-6 text-3xl font-semibold text-navy sm:text-4xl">Dr. Alecrim</h2>
          <p className="mb-5 leading-relaxed text-slate-muted">
            Advogado atuante em Palmas e em todo o Tocantins, com foco em Direito das Sucessões, Previdenciário, Trabalhista e Cível. Cada caso é conduzido pessoalmente, sem intermediários.
          </p>
          <p className="mb-8 leading-relaxed text-slate-muted">
            A prática é orientada por um princípio simples: o cliente precisa entender o próprio processo. Linguagem clara, prazos reais e retorno rápido em cada etapa.
          </p>
          <div className="flex flex-wrap gap-3">
            {["Sucessões", "Previdenciário", "Trabalhista", "Cível"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-navy/10 px-4 py-2 text-xs font-medium text-navy"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-bg p-6">
            <div className="mb-2 text-2xl font-bold text-navy">1:1</div>
            <div className="text-sm text-slate-muted">Atendimento direto com o advogado</div>
          </div>
          <div className="rounded-xl bg-navy p-6">
            <div className="mb-2 text-2xl font-bold text-gold">TO</div>
            <div className="text-sm text-white/70">Atuação em todo o Tocantins</div>
          </div>
          <div className="rounded-xl bg-navy p-6">
            <div className="mb-2 text-2xl font-bold text-gold">24h</div>
            <div className="text-sm text-white/70">Retorno de primeiro contato</div>
          </div>
          <div className="rounded-xl bg-slate-bg p-6">
            <div className="mb-2 text-2xl font-bold text-navy">4</div>
            <div className="text-sm text-slate-muted">Áreas de atuação especializadas</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Services({ services }: { services: Service[] }) {
  return (
    <section id="especialidades" className="bg-white px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-12 text-center text-3xl font-semibold text-navy sm:text-4xl">Especialidades</h2>
        </Reveal>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <Reveal key={service.id} delay={index * 80}>
              <div className="h-full rounded-lg border border-navy/10 p-8 transition hover:-translate-y-1 hover:border-gold hover:shadow-[0_12px_32px_rgba(212,175,55,0.1)]">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-bg">
                  <ServiceIcon slug={service.slug} className="text-gold" size={28} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-navy">{service.title}</h3>
                <p className="text-sm leading-relaxed text-slate-muted">{service.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section id="depoimentos" className="bg-slate-bg px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-12 text-center text-3xl font-semibold text-navy sm:text-4xl">
            O que nossos clientes dizem
          </h2>
        </Reveal>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, index) => (
            <Reveal key={t.id} delay={index * 100}>
              <div className="h-full rounded-lg border-l-4 border-gold bg-white p-8">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold text-lg font-bold text-navy">
                    {t.author.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-navy">{t.author}</div>
                    <div className="text-xs text-slate-muted">{t.role}</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-muted">&ldquo;{t.content}&rdquo;</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <section id="contato" className="bg-navy px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-14 text-center text-3xl font-semibold text-white sm:text-4xl">Entre em Contato</h2>
        </Reveal>
        <Reveal className="grid gap-12 sm:grid-cols-2">
          <div className="space-y-6 text-center sm:text-left">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold">Telefone</h3>
              <a href="tel:+5563999941821" className="block text-slate-bg hover:text-gold">
                (63) 99994-1821
              </a>
              <a href="tel:+5563999362073" className="block text-slate-bg hover:text-gold">
                (63) 99362-0731
              </a>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold">E-mail</h3>
              <a href="mailto:alecrimrio@gmail.com" className="text-slate-bg hover:text-gold">
                alecrimrio@gmail.com
              </a>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold">Localização</h3>
              <p className="text-slate-bg">Palmas, Tocantins — atendimento em todo o estado</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold">Instagram</h3>
              <a
                href="https://www.instagram.com/advocaciaalecrim_/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-bg hover:text-gold"
              >
                @advocaciaalecrim_
              </a>
            </div>
          </div>

          <LeadForm />
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-black px-4 py-10 text-center text-xs text-white/60 sm:px-8">
      <p>© {new Date().getFullYear()} Dr. Alecrim Advocacia. Todos os direitos reservados.</p>
    </footer>
  );
}

export function WhatsappButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale conosco no WhatsApp"
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:-translate-y-0.5 hover:scale-105 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
      style={{ background: "linear-gradient(145deg, #2ee06a 0%, #1faa53 100%)" }}
    >
      <svg width="26" height="26" viewBox="0 0 32 32" fill="#ffffff" aria-hidden="true" className="sm:h-[30px] sm:w-[30px]">
        <path d="M16.04 3.2c-7.09 0-12.84 5.75-12.84 12.84 0 2.26.6 4.47 1.73 6.42L3.2 28.8l6.5-1.7a12.79 12.79 0 0 0 6.34 1.66h.01c7.08 0 12.83-5.75 12.83-12.84 0-3.43-1.33-6.65-3.76-9.08a12.74 12.74 0 0 0-9.08-3.76Zm0 23.5h-.01a10.65 10.65 0 0 1-5.42-1.48l-.39-.23-4.03 1.06 1.08-3.93-.25-.4a10.63 10.63 0 0 1-1.63-5.68c0-5.89 4.79-10.68 10.68-10.68 2.85 0 5.53 1.11 7.54 3.13a10.6 10.6 0 0 1 3.13 7.56c0 5.89-4.8 10.65-10.7 10.65Zm5.86-7.98c-.32-.16-1.96-.97-2.26-1.08-.31-.11-.53-.16-.75.16-.22.33-.86 1.08-1.06 1.3-.19.22-.39.25-.71.09-.32-.16-1.36-.5-2.59-1.6-.96-.86-1.6-1.92-1.79-2.24-.19-.32-.02-.5.14-.66.15-.14.33-.38.49-.57.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.57-.08-.16-.75-1.8-1.03-2.46-.27-.65-.54-.56-.75-.57-.19-.01-.41-.01-.63-.01-.22 0-.58.08-.88.41-.3.33-1.15 1.12-1.15 2.74s1.18 3.18 1.34 3.4c.16.22 2.31 3.53 5.6 4.95.78.34 1.4.54 1.87.69.79.25 1.5.22 2.07.13.63-.09 1.94-.79 2.21-1.56.28-.77.28-1.42.19-1.56-.08-.13-.3-.22-.62-.38Z" />
      </svg>
    </a>
  );
}
