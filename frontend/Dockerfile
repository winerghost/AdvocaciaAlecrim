# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Registro do npm trocável só no build, para redes que interceptam o TLS do
# npmjs (o package-lock.json continua valendo: URLs e hashes são conferidos):
#   docker compose build --build-arg NPM_CONFIG_REGISTRY=https://registry.yarnpkg.com frontend
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
# O `test` existe porque o npm, com a rede falhando, às vezes termina com
# código 0 sem instalar nada ("Exit handler never called!") - e o erro só
# aparecia depois, como "next: not found" no build.
RUN npm ci && test -x node_modules/.bin/next

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Precisa estar disponível em build-time porque vira código do bundle client.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000 || exit 1

CMD ["node", "server.js"]
