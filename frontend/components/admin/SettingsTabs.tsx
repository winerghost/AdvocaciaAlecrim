"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SETTINGS_ITEMS, isAdminPathActive } from "@/lib/adminSettingsNav";

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-adm-border">
        {ADMIN_SETTINGS_ITEMS.map((item) => {
          const active = isAdminPathActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-adm-accent text-adm-ink"
                    : "border-transparent text-adm-muted hover:border-adm-border hover:text-adm-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
