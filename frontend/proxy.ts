import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminConstants";

// Arquivo `proxy.ts` = o antigo `middleware.ts` (a convenção "middleware"
// foi descontinuada no Next 16 e renomeada para "proxy"; ver
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Faz duas coisas, nesta ordem:
//   1. gate de autenticação do painel (/admin/*);
//   2. Content-Security-Policy com nonce por requisição em todas as páginas.

/**
 * Monta a CSP da resposta. O nonce é novo a cada requisição: o Next lê o
 * header `Content-Security-Policy` da REQUISIÇÃO durante a renderização e
 * aplica o nonce sozinho nos scripts dele (runtime, bundles e os inline do
 * payload RSC) - por isso toda página precisa ser renderizada dinamicamente
 * (ver `connection()` em app/layout.tsx).
 */
function buildCsp(nonce: string, request: NextRequest): string {
  // `next dev` precisa de eval (o React reconstrói stacks de erro do servidor
  // com ele) e injeta <style> sem nonce (HMR/overlay de erro). Em produção
  // nenhuma das duas concessões existe.
  const isDev = process.env.NODE_ENV === "development";

  // Só pede "upgrade" quando a requisição chegou por HTTPS (o Nginx do host
  // repassa X-Forwarded-Proto). Sem isso, acessar o container direto por
  // http://127.0.0.1:3000 faria o navegador reescrever CSS/JS para https://
  // e a página carregaria sem nada.
  const isHttps =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" ||
    request.nextUrl.protocol === "https:";

  const directives = [
    "default-src 'self'",
    // Sem 'unsafe-inline': só roda script com o nonce desta resposta, e o
    // que esses scripts carregarem ('strict-dynamic', que cobre os chunks
    // que o Next importa sob demanda). Um <script> ou on*="" injetado no
    // HTML de um artigo não tem o nonce e é bloqueado pelo navegador.
    // 'self' é ignorado por navegadores que entendem 'strict-dynamic'; fica
    // como fallback para os que não entendem.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Estilos, em três diretivas:
    // - style-src-elem: folhas de estilo. Só arquivos do próprio site (o CSS
    //   do Tailwind e do next/font é estático) e <style> com o nonce (o
    //   TipTap injeta um; ver `injectNonce` em RichTextEditor.tsx).
    // - style-src-attr: atributos style="". Precisa de 'unsafe-inline' e não
    //   há alternativa (nonce não vale para atributo): o HTML dos artigos
    //   usa style="text-align: ..." (é como o editor grava o alinhamento, e
    //   o único style que o sanitizador do backend preserva), o next/image
    //   emite style="color:transparent" e vários componentes usam `style`
    //   do React, que no HTML vindo do servidor é atributo. Um style=""
    //   injetado não executa script; o risco residual é só visual.
    // - style-src: fallback para navegadores sem suporte às duas acima
    //   (anteriores a 2022). Tem de ser a união das duas, senão esses
    //   navegadores perderiam os atributos style.
    isDev
      ? "style-src 'self' 'unsafe-inline'"
      : [
          "style-src 'self' 'unsafe-inline'",
          `style-src-elem 'self' 'nonce-${nonce}'`,
          "style-src-attr 'unsafe-inline'",
        ].join("; "),
    // Imagens: só do próprio site (/images, /_next/image, /api/media/...).
    // data: e blob: são usados pelo next/image (placeholder) e pela prévia
    // de arquivos no painel. Nenhuma imagem externa: o backend só aceita
    // <img src="/api/media/...">.
    "img-src 'self' data: blob:",
    // A Figtree do blog é baixada no build pelo next/font e servida de
    // /_next/static/media - o navegador não fala com o Google.
    "font-src 'self'",
    // Todo fetch do navegador vai para /api/* do próprio Next.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Equivalente moderno do X-Frame-Options: DENY (que continua sendo
    // enviado por next.config.js para navegadores antigos).
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  // Gate rápido do painel: só checa se o cookie existe, antes de qualquer
  // página do painel renderizar. Cookie presente != token válido - a
  // validação real acontece em app/admin/layout.tsx via GET /api/admin/me.
  // A comparação de caminho repete exatamente o que o matcher antigo
  // ("/admin/:path*") cobria: "/admin" e tudo abaixo de "/admin/".
  const { pathname } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin && !request.cookies.has(ADMIN_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, request);

  // A CSP vai na REQUISIÇÃO (é de onde o Next extrai o nonce ao renderizar)
  // e na RESPOSTA (é o que o navegador aplica). `x-nonce` deixa o valor
  // disponível para Server Components via headers(), se um dia for preciso
  // passar o nonce a um <Script> de terceiros.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Painel: sempre passa por aqui, inclusive nos prefetches do <Link>,
    // para o redirect de autenticação valer para qualquer requisição (era
    // o único matcher antes da CSP).
    "/admin/:path*",
    // Demais páginas, para receberem a CSP. Ficam de fora: /api/* (respostas
    // JSON/imagem, CSP de documento não se aplica), os arquivos estáticos do
    // Next e de /public (imagens e ícones) e, como recomenda o guia de CSP
    // do Next, os prefetches do <Link>.
    {
      source:
        "/((?!api/|_next/static|_next/image|favicon\.ico|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
