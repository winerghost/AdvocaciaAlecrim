import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_MFA_COOKIE_MAX_AGE,
  ADMIN_MFA_COOKIE_NAME,
} from "@/lib/adminConstants";

// Atributos comuns dos cookies de autenticação do painel. `secure` usa a
// MESMA condição que decide o prefixo `__Host-` em lib/adminConstants.ts.
function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Seta o cookie de sessão do painel a partir da resposta de sucesso do Flask
 * (`{token, expires_in}`). Usado pelo login e pelo 2º passo do MFA para os dois
 * caminhos produzirem exatamente o mesmo cookie. Devolve false se a resposta
 * não trouxer token.
 */
export async function setAdminSessionCookie(data: unknown): Promise<boolean> {
  const payload = (data ?? {}) as { token?: unknown; expires_in?: unknown };
  const token = typeof payload.token === "string" ? payload.token : null;
  if (!token) return false;

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 14400;

  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: expiresIn,
  });
  return true;
}

export async function setAdminMfaCookie(mfaToken: string, expiresIn: unknown): Promise<void> {
  const maxAge =
    typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : ADMIN_MFA_COOKIE_MAX_AGE;

  const store = await cookies();
  store.set(ADMIN_MFA_COOKIE_NAME, mfaToken, {
    ...baseCookieOptions(),
    maxAge,
  });
}

export async function getAdminMfaToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_MFA_COOKIE_NAME)?.value || null;
}

/**
 * Apaga um cookie de autenticação. Reenvia os mesmos atributos (inclusive
 * `Secure`): em produção o nome leva `__Host-`, e o navegador ignora um
 * Set-Cookie com esse prefixo que não seja Secure - inclusive o de remoção.
 */
async function clearCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, "", {
    ...baseCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export function clearAdminMfaCookie(): Promise<void> {
  return clearCookie(ADMIN_MFA_COOKIE_NAME);
}

export function clearAdminSessionCookie(): Promise<void> {
  return clearCookie(ADMIN_COOKIE_NAME);
}

// Nome do cookie de sessão antes do prefixo `__Host-`. Depois do deploy ele
// pode sobrar no navegador (morto, mas inútil e confuso); o logout o remove.
// Em desenvolvimento o nome já é este e o clearAdminSessionCookie cobre.
const LEGACY_ADMIN_COOKIE_NAME = "admin_session";

export async function clearLegacyAdminSessionCookie(): Promise<void> {
  if (ADMIN_COOKIE_NAME === LEGACY_ADMIN_COOKIE_NAME) return;
  await clearCookie(LEGACY_ADMIN_COOKIE_NAME);
}
