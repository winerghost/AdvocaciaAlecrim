import Image from "next/image";
import type { Service, Testimonial } from "@/lib/api";
import { CONTACT_EMAIL, PHONE_DISPLAY, PHONE_E164, PRIVACY_PATH, WHATSAPP_URL } from "@/lib/constants";
import LeadForm from "./LeadForm";
import MobileNav from "./MobileNav";
import Reveal from "./Reveal";
import { Check, ServiceIcon } from "./icons";

// Seções da landing, no tema .theme-ba (ligado em app/page.tsx): faixas
// escuras (ba-bg) alternadas com faixas claras de leitura (.ba-paper e
// ba-mist), como na página de artigo do blog.

const NAV_LINKS = [
  { href: "#top", label: "Home" },
  { href: "#sobre", label: "Sobre" },
  { href: "#especialidades", label: "Especialidades" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#contato", label: "Contato" },
  { href: "/blog", label: "Blog" },
];

// Título de seção. `text-ba-bg` nas faixas claras, `text-ba-text` nas escuras.
const SECTION_TITLE = "text-ba-cta uppercase [text-wrap:balance]";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ba-steel/50 bg-ba-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-ba-container items-center justify-between gap-4 px-4 py-2.5 sm:px-8">
        {/* Ícone recortado de assets/logoAlecrim.png (fundo transparente,
            em gold - é a cor da marca, a única fora da paleta do tema) + nome
            tipografado em HTML - fica nítido em qualquer tamanho de tela, ao
            contrário de manter "Advocacia Alecrim" preso dentro de um PNG. */}
        <a href="#top" className="flex flex-shrink-0 items-center gap-2.5 sm:gap-3" aria-label="Advocacia Alecrim - início">
          <Image
            src="/images/logo-icone.png"
            alt=""
            width={762}
            height={414}
            priority
            className="h-12 w-auto sm:h-14 lg:h-16"
          />
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ba-text/70 sm:text-xs lg:text-[13px]">
              Advocacia
            </span>
            <span className="text-xl font-bold uppercase tracking-wide text-gold sm:text-2xl lg:text-[28px]">
              Alecrim
            </span>
          </span>
        </a>

        {/* Desktop: links inline só a partir de lg (>= 1024px). Entre 768 e
            1023px logo + 6 links + CTA não cabem (a página ganhava rolagem
            horizontal), então essa faixa usa o menu sanduíche. Gap menor em
            lg, porque em 1024px a folga é curta; abre em xl (>= 1280px). */}
        <nav className="ml-auto hidden items-center gap-5 lg:flex xl:gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="py-2 text-ba-nav uppercase text-ba-text/70 transition-colors duration-300 hover:text-ba-text"
            >
              {link.label}
            </a>
          ))}
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ba-btn ba-btn-primary ba-btn-sm">
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
    <section id="top" className="relative flex min-h-[560px] items-center overflow-hidden">
      <div className="ba-backdrop" aria-hidden="true" />
      <div className="animate-aurora-1 pointer-events-none absolute -right-[8%] -top-[15%] aspect-square w-[60vw] max-w-[620px] rounded-full bg-[radial-gradient(circle,rgb(var(--ba-accent)/0.16)_0%,transparent_68%)]" />
      <div className="animate-aurora-2 pointer-events-none absolute -bottom-[20%] -left-[10%] aspect-square w-[50vw] max-w-[480px] rounded-full bg-[radial-gradient(circle,rgb(var(--ba-accent)/0.08)_0%,transparent_70%)]" />

      {/* Retrato só a partir de md: entre 640 e 767px ele ficava por baixo do
          texto e dos botões. */}
      <div className="pointer-events-none absolute bottom-0 right-2 hidden h-full w-[42%] max-w-[560px] items-end justify-end opacity-90 md:flex">
        <Image
          src="/images/dr-alecrim-hero.png"
          alt="Dr. Alecrim"
          width={747}
          height={1653}
          priority
          className="h-full w-full object-contain object-bottom"
          style={{
            maskImage:
              "linear-gradient(to top, transparent 0%, #000 6%, #000 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, transparent 0%, #000 6%, #000 92%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-ba-container px-4 py-16 sm:px-8 sm:py-24">
        {/* md-lg: coluna de texto mais estreita para não invadir o retrato. */}
        <div className="max-w-2xl md:max-w-[56%] xl:max-w-2xl">
          <p className="ba-eyebrow animate-fade-in-up mb-6" style={{ animationDelay: "0s" }}>
            Advocacia em Palmas · Tocantins
          </p>

          <h1
            className="animate-fade-in-up mb-5 text-ba-cta uppercase text-ba-text [text-wrap:balance] sm:mb-6"
            style={{ animationDelay: "0.1s" }}
          >
            Seu direito conduzido com <span className="text-ba-accent">clareza</span>, agilidade e atenção à sua família.
          </h1>

          <p
            className="animate-fade-in-up mb-8 max-w-md text-ba-lead text-ba-text/70 sm:mb-9"
            style={{ animationDelay: "0.2s" }}
          >
            Inventários, aposentadorias, ações trabalhistas e cíveis. Atendimento pessoal do Dr. Alecrim, do primeiro contato à conclusão do processo.
          </p>

          <div
            className="animate-fade-in-up mb-10 flex flex-col gap-3 sm:mb-12 sm:flex-row sm:flex-wrap sm:gap-3.5"
            style={{ animationDelay: "0.3s" }}
          >
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ba-btn ba-btn-primary">
              Agendar Consulta
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </a>
            <a href="#especialidades" className="ba-btn ba-btn-secondary">
              Ver Especialidades
            </a>
          </div>

          <div
            className="animate-fade-in-up flex flex-col gap-3 border-t border-ba-steel/55 pt-6 sm:flex-row sm:flex-wrap sm:gap-6 sm:pt-7"
            style={{ animationDelay: "0.4s" }}
          >
            {[
              "Primeira consulta gratuita",
              "Atendimento em todo o Tocantins",
              "Resposta no mesmo dia",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <Check className="flex-none text-ba-accent" size={17} />
                <span className="text-sm text-ba-text/70">{item}</span>
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
    <div className="border-t border-ba-steel/40 px-4 py-14 sm:px-8">
      <Reveal className="mx-auto grid max-w-ba-container grid-cols-2 gap-8 sm:grid-cols-4">
        {TRUST_STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl font-extrabold tracking-[-0.02em] text-ba-accent sm:text-3xl">{stat.value}</div>
            <div className="mt-2 text-xs text-ba-text/70 sm:text-sm">{stat.label}</div>
          </div>
        ))}
      </Reveal>
    </div>
  );
}

