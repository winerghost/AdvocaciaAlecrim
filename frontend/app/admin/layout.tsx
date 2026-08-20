import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ADMIN_COOKIE_NAME } from "@/lib/adminConstants";
import LogoutButton from "@/components/admin/LogoutButton";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const NAV_ITEMS = [
  { href: "/admin/services", label: "Serviços" },
  { href: "/admin/testimonials", label: "Depoimentos" },
  { href: "/admin/faqs", label: "FAQ" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/senha", label: "Trocar senha" },
];

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

  return (
    <div className="min-h-screen bg-slate-bg text-navy">
      <header className="border-b border-navy/10 bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-tight">Painel · Advocacia Alecrim</span>
            {email && <span className="text-xs text-white/60">{email}</span>}
          </div>
          <LogoutButton />
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pb-3 sm:px-8">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-slate-bg transition hover:bg-white/10 hover:text-gold"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
