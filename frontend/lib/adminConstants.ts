// Nome do cookie de sessão do painel admin. Fica num módulo próprio, sem
// nenhum import de next/headers, porque proxy.ts (o antigo middleware.ts,
// que roda fora da renderização) e lib/adminProxy.ts (usa next/headers)
// precisam ler o mesmo nome sem o proxy puxar código server-only.
export const ADMIN_COOKIE_NAME = "admin_session";

// Tamanho mínimo da senha de admin. Só adianta o erro no formulário: quem
// decide é o Flask, que além do tamanho recusa senhas triviais/comuns e
// iguais ao e-mail (erro `weak_password`). Manter igual ao backend.
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

export const WEAK_PASSWORD_MESSAGE = `A senha precisa ter pelo menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres e não pode ser trivial, comum nem igual ao e-mail.`;
