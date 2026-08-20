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
    <main className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 p-8">
        <h1 className="mb-1 text-lg font-semibold text-white">Painel administrativo</h1>
        <p className="mb-6 text-sm text-white/60">Advocacia Alecrim</p>
        <LoginForm />
      </div>
    </main>
  );
}
