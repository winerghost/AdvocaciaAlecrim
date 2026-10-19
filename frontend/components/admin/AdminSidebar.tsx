"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/admin/LogoutButton";
import {
  ADMIN_SETTINGS_ITEMS,
  isAdminPathActive,
  type AdminSettingsItem,
} from "@/lib/adminSettingsNav";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

type NavGroup = {
  id: string;
  label: string;
  icon: ReactNode;
  children: AdminSettingsItem[];
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
    href: "/admin/articles",
    label: "Artigos",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
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
    href: "/admin/users",
    label: "Usuários",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const SETTINGS_GROUP: NavGroup = {
  id: "configuracoes",
  label: "Configurações",
  icon: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  children: ADMIN_SETTINGS_ITEMS,
};

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
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Drawer mobile: ao abrir, foco no botão de fechar; ao fechar, o foco
  // volta para o botão que abriu o menu.
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    } else if (wasOpen.current) {
      openButtonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Esc fecha e Tab fica preso dentro do drawer enquanto ele está aberto.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])"
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = drawerRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function isActive(href: string) {
    return isAdminPathActive(pathname, href);
  }

  const settingsActive = SETTINGS_GROUP.children.some((c) => isActive(c.href));
  // null = segue a rota (abre sozinho quando uma página filha está ativa);
  // true/false = o usuário abriu/fechou manualmente.
  const [settingsToggled, setSettingsToggled] = useState<boolean | null>(null);
  const settingsExpanded = settingsToggled ?? settingsActive;
  const settingsListId = `nav-group-${SETTINGS_GROUP.id}`;

  const navList = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-adm-ink-soft text-white"
              : "text-adm-on-dark hover:bg-white/5 hover:text-white"
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}

      <div>
        <button
          type="button"
          onClick={() => setSettingsToggled(!settingsExpanded)}
          aria-expanded={settingsExpanded}
          aria-controls={settingsListId}
          className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium transition ${
            settingsActive
              ? "bg-adm-ink-soft text-white"
              : "text-adm-on-dark hover:bg-white/5 hover:text-white"
          }`}
        >
          {SETTINGS_GROUP.icon}
          <span className="flex-1">{SETTINGS_GROUP.label}</span>
          <svg
            {...ICON_PROPS}
            className={`h-4 w-4 shrink-0 transition-transform ${settingsExpanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {settingsExpanded && (
          <ul id={settingsListId} className="mt-1 space-y-1 pl-8">
            {SETTINGS_GROUP.children.map((child) => {
              const active = isActive(child.href);
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded px-3 py-2 text-sm transition ${
                      active
                        ? "font-semibold text-white"
                        : "text-adm-on-dark hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );

  return (
    <div className="theme-adm min-h-screen bg-adm-canvas md:flex">
      {/* Sidebar fixa (telas md+) */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:bg-adm-ink">
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
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-adm-ink shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-bold text-white">Painel · Advocacia Alecrim</span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="-m-2.5 p-2.5 text-adm-on-dark hover:text-white"
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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-adm-border bg-white px-4 py-3 shadow-xs sm:px-6">
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            className="-m-2.5 p-2.5 text-adm-body hover:text-adm-accent md:hidden"
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

          <div className="hidden text-sm text-adm-muted md:block">
            {email && (
              <>
                Logado como <span className="font-medium text-adm-ink">{email}</span>
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
