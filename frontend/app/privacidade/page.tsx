import type { Metadata } from "next";
import Link from "next/link";
import { BlogFooter, BlogHeader } from "@/components/blog/BlogChrome";
import { SITE_NAME, SITE_URL } from "@/components/blog/utils";
import { CONTACT_EMAIL, PHONE_DISPLAY, PHONE_E164, PRIVACY_PATH } from "@/lib/constants";

// Aviso de Privacidade (LGPD, Lei 13.709/2018) - linkado ao lado do aceite do
// formulário de contato (components/LeadForm.tsx) e nos rodapés.
//
// O texto descreve o que o sistema FAZ hoje. Ao mudar o formulário
// (LeadForm.tsx), o que é gravado (backend/app/models/lead.py) ou o prazo de
// expurgo (LEAD_RETENTION_DAYS em backend/app/config.py, hoje 180 dias),
// atualize esta página e a data abaixo.
const LAST_UPDATED = "9 de outubro de 2026";

// PENDENTE - dados que não constam no repositório e que o escritório precisa
// informar antes da publicação. Enquanto estiverem assim, aparecem na página
// entre colchetes, de propósito, para não passarem despercebidos.
const PENDING = {
  // Nome completo do advogado ou razão social da sociedade de advogados.
  controllerName: "[PREENCHER: nome completo do advogado ou razão social]",
  // Inscrição na OAB (número e seccional) e, se for sociedade, o CNPJ.
  controllerRegistration: "[PREENCHER: nº de inscrição na OAB/TO e, se houver, CNPJ]",
  // Endereço completo do escritório (o site só informa "Palmas, Tocantins").
  controllerAddress: "[PREENCHER: endereço completo do escritório]",
  // Encarregado pelo tratamento de dados (art. 41 da LGPD).
  dpoName: "[PREENCHER: nome do encarregado pelo tratamento de dados]",
};

const DESCRIPTION =
  "Como o escritório Advocacia Alecrim trata os dados pessoais enviados pelo formulário de contato do site: quais dados, para quê, por quanto tempo e quais são os seus direitos pela LGPD.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `Aviso de Privacidade | ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: PRIVACY_PATH },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE_NAME,
    title: "Aviso de Privacidade",
    description: DESCRIPTION,
    url: PRIVACY_PATH,
  },
};

const LINK = "text-ba-text underline underline-offset-4 transition-colors duration-300 hover:text-ba-accent";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-ba-steel/50 py-10 first:border-t-0 first:pt-0 sm:py-12">
      <h2 id={id} className="text-ba-h3 uppercase text-ba-text">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-ba-body text-ba-text/70">{children}</div>
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-ba-accent">{children}</ul>;
}

