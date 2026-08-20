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

export type AdminLead = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  area: string | null;
  message: string | null;
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
