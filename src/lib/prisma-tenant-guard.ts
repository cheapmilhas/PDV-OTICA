import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "./logger";

const log = logger.child({ module: "tenant-guard" });

/**
 * Guard de isolamento multi-tenant (Fase 1 do plano de prevenção de bugs).
 *
 * O isolamento por `companyId` é manual em ~145 rotas: cada query precisa de
 * `where: { companyId }`. Esquecer um = vazar dados de outro cliente do SaaS
 * (já aconteceu uma vez — bug E2 do CRM). Este guard observa toda query de
 * leitura/escrita em massa nos modelos que TÊM companyId e AVISA quando o
 * filtro está ausente.
 *
 * MODO ATUAL: **warn-only** (TENANT_GUARD_MODE != "throw"). Loga + Sentry,
 * NÃO bloqueia — para mapear os call-sites sem risco de quebrar produção.
 * Depois de validado, defina TENANT_GUARD_MODE=throw em dev/test para que uma
 * query sem companyId vire erro (fail-loud) e nunca chegue a produção.
 *
 * Segue o padrão $use legado já usado em prisma-audit-middleware.ts (Prisma 5).
 */

// Ações que operam sobre CONJUNTOS e precisam de filtro de tenant explícito.
// findUnique/create/delete/update por PK são seguros pela própria chave;
// upsert e *Many varrem por where e exigem companyId.
const SCOPED_ACTIONS = new Set<string>([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

// Modelos que TÊM companyId — derivados do schema em runtime (fonte única de
// verdade). Qualquer modelo novo com companyId entra automaticamente.
function buildScopedModels(): Set<string> {
  const scoped = new Set<string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.fields.some((f) => f.name === "companyId")) {
      scoped.add(model.name);
    }
  }
  return scoped;
}

const SCOPED_MODELS = buildScopedModels();

/**
 * Verifica recursivamente se o objeto `where` referencia companyId em algum
 * nível razoável: no topo, dentro de AND/OR/NOT, ou via relação aninhada.
 * Conservador: na dúvida, considera presente (evita falso-positivo barulhento).
 */
export function whereHasCompanyId(where: unknown, depth = 0): boolean {
  if (!where || typeof where !== "object" || depth > 4) return false;

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "companyId") return true;
    // Combinadores lógicos: AND/OR/NOT podem ser objeto ou array.
    if (key === "AND" || key === "OR" || key === "NOT") {
      const branches = Array.isArray(value) ? value : [value];
      if (branches.some((b) => whereHasCompanyId(b, depth + 1))) return true;
    }
    // Filtro por relação que carrega o tenant (ex.: company: { id }, sale: { companyId }).
    if (value && typeof value === "object" && whereHasCompanyId(value, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve o modo do guard. Em DESENVOLVIMENTO local o default é `throw`: uma
 * query sem companyId num model escopado estoura na hora, então o vazamento
 * aparece enquanto se usa o app (mapeamento ativo). Em produção o default é
 * `warn` (só loga, nunca derruba uma request legítima). TENANT_GUARD_MODE
 * explícito sempre vence o default — defina-o para forçar o modo num ambiente.
 */
export function resolveTenantGuardMode(
  explicitMode: string | undefined,
  nodeEnv: string | undefined
): "throw" | "warn" {
  if (explicitMode === "throw" || explicitMode === "warn") return explicitMode;
  return nodeEnv === "development" ? "throw" : "warn";
}

export function registerTenantGuard(client: PrismaClient): void {
  const mode = resolveTenantGuardMode(
    process.env.TENANT_GUARD_MODE,
    process.env.NODE_ENV
  );

  client.$use(async (params, next) => {
    const { model, action, args } = params;

    if (!model || !SCOPED_MODELS.has(model) || !SCOPED_ACTIONS.has(action)) {
      return next(params);
    }

    const where = (args as { where?: unknown } | undefined)?.where;
    const hasTenant = whereHasCompanyId(where);

    if (!hasTenant) {
      const detail = {
        model,
        action,
        // amostra das chaves do where (sem valores, p/ não logar PII)
        whereKeys: where && typeof where === "object" ? Object.keys(where) : [],
      };

      if (mode === "throw") {
        throw new Error(
          `[tenant-guard] Query sem companyId em ${model}.${action} — isolamento multi-tenant exige where.companyId.`
        );
      }

      // warn-only: registra para mapeamento, não bloqueia.
      // O log (Vercel) é sempre emitido — barato e suficiente para a varredura.
      log.warn("query sem companyId (multi-tenant)", detail);
      // O envio ao Sentry fica atrás de TENANT_GUARD_SENTRY=1 para não estourar
      // a quota na primeira varredura (espera-se MUITA ocorrência inicialmente).
      if (process.env.TENANT_GUARD_SENTRY === "1") {
        try {
          const { captureMessage } = await import("./sentry");
          captureMessage?.("tenant-guard: query sem companyId", { level: "warning", extra: detail });
        } catch {
          // sentry ausente/erro não pode quebrar a query
        }
      }
    }

    return next(params);
  });
}
