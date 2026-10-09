import Link from "next/link";

// 404 do blog (slug inexistente ou página além da última), renderizado
// dentro de app/blog/layout.tsx - mantém cabeçalho, rodapé e tema.
export default function BlogNotFound() {
  return (
    <section className="relative overflow-hidden">
      <div className="ba-backdrop" aria-hidden="true" />
      <div className="relative mx-auto max-w-ba-container px-4 py-24 text-center sm:px-8 sm:py-32">
        <p className="ba-eyebrow">Erro 404</p>
        <h1 className="mt-6 text-ba-h2 uppercase text-ba-text">
          Artigo <span className="text-ba-accent">não encontrado</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-ba-lead text-ba-text/70">
          O endereço pode ter mudado ou o artigo não está mais publicado.
        </p>
        <Link href="/blog" className="ba-btn ba-btn-primary mt-10">
          Ver todos os artigos
        </Link>
      </div>
    </section>
  );
}
