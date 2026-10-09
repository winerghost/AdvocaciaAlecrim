"use client"; // Error boundaries precisam ser Client Components.

import { useEffect } from "react";

// Falha ao carregar um artigo (backend fora do ar, 5xx). Fica dentro de
// app/blog/layout.tsx, então cabeçalho, rodapé e tema continuam na tela.
// No Next 16 a prop de nova tentativa se chama `retry` (antes era `reset`).
export default function BlogError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-ba-container px-4 py-24 text-center sm:px-8 sm:py-32">
      <p className="ba-eyebrow">Algo deu errado</p>
      <h1 className="mt-6 text-ba-h2 uppercase text-ba-text">
        Conteúdo <span className="text-ba-accent">indisponível</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-ba-lead text-ba-text/70">
        Não foi possível carregar esta página agora. Tente novamente em alguns instantes.
      </p>
      <div className="mt-10 flex flex-col items-stretch justify-center gap-3.5 sm:flex-row sm:items-center">
        <button type="button" onClick={() => retry()} className="ba-btn ba-btn-primary">
          Tentar novamente
        </button>
        <a href="/blog" className="ba-btn ba-btn-secondary">
          Ver todos os artigos
        </a>
      </div>
    </section>
  );
}
