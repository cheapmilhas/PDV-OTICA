import { PrismaClient, Prisma } from "@prisma/client";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

interface ChartAccountSeed {
  code: string;
  name: string;
  kind: "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE" | "EQUITY";
  parentCode?: string;
}

const CHART_OF_ACCOUNTS_SEED: ChartAccountSeed[] = [
  // 1. Ativo
  { code: "1", name: "Ativo", kind: "ASSET" },
  { code: "1.1", name: "Ativo Circulante", kind: "ASSET", parentCode: "1" },
  { code: "1.1.01", name: "Caixa", kind: "ASSET", parentCode: "1.1" },
  { code: "1.1.02", name: "Bancos", kind: "ASSET", parentCode: "1.1" },
  { code: "1.1.03", name: "Contas a Receber", kind: "ASSET", parentCode: "1.1" },
  { code: "1.1.04", name: "Estoque", kind: "ASSET", parentCode: "1.1" },
  { code: "1.1.05", name: "Adquirente Cartão", kind: "ASSET", parentCode: "1.1" },

  // 2. Passivo
  { code: "2", name: "Passivo", kind: "LIABILITY" },
  { code: "2.1", name: "Passivo Circulante", kind: "LIABILITY", parentCode: "2" },
  { code: "2.1.01", name: "Contas a Pagar", kind: "LIABILITY", parentCode: "2.1" },
  { code: "2.1.02", name: "Comissões a Pagar", kind: "LIABILITY", parentCode: "2.1" },

  // 3. Receitas
  { code: "3", name: "Receitas", kind: "REVENUE" },
  { code: "3.1", name: "Receita Operacional", kind: "REVENUE", parentCode: "3" },
  { code: "3.1.01", name: "Receita de Vendas", kind: "REVENUE", parentCode: "3.1" },
  { code: "3.1.02", name: "Receita de Serviços", kind: "REVENUE", parentCode: "3.1" },
  { code: "3.2", name: "Deduções de Receita", kind: "REVENUE", parentCode: "3" },
  { code: "3.2.01", name: "Devoluções e Estornos", kind: "REVENUE", parentCode: "3.2" },
  { code: "3.2.02", name: "Descontos Concedidos", kind: "REVENUE", parentCode: "3.2" },

  // 4. Custos
  { code: "4", name: "Custos", kind: "EXPENSE" },
  { code: "4.1", name: "CMV", kind: "EXPENSE", parentCode: "4" },
  { code: "4.1.01", name: "CMV - Armações", kind: "EXPENSE", parentCode: "4.1" },
  { code: "4.1.02", name: "CMV - Lentes", kind: "EXPENSE", parentCode: "4.1" },
  { code: "4.1.03", name: "CMV - Acessórios", kind: "EXPENSE", parentCode: "4.1" },
  { code: "4.1.04", name: "CMV - Outros", kind: "EXPENSE", parentCode: "4.1" },

  // 5. Despesas
  { code: "5", name: "Despesas", kind: "EXPENSE" },
  { code: "5.1", name: "Despesas Operacionais", kind: "EXPENSE", parentCode: "5" },
  { code: "5.1.01", name: "Taxas de Cartão", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.02", name: "Comissões de Vendedores", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.03", name: "Aluguel", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.04", name: "Energia", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.05", name: "Telefone/Internet", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.06", name: "Material de Escritório", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.07", name: "Marketing", kind: "EXPENSE", parentCode: "5.1" },
  { code: "5.1.08", name: "Outras Despesas", kind: "EXPENSE", parentCode: "5.1" },
];

interface FinanceAccountSeed {
  name: string;
  type: "CASH" | "BANK" | "PIX" | "CARD_ACQUIRER" | "OTHER";
  isDefault: boolean;
}

const FINANCE_ACCOUNTS_SEED: FinanceAccountSeed[] = [
  { name: "Caixa", type: "CASH", isDefault: true },
  { name: "PIX", type: "PIX", isDefault: false },
  { name: "Conta Bancária", type: "BANK", isDefault: false },
  { name: "Adquirente Cartão", type: "CARD_ACQUIRER", isDefault: false },
];

/**
 * Configura o módulo financeiro para uma empresa.
 * IDEMPOTENTE — usa upsert, seguro para rodar múltiplas vezes.
 */
export async function setupCompanyFinance(
  tx: TransactionClient,
  companyId: string,
  branchId?: string
): Promise<void> {
  // 1. Criar plano de contas (ordem importa — pais antes de filhos)
  const accountIdMap = new Map<string, string>();

  for (const account of CHART_OF_ACCOUNTS_SEED) {
    const parentId = account.parentCode
      ? accountIdMap.get(account.parentCode) ?? null
      : null;

    const upserted = await tx.chartOfAccounts.upsert({
      where: {
        companyId_code: { companyId, code: account.code },
      },
      update: {
        name: account.name,
        kind: account.kind,
        parentId,
      },
      create: {
        companyId,
        code: account.code,
        name: account.name,
        kind: account.kind,
        parentId,
        isSystem: true,
      },
    });

    accountIdMap.set(account.code, upserted.id);
  }

  // 2. Criar contas financeiras
  for (const fa of FINANCE_ACCOUNTS_SEED) {
    await tx.financeAccount.upsert({
      where: {
        companyId_name: { companyId, name: fa.name },
      },
      update: {
        type: fa.type,
        isDefault: fa.isDefault,
      },
      create: {
        companyId,
        branchId: branchId ?? undefined,
        name: fa.name,
        type: fa.type,
        isDefault: fa.isDefault,
        balance: 0,
      },
    });
  }
}
