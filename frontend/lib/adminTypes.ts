// Tipos usados só pelo painel /admin (mais completos que os de lib/api.ts,
// que só expõe os campos consumidos pelo site público).

export type AdminService = {
  id: number;
  slug: string;
  title: string;
  icon: string;
  description: string;
  order: number;
};

export type AdminTestimonial = {
  id: number;
  author: string;
  role: string;
  content: string;
  rating: number;
  approved: boolean;
};

export type AdminFaq = {
  id: number;
  question: string;
  answer: string;
  order: number;
};

// Mesmo padrão de AREA_CHOICES em backend/app/schemas/lead.py: essa lista é
// só UX (rótulo do <select> no painel) - quem de fato decide quais valores
// são aceitos é o backend (LeadStatusSchema, validate.OneOf(LEAD_STATUSES)
// em backend/app/models/lead.py). Mandar um status fora dessa lista pra API
// direto (sem passar pelo <select>) é rejeitado lá, não aqui - o frontend
// nunca valida, só exibe e repassa o que o admin escolheu.
export type LeadStatus = "novo" | "em_contato" | "convertido" | "descartado";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  convertido: "Convertido",
  descartado: "Descartado",
};

export type AdminLead = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  area: string | null;
  message: string | null;
  status: LeadStatus;
  created_at: string;
};

// O envelope de resposta do backend segue o mesmo padrão de /api/services
// etc. ({"data": [...]}), mas essa função aceita também uma lista "crua"
// como fallback defensivo, sem depender de detalhe de implementação do
// outro time.
export function extractList<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
    return (json as { data: T[] }).data;
  }
  return [];
}
