import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";

// Sem link em Nav/MobileNav/Footer nem em nenhum outro lugar do site
// público - só acessível digitando a URL diretamente. Ver grep de
// verificação no relatório da tarefa.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f9] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#007bff] text-white shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[#343a40]">Painel Administrativo</h1>
          <p className="mt-1 text-sm text-[#6c757d]">Entre para gerenciar o conteúdo do site</p>
        </div>

        <div className="rounded-md border border-[#dee2e6] bg-white p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-[#adb5bd]">Advocacia Alecrim</p>
      </div>
    </main>
  );
}