export function About() {
  return (
    <section id="sobre" className="ba-paper px-4 py-20 sm:px-8 sm:py-28">
      <Reveal className="mx-auto grid max-w-ba-container gap-12 sm:grid-cols-2 sm:items-center">
        <div>
          <p className="ba-eyebrow mb-5">Sobre</p>
          <h2 className={`${SECTION_TITLE} mb-6 text-ba-bg`}>Dr. Alecrim</h2>
          <p className="mb-5 text-ba-body text-ba-slate">
            Advogado atuante em Palmas e em todo o Tocantins, com foco em Direito das Sucessões, Previdenciário, Trabalhista e Cível. Cada caso é conduzido pessoalmente, sem intermediários.
          </p>
          <p className="mb-8 text-ba-body text-ba-slate">
            A prática é orientada por um princípio simples: o cliente precisa entender o próprio processo. Linguagem clara, prazos reais e retorno rápido em cada etapa.
          </p>
          <div className="flex flex-wrap gap-3">
            {["Sucessões", "Previdenciário", "Trabalhista", "Cível"].map((tag) => (
              <span
                key={tag}
                className="rounded-ba-pill px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-ba-bg shadow-[inset_0_0_0_1px_rgb(var(--ba-steel)/0.3)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-ba-mist p-6">
            <div className="mb-2 text-2xl font-extrabold tracking-[-0.02em] text-ba-bg">1:1</div>
            <div className="text-sm text-ba-slate">Atendimento direto com o advogado</div>
          </div>
          <div className="bg-ba-bg p-6">
            <div className="mb-2 text-2xl font-extrabold tracking-[-0.02em] text-ba-accent">TO</div>
            <div className="text-sm text-ba-text/70">Atuação em todo o Tocantins</div>
          </div>
          <div className="bg-ba-bg p-6">
            <div className="mb-2 text-2xl font-extrabold tracking-[-0.02em] text-ba-accent">24h</div>
            <div className="text-sm text-ba-text/70">Retorno de primeiro contato</div>
          </div>
          <div className="bg-ba-mist p-6">
            <div className="mb-2 text-2xl font-extrabold tracking-[-0.02em] text-ba-bg">4</div>
            <div className="text-sm text-ba-slate">Áreas de atuação especializadas</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Services({ services }: { services: Service[] }) {
  return (
    <section id="especialidades" className="ba-paper border-t border-ba-steel/20 px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-ba-container">
        <Reveal>
          <h2 className={`${SECTION_TITLE} mb-12 text-center text-ba-bg`}>Especialidades</h2>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <Reveal key={service.id} delay={index * 80}>
              <div className="h-full p-8 shadow-[inset_0_0_0_1px_rgb(var(--ba-steel)/0.2)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-ba-ring-accent">
                <div className="mb-5 flex h-14 w-14 items-center justify-center bg-ba-mist">
                  <ServiceIcon slug={service.slug} className="text-ba-accent" size={28} />
                </div>
                <h3 className="mb-3 text-ba-item text-ba-bg">{service.title}</h3>
                <p className="text-ba-body-sm text-ba-slate">{service.description}</p>
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
    <section id="depoimentos" className="bg-ba-mist px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-ba-container">
        <Reveal>
          <h2 className={`${SECTION_TITLE} mb-12 text-center text-ba-bg`}>O que nossos clientes dizem</h2>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, index) => (
            <Reveal key={t.id} delay={index * 100}>
              <div className="h-full border-l-4 border-ba-accent bg-white p-8">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ba-accent text-lg font-bold text-white">
                    {t.author.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-ba-bg">{t.author}</div>
                    <div className="text-xs text-ba-slate/80">{t.role}</div>
                  </div>
                </div>
                <p className="text-ba-body-sm text-ba-slate">&ldquo;{t.content}&rdquo;</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const CONTACT_LABEL = "mb-2 text-xs font-bold uppercase tracking-ba-eyebrow text-ba-accent";
// -my-2.5/py-2.5: área de toque de ~40px sem mexer no espaçamento visual.
const CONTACT_VALUE = "-my-2.5 inline-block py-2.5 text-ba-text transition-colors duration-300 hover:text-ba-accent";

export function Contact() {
  return (
    <section id="contato" className="relative overflow-hidden px-4 py-20 sm:px-8 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_50%_100%,rgb(var(--ba-accent)/0.18)_0%,rgb(var(--ba-bg)/0)_65%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-ba-container">
        <Reveal>
          <h2 className={`${SECTION_TITLE} mb-14 text-center text-ba-text`}>Entre em Contato</h2>
        </Reveal>
        <Reveal className="grid gap-12 sm:grid-cols-2">
          <div className="space-y-6 text-center sm:text-left">
            <div>
              <h3 className={CONTACT_LABEL}>Telefone</h3>
              <a href={`tel:${PHONE_E164}`} className={CONTACT_VALUE}>
                {PHONE_DISPLAY}
              </a>
            </div>
            <div>
              <h3 className={CONTACT_LABEL}>E-mail</h3>
              <a href={`mailto:${CONTACT_EMAIL}`} className={CONTACT_VALUE}>
                {CONTACT_EMAIL}
              </a>
            </div>
            <div>
              <h3 className={CONTACT_LABEL}>Localização</h3>
              <p className="text-ba-text">Palmas, Tocantins — atendimento em todo o estado</p>
            </div>
            <div>
              <h3 className={CONTACT_LABEL}>Instagram</h3>
              <a
                href="https://www.instagram.com/advocaciaalecrim_/"
                target="_blank"
                rel="noopener noreferrer"
                className={CONTACT_VALUE}
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
    <footer className="border-t border-ba-steel/50 px-4 pb-24 pt-10 text-center text-xs text-ba-text/55 sm:px-8 sm:pb-10">
      <p>© {new Date().getFullYear()} Dr. Alecrim Advocacia. Todos os direitos reservados.</p>
      <p className="mt-3 flex flex-wrap justify-center gap-x-6">
        <a href="/blog" className="inline-block py-3 underline-offset-4 transition-colors duration-300 hover:text-ba-accent hover:underline">
          Blog
        </a>
        <a href={PRIVACY_PATH} className="inline-block py-3 underline-offset-4 transition-colors duration-300 hover:text-ba-accent hover:underline">
          Aviso de Privacidade
        </a>
      </p>
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
