/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera um build "standalone" (server.js autocontido) - essencial para
  // a imagem Docker final ficar pequena e não depender de node_modules completo.
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    // Headers de segurança que não têm risco de quebrar o app (não mexem
    // em CSP/HSTS - isso fica no Nginx do host, ver DEPLOY-HOSTINGER.md,
    // porque depende de HTTPS já estar funcionando e precisa ser calibrado
    // junto com o que a página realmente carrega).
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
