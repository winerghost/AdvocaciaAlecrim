// Dados de contato e legais do escritório, editáveis no painel
// (Configurações > Site). Módulo puro (sem fetch): usado pelo site público
// (via getSiteSettings em lib/api.ts) e pelo formulário do painel.
//
// Os valores de lib/constants.ts são o FALLBACK: se o backend estiver fora
// do ar ou a configuração nunca tiver sido salva, o site mostra exatamente o
// que mostrava antes.
import { CONTACT_EMAIL, PHONE_DIGITS } from "@/lib/constants";

export type SiteSettings = {
  phone: string; // só dígitos, com DDI 55
  contact_email: string;
  instagram: string; // usuário sem "@"; vazio = esconde
  location: string;
  controller_name: string;
  controller_registration: string;
  controller_address: string;
  dpo_name: string;
  legal_updated_at: string | null; // AAAA-MM-DD
  // SEO e compartilhamento: vazio = texto/imagem padrão do código.
  seo_home_title: string;
  seo_home_description: string;
  seo_blog_title: string;
  seo_blog_description: string;
  og_image: string; // "" ou /api/media/<arquivo>
  // Opções do campo "Área de interesse" (sem "Outro", que é fixo).
  lead_areas: string[];
  lead_retention_days: number;
};

export const OTHER_AREA = "Outro";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  phone: PHONE_DIGITS,
  contact_email: CONTACT_EMAIL,
  instagram: "advocaciaalecrim_",
  location: "Palmas, Tocantins — atendimento em todo o estado",
  controller_name: "",
  controller_registration: "",
  controller_address: "",
  dpo_name: "",
  legal_updated_at: null,
  seo_home_title: "",
  seo_home_description: "",
  seo_blog_title: "",
  seo_blog_description: "",
  og_image: "",
  lead_areas: ["Inventário Judicial", "Aposentadoria", "Ação Trabalhista", "Ação Cível"],
  lead_retention_days: 180,
};

const MEDIA_RE = /^\/api\/media\/[0-9a-f]{32}\.(?:jpg|png|webp|gif)$/;

function areas(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  const list = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 60);
  return list.length === value.length ? list : null;
}

const PHONE_RE = /^55[1-9][0-9]9?[0-9]{8}$/;
const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

/** Aceita só valores no formato esperado; o resto cai no default. O backend
 * já valida, isto é defesa extra para nunca montar um link estranho. */
export function normalizeSiteSettings(raw: unknown): SiteSettings {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SITE_SETTINGS;
  const phone = str(data.phone, 13);
  const email = str(data.contact_email, 254);
  const instagram = str(data.instagram, 30);
  const updated = str(data.legal_updated_at, 10);
  return {
    phone: phone && PHONE_RE.test(phone) ? phone : d.phone,
    contact_email: email && email.includes("@") && !/\s/.test(email) ? email : d.contact_email,
    instagram: instagram !== null && (instagram === "" || INSTAGRAM_RE.test(instagram)) ? instagram : d.instagram,
    location: str(data.location, 120) || d.location,
    controller_name: str(data.controller_name, 200) ?? "",
    controller_registration: str(data.controller_registration, 200) ?? "",
    controller_address: str(data.controller_address, 300) ?? "",
    dpo_name: str(data.dpo_name, 200) ?? "",
    legal_updated_at: updated && DATE_RE.test(updated) ? updated : null,
    seo_home_title: str(data.seo_home_title, 70) ?? "",
    seo_home_description: str(data.seo_home_description, 170) ?? "",
    seo_blog_title: str(data.seo_blog_title, 70) ?? "",
    seo_blog_description: str(data.seo_blog_description, 170) ?? "",
    og_image: typeof data.og_image === "string" && MEDIA_RE.test(data.og_image) ? data.og_image : "",
    lead_areas: areas(data.lead_areas) ?? d.lead_areas,
    lead_retention_days:
      Number.isInteger(data.lead_retention_days) &&
      (data.lead_retention_days as number) >= 30 &&
      (data.lead_retention_days as number) <= 730
        ? (data.lead_retention_days as number)
        : d.lead_retention_days,
  };
}

/** "5563999941821" -> "(63) 99994-1821". */
export function formatPhoneDisplay(digits: string): string {
  const local = digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  const split = num.length - 4;
  return `(${ddd}) ${num.slice(0, split)}-${num.slice(split)}`;
}

export type ContactLinks = {
  phoneDisplay: string;
  phoneE164: string;
  whatsappUrl: string;
  instagramUrl: string | null;
  instagramHandle: string | null;
  email: string;
  location: string;
};

export function contactLinks(settings: SiteSettings): ContactLinks {
  return {
    phoneDisplay: formatPhoneDisplay(settings.phone),
    phoneE164: `+${settings.phone}`,
    whatsappUrl: `https://wa.me/${settings.phone}`,
    instagramUrl: settings.instagram ? `https://www.instagram.com/${settings.instagram}/` : null,
    instagramHandle: settings.instagram ? `@${settings.instagram}` : null,
    email: settings.contact_email,
    location: settings.location,
  };
}

/** Imagem de compartilhamento: a escolhida no painel ou a padrão. */
export function shareImage(
  settings: SiteSettings,
  fallback: { url: string; width?: number; height?: number; alt?: string }
) {
  return settings.og_image ? { url: settings.og_image, alt: fallback.alt } : fallback;
}
