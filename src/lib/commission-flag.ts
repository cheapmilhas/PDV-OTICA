/**
 * Kill-switch do motor de comissão — Comissão Fase 2. Agora POR ÓTICA.
 *
 * Duas envs decidem qual cálculo de comissão vale para uma dada ótica (companyId):
 *
 *   - `COMMISSION_ENGINE_NEW_COMPANIES` → lista de companyId separados por vírgula.
 *     Se o companyId da requisição está na lista → regra NOVA ("new").
 *     (Ex.: "comp_abc123,comp_def456". Espaços ao redor são ignorados; itens
 *      vazios/lixo são descartados — nunca ligam "new" sozinhos.)
 *
 *   - `COMMISSION_ENGINE` → kill-switch GLOBAL, usado como fallback quando o
 *     companyId NÃO está na lista. SÓ "new" exato liga a regra nova globalmente;
 *     qualquer outro valor (ausente, "", "newx", inválido) → "legacy".
 *
 * Resolução para um companyId:
 *   1. companyId ausente/indefinido            → "legacy" (NUNCA "new").
 *   2. companyId na lista NEW_COMPANIES        → "new".
 *   3. caso contrário                          → cai no global COMMISSION_ENGINE
 *                                                (que é "legacy" por default).
 *
 * FAIL-SAFE: sem nenhuma config (lista vazia + global ausente) → TODOS em
 * "legacy" (comportamento de hoje). A regra nova nunca liga sozinha por engano:
 * só companyId explícito na lista, ou o global setado em "new" de propósito.
 *
 * Espelha o padrão de flags por env do sistema. Lido SEMPRE no SERVIDOR (gravador
 * + rotas + telas server) e propagado à UI por valor já resolvido, NUNCA confiando
 * em valor vindo do client. Todos os consumidores passam o companyId — não existe
 * mais decisão "global sem dono".
 */

export type CommissionEngine = "new" | "legacy";

/**
 * Modo GLOBAL do kill-switch (fallback). FAIL-SAFE: só "new" exato; resto → "legacy".
 */
function getGlobalEngine(): CommissionEngine {
  return process.env.COMMISSION_ENGINE === "new" ? "new" : "legacy";
}

/**
 * Conjunto de companyIds explicitamente em "new", lido de
 * COMMISSION_ENGINE_NEW_COMPANIES. Itens vazios/só-espaço são descartados.
 */
function getNewCompanyIds(): Set<string> {
  const raw = process.env.COMMISSION_ENGINE_NEW_COMPANIES ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(ids);
}

/**
 * Modo efetivo do motor de comissão PARA UMA ÓTICA.
 *
 * @param companyId  ótica da requisição. Ausente/indefinido → "legacy" (fail-safe).
 */
export function getCommissionEngine(companyId?: string | null): CommissionEngine {
  // 1. Sem dono identificável: nunca arriscar "new".
  if (!companyId) return "legacy";

  // 2. Ótica explicitamente na lista → regra nova.
  if (getNewCompanyIds().has(companyId)) return "new";

  // 3. Fallback no kill-switch global (legacy por default).
  return getGlobalEngine();
}

/** true quando a regra nova está ativa PARA ESTA ÓTICA. */
export function isNewCommissionEngine(companyId?: string | null): boolean {
  return getCommissionEngine(companyId) === "new";
}

/** true quando o modo legado (cálculo antigo) vale PARA ESTA ÓTICA. */
export function isLegacyCommissionEngine(companyId?: string | null): boolean {
  return getCommissionEngine(companyId) === "legacy";
}
