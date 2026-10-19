// Constantes compartilhadas entre Server e Client Components. Ficam num
// módulo próprio (em vez de dentro de sections.tsx) pra não misturar
// exports de Server Component com valores simples através da fronteira
// client/server do Next.
//
// Telefone e e-mail abaixo são o VALOR PADRÃO: o que vale no site é o que
// foi salvo no painel (Configurações > Site), lido por getSiteSettings() em
// lib/api.ts e montado por lib/siteContact.ts. Estes valores só aparecem se
// nada foi salvo ou o backend estiver fora. Não escreva o número direto em
// componentes - use contactLinks().
export const PHONE_DIGITS = "5563999941821";
export const PHONE_E164 = `+${PHONE_DIGITS}`;
export const PHONE_DISPLAY = "(63) 99994-1821";
export const WHATSAPP_URL = `https://wa.me/${PHONE_DIGITS}`;

// E-mail de contato do escritório (seção Contato e Aviso de Privacidade).
export const CONTACT_EMAIL = "alecrimrio@gmail.com";

// Aviso de Privacidade (LGPD) - linkado no formulário de contato e nos rodapés.
export const PRIVACY_PATH = "/privacidade";
