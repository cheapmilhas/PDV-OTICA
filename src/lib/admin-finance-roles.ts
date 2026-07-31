/**
 * Papéis de admin autorizados a LER o painel financeiro da operadora.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 * Até 2026-07-31 todas as telas de `/admin/(painel)/financeiro/` chamavam
 * `requireAdmin()` puro — que só confere que EXISTE sessão, nunca o papel
 * (ver `admin-session.ts`). Como `AdminUser.role` tem `@default(SUPPORT)`
 * (schema.prisma), qualquer conta criada sem escolher papel explicitamente
 * nascia SUPPORT e lia a receita consolidada, os nomes dos clientes e a
 * posição financeira inteira da operadora. Nem o layout `(painel)`, nem a
 * sidebar, nem `src/proxy.ts` faziam essa checagem — a página era o único
 * ponto possível.
 *
 * ─── Por que estes papéis ───────────────────────────────────────────────────
 * - `SUPER_ADMIN`: dono da operadora. É o papel semeado para
 *   `admin@pdvotica.com.br` tanto em `prisma/seed-plans.ts` quanto em
 *   `POST /api/admin/seed`, ou seja, a conta real do dono. Barrá-lo seria o
 *   pior desfecho possível desta correção.
 * - `ADMIN`: já é tratado como par do SUPER_ADMIN em TODAS as rotas de escrita
 *   financeira que hoje checam papel (`export/faturas`, `billing/reconcile`,
 *   `invoices/[id]/resend-charge`) e em `requireCompanyScope`. Tirá-lo da
 *   LEITURA deixaria o sistema incoerente: um ADMIN poderia reenviar cobrança
 *   e exportar faturas em CSV, mas não abrir a tela que lista as mesmas
 *   faturas. Incluído também como margem de segurança contra trancar o dono
 *   fora caso a conta dele no banco não seja SUPER_ADMIN.
 * - `BILLING`: o enum `AdminRole` tem este valor e ele não é usado em lugar
 *   nenhum do código hoje. Existe exatamente para esta função; se o financeiro
 *   não é o escopo do BILLING, nada é.
 *
 * ─── Por que SUPPORT fica de fora ───────────────────────────────────────────
 * SUPPORT é o papel DEFAULT do schema — é o que uma conta nova ganha de graça.
 * É precisamente o buraco que esta correção fecha. `requireSupportScope` existe
 * para dar ao suporte acesso operacional a UMA empresa; isso não é o mesmo que
 * ler a posição financeira consolidada da operadora inteira.
 *
 * ─── Escopo ≠ papel ─────────────────────────────────────────────────────────
 * `AdminUser.scopeAllCompanies` tem `@default(true)`, então o escopo NÃO barra
 * ninguém por padrão. O papel é a única barreira real aqui — por isso o teste
 * em `admin-finance-roles.test.ts` prova que SUPPORT é barrado MESMO com
 * `scopeAllCompanies: true`, senão o teste passaria por vacuidade.
 *
 * Constante única de propósito: repetir o array em cada arquivo é como as duas
 * convenções divergentes surgiram nas rotas de API (algumas checam papel
 * inline, outras vão direto ao `requireCompanyScope` sem checar papel).
 */
export const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN", "BILLING"] as const;

export type FinanceRole = (typeof FINANCE_ROLES)[number];

/** `true` se o papel pode ler/operar o financeiro da operadora. */
export function isFinanceRole(role: string | null | undefined): boolean {
  return FINANCE_ROLES.includes(role as FinanceRole);
}
