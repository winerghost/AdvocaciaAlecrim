import { getFaqs, getServices, getSiteSettings, getTestimonials } from "@/lib/api";
import { contactLinks } from "@/lib/siteContact";
import {
  About,
  Contact,
  Footer,
  Hero,
  Nav,
  Services,
  Testimonials,
  TrustStrip,
  WhatsappButton,
} from "@/components/sections";
import FAQ from "@/components/FAQ";
import ScrollProgress from "@/components/ScrollProgress";

// Conteúdo vem do Postgres via Flask - renderiza sempre no servidor a cada
// request em vez de congelar um snapshot no build (quando o backend nem
// está disponível ainda). Tráfego de uma landing page institucional não
// justifica a complexidade de ISR aqui.
export const dynamic = "force-dynamic";

// Server Component: busca serviços e depoimentos direto do Flask (SSR),
// com fallback vazio se a API estiver fora do ar.
export default async function Home() {
  const [services, testimonials, faqs, settings] = await Promise.all([
    getServices(),
    getTestimonials(),
    getFaqs(),
    getSiteSettings(),
  ]);
  const { whatsappUrl } = contactLinks(settings);

  return (
    // .theme-ba liga os tokens do design system (ver globals.css).
    <main id="conteudo" className="theme-ba">
      <a
        href="#sobre"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-ba-pill focus:bg-ba-accent focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <ScrollProgress />
      <Nav />
      <Hero />
      <TrustStrip />
      <About />
      <Services services={services} />
      <Testimonials testimonials={testimonials} />
      {/* Sem link no menu (Nav) por escolha do cliente - acessível só por scroll. */}
      <FAQ faqs={faqs} whatsappUrl={whatsappUrl} />
      <Contact />
      <Footer />
      <WhatsappButton />
    </main>
  );
}
