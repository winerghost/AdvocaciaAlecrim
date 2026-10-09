// Constantes compartilhadas entre Server e Client Components. Ficam num
// módulo próprio (em vez de dentro de sections.tsx) pra não misturar
// exports de Server Component com valores simples através da fronteira
// client/server do Next.
//
// Telefone ÚNICO do escritório. Todo link tel:/WhatsApp e todo texto visível
// deve sair daqui - não escreva o número direto em componentes.
export const PHONE_DIGITS = "5563999941821";
export const PHONE_E164 = `+${PHONE_DIGITS}`;
export const PHONE_DISPLAY = "(63) 99994-1821";
export const WHATSAPP_URL = `https://wa.me/${PHONE_DIGITS}`;

// E-mail de contato do escritório (seção Contato e Aviso de Privacidade).
export const CONTACT_EMAIL = "alecrimrio@gmail.com";

// Aviso de Privacidade (LGPD) - linkado no formulário de contato e nos rodapés.
export const PRIVACY_PATH = "/privacidade";
