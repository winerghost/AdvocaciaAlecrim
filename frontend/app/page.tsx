import { getFaqs, getServices, getTestimonials } from "@/lib/api";
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
  const [services, testimonials, faqs] = await Promise.all([
    getServices(),
    getTestimonials(),
    getFaqs(),
  ]);

  return (
    <main>
      <ScrollProgress />
      <Nav />
      <Hero />
      <TrustStrip />
      <About />
      <Services services={services} />
      <Testimonials testimonials={testimonials} />
      {/* Sem link no menu (Nav) por escolha do cliente - acessível só por scroll. */}
      <FAQ faqs={faqs} />
      <Contact />
      <Footer />
      <WhatsappButton />
    </main>
  );
}
