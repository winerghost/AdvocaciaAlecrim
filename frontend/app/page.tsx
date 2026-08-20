import { getServices, getTestimonials } from "@/lib/api";
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
import ScrollProgress from "@/components/ScrollProgress";

// Conteúdo vem do Postgres via Flask - renderiza sempre no servidor a cada
// request em vez de congelar um snapshot no build (quando o backend nem
// está disponível ainda). Tráfego de uma landing page institucional não
// justifica a complexidade de ISR aqui.
export const dynamic = "force-dynamic";

// Server Component: busca serviços e depoimentos direto do Flask (SSR),
// com fallback vazio se a API estiver fora do ar.
export default async function Home() {
  const [services, testimonials] = await Promise.all([getServices(), getTestimonials()]);

  return (
    <main>
      <ScrollProgress />
      <Nav />
      <Hero />
      <TrustStrip />
      <About />
      <Services services={services} />
      <Testimonials testimonials={testimonials} />
      <Contact />
      <Footer />
      <WhatsappButton />
    </main>
  );
}
