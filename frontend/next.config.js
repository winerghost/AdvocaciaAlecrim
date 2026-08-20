/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera um build "standalone" (server.js autocontido) - essencial para
  // a imagem Docker final ficar pequena e não depender de node_modules completo.
  output: "standalone",
  reactStrictMode: true,
};

module.exports = nextConfig;
