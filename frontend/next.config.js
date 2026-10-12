/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera um build "standalone" (server.js autocontido) - essencial para
  // a imagem Docker final ficar pequena e não depender de node_modules completo.
  output: "standalone",
  reactStrictMode: true,
  // Não anuncia "X-Powered-By: Next.js" (informação gratuita para quem
  // procura alvos por versão de framework).
  poweredByHeader: false,
  async headers() {
    // Headers de segurança fixos, iguais em toda resposta. A
    // Content-Security-Policy NÃO fica aqui: ela leva um nonce novo a cada
    // requisição e por isso é montada em proxy.ts. O HSTS continua no Nginx
    // do host (ver DEPLOY-HOSTINGER.md), porque depende de o HTTPS já estar
    // funcionando.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // `same-origin` (e não strict-origin-when-cross-origin): é o valor
          // que outra camada à frente do Next (proxy/hospedagem) já injeta.
          // Com valores diferentes a resposta saía com dois Referrer-Policy
          // conflitantes e cada navegador resolvia de um jeito. O site não
          // depende de Referer para links externos.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Isola o contexto de navegação (sem janelas cruzadas com outras origens).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // O matcher de proxy.ts deixa /api/* de fora (a CSP com nonce é de
        // documento). Sem isto, o 404 HTML que o Next devolve para uma rota
        // /api/* inexistente saía sem nenhuma CSP. É a mesma política que o
        // Flask aplica às respostas JSON: nada carrega, nada embute.
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
