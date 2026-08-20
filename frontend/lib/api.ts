// URL usada em chamadas feitas pelo servidor Next (SSR / route handlers):
// dentro do docker-compose aponta para o serviço "backend" na rede interna.
const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Service = {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
};

export type Testimonial = {
  id: number;
  author: string;
  role: string;
  content: string;
  rating: number;
};

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    const json = await res.json();
    return (json.data as T) ?? fallback;
  } catch {
    // Backend fora do ar não deve derrubar a página - cai para o fallback.
    return fallback;
  }
}

export function getServices(): Promise<Service[]> {
  return safeFetch<Service[]>("/api/services", []);
}

export function getTestimonials(): Promise<Testimonial[]> {
  return safeFetch<Testimonial[]>("/api/testimonials", []);
}