export default function PrivacyPage() {
  return (
    // Mesma moldura do blog (app/blog/layout.tsx): tema .theme-ba, cabeçalho
    // e rodapé com link de volta para a home.
    <div className="theme-ba flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-ba-pill focus:bg-ba-accent focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <BlogHeader />
      <main id="conteudo" className="flex-1">
        <section className="relative overflow-hidden border-b border-ba-steel/30">
          <div className="ba-backdrop" aria-hidden="true" />
          <div className="relative mx-auto max-w-ba-container px-4 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
            <p className="ba-eyebrow">LGPD · Advocacia Alecrim</p>
            <h1 className="mt-6 text-ba-title uppercase text-ba-text">
              Aviso de <span className="text-ba-accent">Privacidade</span>
            </h1>
            <p className="mt-6 max-w-2xl text-ba-lead text-ba-text/70">
              Este aviso explica, de forma direta, o que acontece com os dados pessoais que você envia pelo
              formulário de contato deste site, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
            </p>
            <p className="mt-6 text-ba-nav uppercase text-ba-text/55">Última atualização: {LAST_UPDATED}</p>
          </div>
        </section>

        <div className="mx-auto max-w-ba-prose px-4 py-14 sm:px-8 sm:py-20">
          <Section id="controlador" title="1. Quem trata os seus dados">
            <p>
              O controlador dos dados é o escritório {SITE_NAME}, com atuação em Palmas, Tocantins, responsável
              por este site.
            </p>
            <List>
              <li>Responsável: {PENDING.controllerName}</li>
              <li>Registro profissional: {PENDING.controllerRegistration}</li>
              <li>Endereço: {PENDING.controllerAddress}</li>
              <li>Encarregado pelo tratamento de dados: {PENDING.dpoName}</li>
            </List>
          </Section>

          <Section id="dados" title="2. Quais dados coletamos">
            <p>Somente os dados que você mesmo informa no formulário de contato:</p>
            <List>
              <li>nome completo;</li>
              <li>telefone / WhatsApp;</li>
              <li>e-mail (opcional);</li>
              <li>área de interesse (opcional);</li>
              <li>mensagem com o breve relato do seu caso (opcional);</li>
              <li>o registro de que você marcou a autorização de uso dos dados.</li>
            </List>
            <p>
              Pedimos que não inclua na mensagem dados sensíveis (como informações de saúde) além do estritamente
              necessário para entendermos o seu caso.
            </p>
            <p>
              Como em qualquer site, o endereço IP da sua conexão é processado pelos servidores para entregar as
              páginas e para proteger o formulário contra envios abusivos. Este site não usa cookies de
              publicidade nem ferramentas de rastreamento de terceiros.
            </p>
          </Section>

          <Section id="finalidade" title="3. Para que usamos">
            <p>
              Exclusivamente para retornar o seu contato e entender a sua demanda, por telefone, WhatsApp ou
              e-mail. Os dados não são usados para envio de publicidade nem para qualquer outra finalidade.
            </p>
          </Section>

          <Section id="base-legal" title="4. Base legal">
            <p>
              O tratamento é feito com base no seu consentimento (art. 7º, I, da LGPD), dado ao marcar a
              autorização no formulário antes do envio. Você pode revogar esse consentimento a qualquer momento,
              pelos canais indicados no item 8, sem prejuízo do que foi feito antes da revogação.
            </p>
          </Section>

          <Section id="retencao" title="5. Por quanto tempo guardamos e como protegemos">
            <p>
              Os contatos recebidos pelo formulário são eliminados por uma rotina programada após 180 dias do
              envio. A exceção são os contatos que resultam na contratação do escritório: nesse caso os dados
              passam a integrar a relação entre cliente e advogado e são mantidos pelo prazo exigido por essa
              relação e pelas obrigações legais e profissionais aplicáveis.
            </p>
            <p>
              Nome, telefone, e-mail e mensagem são armazenados de forma criptografada, e o acesso é restrito às
              pessoas do escritório autorizadas a atender os contatos.
            </p>
          </Section>

          <Section id="compartilhamento" title="6. Com quem compartilhamos">
            <p>
              Não vendemos, cedemos nem compartilhamos os seus dados com terceiros. Eles passam apenas pelos
              prestadores de serviço necessários ao funcionamento do site e ao recebimento da sua mensagem: o
              provedor de hospedagem e o provedor de e-mail do escritório.
            </p>
            <p>
              Se você preferir falar pelo WhatsApp, pelo Instagram ou por e-mail, a conversa acontece nessas
              plataformas e segue também as políticas de privacidade de cada uma.
            </p>
          </Section>

          <Section id="direitos" title="7. Seus direitos">
            <p>Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:</p>
            <List>
              <li>a confirmação de que tratamos dados seus;</li>
              <li>o acesso aos dados;</li>
              <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>
                a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em
                desconformidade com a lei;
              </li>
              <li>a portabilidade dos dados;</li>
              <li>a eliminação dos dados tratados com base no seu consentimento;</li>
              <li>a informação sobre com quem os dados foram compartilhados;</li>
              <li>a informação sobre a possibilidade de não consentir e as consequências dessa recusa;</li>
              <li>a revogação do consentimento.</li>
            </List>
            <p>
              Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
            </p>
          </Section>

          <Section id="contato" title="8. Como exercer os seus direitos">
            <p>Envie o seu pedido por um dos canais abaixo. Respondemos pelo mesmo canal.</p>
            <List>
              <li>
                E-mail:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                Telefone / WhatsApp:{" "}
                <a href={`tel:${PHONE_E164}`} className={LINK}>
                  {PHONE_DISPLAY}
                </a>
              </li>
            </List>
          </Section>

          <Section id="alteracoes" title="9. Alterações deste aviso">
            <p>
              Este aviso pode ser atualizado para refletir mudanças no site ou na legislação. A data da última
              atualização fica indicada no topo da página.
            </p>
          </Section>

          <p className="border-t border-ba-steel/50 pt-10">
            <Link href="/#contato" className="ba-btn ba-btn-secondary ba-btn-sm">
              Voltar para o contato
            </Link>
          </p>
        </div>
      </main>
      <BlogFooter />
    </div>
  );
}
