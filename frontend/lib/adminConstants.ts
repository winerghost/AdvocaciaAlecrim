// Nome do cookie de sessão do painel admin. Fica num módulo próprio, sem
// nenhum import de next/headers, porque middleware.ts (edge runtime) e
// lib/adminProxy.ts (Node runtime, usa next/headers) precisam ler o mesmo
// nome sem middleware puxar código server-only que não roda no edge.
export const ADMIN_COOKIE_NAME = "admin_session";
