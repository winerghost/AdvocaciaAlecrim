import { isIP } from "node:net";

// IP do visitante a repassar para o Flask, que usa esse valor como chave dos
// rate limits (login, formulário de contato etc.).
//
// PREMISSA: o Next só é alcançado através do proxy reverso do host (Nginx,
// ver DEPLOY-HOSTINGER.md), e esse proxy ACRESCENTA o IP real da conexão no
// FIM do X-Forwarded-For (`$proxy_add_x_forwarded_for`). Tudo o que vem antes
// do último elemento foi enviado pelo próprio cliente e não é confiável: se o
// header fosse repassado inteiro, bastaria ao atacante trocar o valor a cada
// requisição para renovar a cota de tentativas. Por isso só o último elemento
// é usado, e o Flask recebe um único IP, nunca a lista.
//
// Sem X-Forwarded-For, cai para o X-Real-IP (que o mesmo Nginx define). Se o
// valor não for um IPv4/IPv6 sintaticamente válido, nada é repassado e o
// Flask aplica o limite ao IP do container do Next (limite compartilhado, o
// lado seguro do erro).
export function getClientIp(headers: Pick<Headers, "get">): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  const candidate = forwardedFor ? forwardedFor.split(",").pop() : headers.get("x-real-ip");

  const ip = candidate?.trim();
  return ip && isIP(ip) !== 0 ? ip : null;
}

/**
 * Header pronto para espalhar no `fetch` ao Flask: `{}` quando não há IP
 * válido. Aceita o `Request` do route handler ou o resultado de `headers()`.
 */
export function forwardedForHeader(source: Request | Pick<Headers, "get">): Record<string, string> {
  const ip = getClientIp(source instanceof Request ? source.headers : source);
  return ip ? { "X-Forwarded-For": ip } : {};
}
