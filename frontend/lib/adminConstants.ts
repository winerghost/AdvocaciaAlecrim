// Nome do cookie de sessão do painel admin. Fica num módulo próprio, sem
// nenhum import de next/headers, porque proxy.ts (o antigo middleware.ts,
// que roda fora da renderização) e lib/adminProxy.ts (usa next/headers)
// precisam ler o mesmo nome sem o proxy puxar código server-only.
//
// Em produção leva o prefixo `__Host-`: o navegador só aceita esse cookie se
// ele for `Secure`, `Path=/` e SEM `Domain` - então um subdomínio comprometido
// não consegue sobrescrevê-lo. A condição é a MESMA que liga `secure` em
// app/api/admin/login/route.ts, para nome e atributo nunca divergirem (o
// prefixo sem Secure faria o navegador descartar o cookie e quebrar o login).
// Em desenvolvimento (http://localhost) segue o nome simples.
export const ADMIN_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";

// Cookie curto do 2º passo do login (MFA). Guarda o `mfa_token` que o Flask
// devolve depois de validar e-mail/senha: ele nunca chega ao JavaScript do
// navegador, só viaja neste cookie httpOnly até app/api/admin/login/mfa. Mesma
// regra de prefixo `__Host-` do cookie de sessão acima (mesma condição de
// NODE_ENV usada em `secure`).
export const ADMIN_MFA_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-admin_mfa" : "admin_mfa";

// Validade padrão do cookie do 2º passo, em segundos (igual ao `expires_in`
// do mfa_token no Flask). O valor devolvido pelo Flask tem precedência.
export const ADMIN_MFA_COOKIE_MAX_AGE = 300;

// Tamanho mínimo da senha de admin. Só adianta o erro no formulário: quem
// decide é o Flask, que além do tamanho recusa senhas triviais/comuns e
// iguais ao e-mail (erro `weak_password`). Manter igual ao backend.
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

export const WEAK_PASSWORD_MESSAGE = `A senha precisa ter pelo menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres e não pode ser trivial, comum nem igual ao e-mail.`;
