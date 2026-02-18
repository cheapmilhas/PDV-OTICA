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

    // Gravar log em background (não bloqueia a resposta)
    // Usa Promise.resolve().then() para compatibilidade com Edge Runtime
    Promise.resolve().then(async () => {
      try {
        const entityId =
          result?.id ||
          params.args?.where?.id ||
          params.args?.data?.id ||
          "unknown";

        const companyId =
          result?.companyId ||
          params.args?.data?.companyId ||
          oldData?.companyId ||
          null;

        if (!companyId) return; // Sem companyId não podemos gravar no AuditLog (multi-tenant)

        await client.auditLog.create({
          data: {
            companyId: companyId as string,
            action: action.toUpperCase(),
            entityType: model,
            entityId: entityId as string,
            oldData: oldData as Prisma.InputJsonValue ?? Prisma.JsonNull,
            newData: action !== "delete" ? (result as Prisma.InputJsonValue ?? Prisma.JsonNull) : Prisma.JsonNull,
          },
        });
      } catch {
        // Auditoria nunca deve quebrar a operação principal
      }
    });

    return result;
  });
}
