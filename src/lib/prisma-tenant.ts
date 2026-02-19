import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Tabelas que SEMPRE precisam de filtro por companyId
 * CRÍTICO: Adicione TODAS as tabelas operacionais aqui
 */
const TENANT_TABLES = [
  "sale",
  "product",
  "customer",
  "serviceorder",
  "user",
  "supportticket",
  "branch",
  "cashregister",
  "stockmovement",
  "stockadjustment",
  "companynote",
  "quote",
  "prescription",
  "agreement",
  "commission",
  "accountpayable",
  "accountreceivable",
  "cashshift",
  "appointment",
  "loyaltypoint",
  "warranty",
  "dreport",
  "auditlog",
];

/**
 * Cria um Prisma Client com isolamento multi-tenant automático
 * IMPORTANTE: Usa Prisma Client Extension para adicionar WHERE companyId
 * em TODAS as queries automaticamente
 */
export function createTenantPrismaClient(companyId: string, networkId?: string | null) {
  const prisma = new PrismaClient();

  return prisma.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        // Converte model para lowercase para comparação
        const modelLower = model?.toLowerCase() || "";

        // Verifica se é uma tabela que precisa de isolamento
        const isTenantTable = TENANT_TABLES.some((t) => modelLower.includes(t));

        if (!isTenantTable) {
          // Tabela não requer isolamento (ex: Plan, AdminUser, Network)
          return query(args);
        }

        // === OPERAÇÕES DE LEITURA ===
        if (["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"].includes(operation)) {
          args.where = {
            ...args.where,
            companyId,
          };
        }

        // === OPERAÇÕES DE ESCRITA (CREATE) ===
        if (operation === "create") {
          args.data = {
            ...args.data,
            companyId,
          };
        }

        if (operation === "createMany") {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, companyId }));
          } else {
            args.data = { ...args.data, companyId };
          }
        }

        // === OPERAÇÕES DE ATUALIZAÇÃO/DELEÇÃO ===
        if (["update", "updateMany", "delete", "deleteMany", "upsert"].includes(operation)) {
          args.where = {
            ...args.where,
            companyId,
          };
        }

        return query(args);
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantPrismaClient>;
