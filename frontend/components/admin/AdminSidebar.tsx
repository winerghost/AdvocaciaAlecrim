"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/admin/LogoutButton";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5 shrink-0",
  "aria-hidden": true,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/services",
    label: "Serviços",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="8" width="18" height="11" rx="2" ry="2" />
        <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="3" y1="13" x2="21" y2="13" />
      </svg>
    ),
  },
  {
    href: "/admin/testimonials",
    label: "Depoimentos",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    href: "/admin/faqs",
    label: "FAQ",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/admin/leads",
    label: "Leads",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/admin/senha",
    label: "Trocar senha",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

// Client Component: só cuida da apresentação (sidebar/topbar/drawer mobile)
// e do estado de abrir/fechar o menu em telas pequenas. Autenticação e
// redirects continuam 100% em app/admin/layout.tsx (Server Component).
export default function AdminSidebar({
  email,
  children,
}: {
  email: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const navList = (
    <nav className="flex-1 space-y-1 px-2 py-4">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-[#1e282c] text-white"
              : "text-[#c2c7d0] hover:bg-white/5 hover:text-white"
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f9] md:flex">
      {/* Sidebar fixa (telas md+) */}
      <aside className="hidden md:flex md:w-60 md:flex-shrink-0 md:flex-col md:bg-[#343a40]">
        <div className="border-b border-white/10 px-4 py-5">
          <span className="text-sm font-bold leading-tight text-white">
            Painel · Advocacia Alecrim
          </span>
        </div>
        {navList}
      </aside>

      {/* Menu recolhível (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#343a40] shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold text-white">Painel · Advocacia Alecrim</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="text-[#c2c7d0] hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {navList}
          </div>
        </div>
      )}

      {/* Coluna de conteúdo */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#dee2e6] bg-white px-4 py-3 shadow-sm sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="text-[#495057] hover:text-[#007bff] md:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="hidden text-sm text-[#6c757d] md:block">
            {email && (
              <>
                Logado como <span className="font-medium text-[#343a40]">{email}</span>
              </>
            )}
          </div>

          <LogoutButton />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
