import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME } from "@/lib/adminConstants";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Server Component: valida o cookie contra o Flask (GET /api/admin/me) a
// cada navegação. O middleware (frontend/middleware.ts) já faz um gate
// rápido só checando se o cookie existe - aqui é a validação "de verdade"
// do token.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/login");
  }

  let email: string | null = null;
  let authorized = false;

  try {
    const res = await fetch(`${API_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      email = typeof data?.email === "string" ? data.email : null;
      authorized = true;
    }
  } catch {
    authorized = false;
  }

  // redirect() precisa ficar fora do try/catch acima: ele funciona lançando
  // uma exceção interna do Next, que um catch genérico engoliria.
  if (!authorized) {
    redirect("/login");
  }

  return <AdminSidebar email={email}>{children}</AdminSidebar>;
}
