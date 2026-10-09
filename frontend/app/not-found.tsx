import Link from "next/link";

// 404 do site (qualquer endereço inexistente fora de /blog, que tem o seu).
// Existe por causa da CSP: a página 404 embutida do Next injeta um <style>
// inline sem nonce, que a diretiva style-src-elem de proxy.ts bloqueia (a
// página aparecia sem estilo e com erro no console). Aqui só há classes do
// Tailwind, que já estão no CSS estático.
export default function NotFound() {
  return (
    <main className="theme-ba relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <div className="ba-backdrop" aria-hidden="true" />
      <p className="ba-eyebrow relative">Erro 404</p>
      <h1 className="relative mt-5 text-ba-cta uppercase text-ba-text">Página não encontrada</h1>
      <p className="relative mt-4 max-w-md text-ba-body text-ba-text/70">
        O endereço pode ter mudado ou a página não existe mais.
      </p>
      <Link
        href="/"
        className="ba-btn ba-btn-primary relative mt-8"
      >
        Voltar para o início
      </Link>
    </main>
  );
}
