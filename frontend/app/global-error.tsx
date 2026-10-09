"use client"; // Error boundaries precisam ser Client Components.

// Erro no layout raiz (o caso mais grave: nada do site renderizou). Existe
// por causa da CSP: a tela de erro embutida do Next injeta um <style> inline
// sem nonce, bloqueado pela diretiva style-src-elem de proxy.ts. Este
// arquivo substitui o layout raiz, então o CSS global (Tailwind) não está
// disponível - por isso usa atributos style, que a CSP permite
// (style-src-attr). No Next 16 a prop de nova tentativa se chama `retry`.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#000417",
          background: "#ffffff",
        }}
      >
        <title>Erro | Advocacia Alecrim</title>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Algo deu errado</h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#64748b" }}>
          Não foi possível carregar a página agora. Tente novamente em alguns instantes.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 600,
            color: "#ffffff",
            background: "#007ef3",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
