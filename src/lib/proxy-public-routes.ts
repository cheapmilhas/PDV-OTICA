/**
 * Rotas que o middleware (`src/proxy.ts`) deixa passar SEM cookie de sessão.
 *
 * Existe como módulo separado porque a lista já foi causa de dois incidentes
 * iguais: uma rota do canal interno Domus→Vis foi criada, o bypass não foi
 * adicionado junto, e o middleware passou a devolver 401 ANTES do handler. Como
 * o Domus engole o erro de propósito (não pode revelar se uma conta existe), a
 * falha era silenciosa dos dois lados. Aqui a regra fica isolada e coberta por
 * teste — ver `src/lib/__tests__/proxy-public-routes.test.ts`.
 */

/** Páginas públicas do site (match exato, não prefixo). */
export const PUBLIC_PAGES = [
  "/",
  "/precos",
  "/contato",
  "/sobre",
  "/login",
  "/force-logout",
  "/impersonate",
  "/registro",
  "/termos",
  "/privacidade",
] as const;

/**
 * Bases de API com autenticação PRÓPRIA (HMAC, Bearer, token de provedor),
 * que por isso não passam pelo cookie de sessão.
 *
 * Escopo ESTREITO de propósito: cada canal entra pelo seu subtree exato, nunca
 * `/api/internal/*` amplo — uma rota interna futura sem auth própria não deve
 * herdar o bypass por acidente.
 *
 * O casamento respeita FRONTEIRA DE SEGMENTO: `/api/auth` libera `/api/auth` e
 * `/api/auth/...`, mas NÃO `/api/authXYZ`. Com `startsWith` cru, uma rota nova
 * cujo nome apenas começasse igual a uma destas herdaria o bypass em silêncio
 * — precisamente o tipo de erro que este módulo existe para impedir.
 */
export const SELF_AUTHENTICATED_API_PREFIXES = [
  // better-auth
  "/api/auth",
  "/api/public",
  // Webhooks (Asaas/Focus) validam HMAC/token do provedor.
  "/api/webhooks",
  // Crons validam CRON_SECRET no header Bearer.
  "/api/cron",
  // Canal Vis↔Domus — Bearer VIS_DOMUS_WEBHOOK_SECRET (timing-safe).
  "/api/internal/domus/entitlements",
  // Canais Domus→Vis — HMAC DOMUS_VIS_API_SECRET (`verifyVisDomus`).
  "/api/internal/domus/plan-change",
  "/api/internal/domus/send-reset-email",
] as const;

/** True quando o middleware deve liberar o caminho sem exigir sessão. */
export function isPublicPath(pathname: string): boolean {
  return (
    (PUBLIC_PAGES as readonly string[]).includes(pathname) ||
    SELF_AUTHENTICATED_API_PREFIXES.some(
      (base) => pathname === base || pathname.startsWith(`${base}/`),
    )
  );
}
