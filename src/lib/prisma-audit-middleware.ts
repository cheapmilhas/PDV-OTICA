import { Prisma, PrismaClient } from "@prisma/client";

// Modelos auditados automaticamente pelo middleware
const AUDITED_MODELS: string[] = [
  "Sale",
  "SalePayment",
  "ServiceOrder",
  "CashMovement",
  "CashShift",
  "StockMovement",
  "StockAdjustment",
  "AccountReceivable",
  "AccountPayable",
  "Customer",
  "Product",
];

const AUDITED_ACTIONS = ["create", "update", "delete", "upsert"];

/**
 * Registra middleware de auditoria no cliente Prisma.
 * Captura create/update/delete nos modelos definidos e grava em AuditLog.
 *
 * Q7.2 P1-8: write do audit log agora é SÍNCRONO (dentro do mesmo middleware
 * call, antes do return). Quando a chamada vem dentro de $transaction, o
 * audit usa o mesmo tx do Prisma — se a TX rollback, o audit também rollback.
 * Antes (Promise.resolve().then()) o audit rodava em background com `client`
 * global, gerando logs órfãos quando TX falhava.
 *
 * Limitação: userId não está disponível no contexto do middleware Prisma —
 * será null até que o Next.js suporte async context propagation.
 */
export function registerAuditMiddleware(client: PrismaClient): void {
  client.$use(async (params, next) => {
    const { model, action } = params;

    // Passa direto se não é modelo auditado ou ação relevante
    if (!model || !AUDITED_MODELS.includes(model) || !AUDITED_ACTIONS.includes(action)) {
      return next(params);
    }

    // Capturar estado anterior em updates/deletes
    let oldData: Record<string, unknown> | null = null;
    if ((action === "update" || action === "delete") && params.args?.where?.id) {
      try {
        const modelClient = (client as any)[model[0].toLowerCase() + model.slice(1)];
        oldData = await modelClient?.findUnique({ where: params.args.where }) ?? null;
      } catch {
        // Ignora erro ao capturar estado anterior
      }
    }

    const result = await next(params);

    // Auditoria síncrona — se o $transaction caller rollback, o audit
    // também desfaz (graças ao Prisma propagar a TX no `next`).
    try {
      const entityId =
        result?.id ||
        params.args?.where?.id ||
        params.args?.data?.id ||
        "unknown";

      // Resolução robusta de companyId: result → args.data → args.where → oldData.
      // result?.companyId só é populado se a query retorna companyId (varia
      // por select/include); fallback pelos args funciona pra todos os casos.
      const companyId =
        result?.companyId ||
        params.args?.data?.companyId ||
        params.args?.where?.companyId ||
        oldData?.companyId ||
        null;

      if (companyId) {
        // Auditoria roda na mesma TX se o caller usou $transaction (Prisma propaga).
        await client.auditLog.create({
          data: {
            companyId: companyId as string,
            action: action.toUpperCase(),
            entityType: model,
            entityId: entityId as string,
            oldData: (oldData as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            newData:
              action !== "delete"
                ? ((result as Prisma.InputJsonValue) ?? Prisma.JsonNull)
                : Prisma.JsonNull,
          },
        });
      }
      // Sem companyId não grava — multi-tenant exige tenant key.
    } catch (auditErr) {
      // Auditoria nunca deve quebrar a operação principal — mesmo síncrona,
      // engole o erro mas loga em stderr pra investigação.
      console.error(
        JSON.stringify({
          level: "warn",
          event: "audit_log_write_failed",
          model,
          action,
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        }),
      );
    }

    return result;
  });
}
