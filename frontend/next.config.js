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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
