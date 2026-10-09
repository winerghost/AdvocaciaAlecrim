"use client";

import { useState } from "react";

type NavLink = { href: string; label: string };

// Menu sanduíche da landing e do blog, no tema .theme-ba.
export default function MobileNav({
  links,
  whatsappUrl,
}: {
  links: NavLink[];
  whatsappUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ba-text transition hover:text-ba-accent"
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-ba-steel/50 bg-ba-bg px-4 pb-6 pt-2 shadow-xl">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-3 py-3 text-ba-nav uppercase text-ba-text/75 transition hover:bg-ba-steel/20 hover:text-ba-text"
              >
                {link.label}
              </a>
            ))}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="ba-btn ba-btn-primary ba-btn-sm mt-2"
            >
              Falar no WhatsApp
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
