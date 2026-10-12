/**
 * Defesa em profundidade contra CSRF nas rotas /api/admin/**.
 *
 * A defesa principal é o cookie `SameSite=Strict`. Aqui entra uma segunda
 * camada que não depende dele: o navegador manda `Sec-Fetch-Site` em toda
 * requisição, e esse header não pode ser forjado nem alterado por JavaScript
 * de página. Requisição que muda estado e NÃO veio do próprio site
 * (`same-origin`) ou de uma ação direta do usuário (`none`, ex. digitar a URL)
 * é recusada.
 *
 * Por que não comparar `Origin` com `Host`: atrás de Cloudflare + Nginx o
 * `Host` que o Next enxerga depende de como o proxy foi configurado, e um erro
 * ali derrubaria todo o painel. `Sec-Fetch-Site` não tem essa dependência.
 *
 * Cliente sem o header (navegador muito antigo, curl, outro servidor) passa:
 * sem navegador não há cookie de sessão alheio para abusar, e o
 * `SameSite=Strict` continua valendo para os antigos.
 */
export function isCrossSiteRequest(headers: Pick<Headers, "get">): boolean {
  const site = headers.get("sec-fetch-site");
  if (site === null) return false;
  return site !== "same-origin" && site !== "none";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingMethod(method: string | undefined): boolean {
  return !SAFE_METHODS.has((method ?? "GET").toUpperCase());
}
