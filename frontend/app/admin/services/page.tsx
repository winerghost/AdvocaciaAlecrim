import type { Metadata } from "next";
import Link from "next/link";
import ServicesManager from "@/components/admin/ServicesManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminServicesPage() {
  return (
    <>
      {/* Atalho para a área de Artigos - o CRUD de serviços abaixo segue igual. */}
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/articles"
          className="inline-flex items-center gap-2 rounded border border-adm-accent px-3 py-1.5 text-xs font-semibold text-adm-accent transition hover:bg-adm-accent hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
          Gerenciar artigos do blog
        </Link>
      </div>
      <ServicesManager />
    </>
  );
}
