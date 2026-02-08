import { z } from "zod";
import { RuleCategory } from "@prisma/client";

/**
 * Schema para criação/atualização de regra do sistema
 */
export const upsertSystemRuleSchema = z.object({
  category: z.nativeEnum(RuleCategory, {
    message: "Categoria de regra inválida",
  }),

  key: z
    .string()
    .min(3, "Chave deve ter no mínimo 3 caracteres")
    .max(100, "Chave deve ter no máximo 100 caracteres")
    .regex(
      /^[a-z][a-z0-9._-]*$/,
      "Chave deve começar com letra minúscula e conter apenas letras, números, ponto, hífen e underscore"
    ),

  value: z.any(), // Pode ser qualquer tipo (number, boolean, string, array, object)

  description: z
    .string()
    .max(500, "Descrição deve ter no máximo 500 caracteres")
    .optional(),

  active: z.boolean().default(true),
});

/**
 * Schema para query params de listagem
 */
export const systemRuleQuerySchema = z.object({
  category: z.nativeEnum(RuleCategory).optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

/**
 * Type inference
 */
export type UpsertSystemRuleDTO = z.infer<typeof upsertSystemRuleSchema>;
export type SystemRuleQuery = z.infer<typeof systemRuleQuerySchema>;

/**
 * Helper para obter label em português da categoria
 */
export function getRuleCategoryLabel(category: RuleCategory): string {
  const labels: Record<RuleCategory, string> = {
    STOCK: "Estoque",
    SALES: "Vendas",
    FINANCIAL: "Financeiro",
    PRODUCTS: "Produtos",
    CUSTOMERS: "Clientes",
    REPORTS: "Relatórios",
  };

  return labels[category] || category;
}

/**
 * Helper para obter descrição da categoria
 */
export function getRuleCategoryDescription(category: RuleCategory): string {
  const descriptions: Record<RuleCategory, string> = {
    STOCK:
      "Regras de controle de estoque, ajustes, transferências e movimentações",
    SALES: "Regras de vendas, descontos, cancelamentos e formas de pagamento",
    FINANCIAL:
      "Regras de contas a pagar, receber, aprovações e alertas financeiros",
    PRODUCTS: "Regras de precificação, cadastro e validações de produtos",
    CUSTOMERS: "Regras de crédito, inadimplência e limites de clientes",
    REPORTS: "Regras de acesso e exportação de relatórios",
  };

  return descriptions[category] || "";
}

/**
 * Regras padrão do sistema por categoria
 */
export function getDefaultRules() {
  return {
    // ========== REGRAS DE ESTOQUE ==========
    STOCK: [
      {
        key: "stock.adjustment.approval_amount",
        value: 500,
        description:
          "Valor mínimo (R$) que requer aprovação para ajuste de estoque",
        type: "number",
      },
      {
        key: "stock.adjustment.require_photo_above",
        value: 1000,
        description:
          "Valor mínimo (R$) que exige foto anexada no ajuste de estoque",
        type: "number",
      },
      {
        key: "stock.adjustment.min_reason_length",
        value: 20,
        description:
          "Número mínimo de caracteres na justificativa de ajuste",
        type: "number",
      },
      {
        key: "stock.allow_negative_stock",
        value: false,
        description: "Permitir estoque negativo",
        type: "boolean",
      },
      {
        key: "stock.low_stock_alert_percent",
        value: 20,
        description:
          "Porcentagem do estoque mínimo para alertar (20% = alerta quando estoque está 20% abaixo do mínimo)",
        type: "number",
      },
      {
        key: "stock.block_sale_without_stock",
        value: true,
        description: "Bloquear venda de produto sem estoque",
        type: "boolean",
      },
      {
        key: "stock.transfer.approval_amount",
        value: 2000,
        description:
          "Valor mínimo (R$) que requer aprovação para transferência entre filiais",
        type: "number",
      },
    ],

    // ========== REGRAS DE VENDAS ==========
    SALES: [
      {
        key: "sales.discount.max_seller",
        value: 10,
        description: "Desconto máximo (%) que um VENDEDOR pode aplicar",
        type: "number",
      },
      {
        key: "sales.discount.max_manager",
        value: 30,
        description: "Desconto máximo (%) que um GERENTE pode aplicar",
        type: "number",
      },
      {
        key: "sales.discount.max_admin",
        value: 100,
        description: "Desconto máximo (%) que um ADMIN pode aplicar",
        type: "number",
      },
      {
        key: "sales.discount.approval_above",
        value: 15,
        description:
          "Desconto acima de X% requer aprovação (mesmo para gerente)",
        type: "number",
      },
      {
        key: "sales.cancel.max_days",
        value: 7,
        description: "Prazo máximo (dias) para cancelar uma venda",
        type: "number",
      },
      {
        key: "sales.cancel.approval_above",
        value: 500,
        description:
          "Valor mínimo (R$) de venda que requer aprovação para cancelar",
        type: "number",
      },
      {
        key: "sales.max_installments",
        value: 12,
        description: "Número máximo de parcelas permitido",
        type: "number",
      },
      {
        key: "sales.min_card_amount",
        value: 10,
        description: "Valor mínimo (R$) para aceitar pagamento em cartão",
        type: "number",
      },
    ],

    // ========== REGRAS FINANCEIRAS ==========
    FINANCIAL: [
      {
        key: "financial.payment.approval_amount",
        value: 5000,
        description:
          "Valor mínimo (R$) de conta a pagar que requer aprovação",
        type: "number",
      },
      {
        key: "financial.overdue.interest_percent",
        value: 2,
        description: "Juros mensal (%) para contas em atraso",
        type: "number",
      },
      {
        key: "financial.overdue.fine_percent",
        value: 10,
        description: "Multa (%) para contas em atraso",
        type: "number",
      },
      {
        key: "financial.alert_days_before_due",
        value: 3,
        description: "Alertar X dias antes do vencimento",
        type: "number",
      },
      {
        key: "financial.receivable.max_due_days",
        value: 90,
        description: "Prazo máximo (dias) de vencimento para contas a receber",
        type: "number",
      },
    ],

    // ========== REGRAS DE PRODUTOS ==========
    PRODUCTS: [
      {
        key: "products.min_margin_percent",
        value: 30,
        description: "Margem mínima (%) permitida ao cadastrar produto",
        type: "number",
      },
      {
        key: "products.alert_negative_margin",
        value: true,
        description: "Alertar ao tentar vender com margem negativa",
        type: "boolean",
      },
      {
        key: "products.block_negative_margin_sale",
        value: false,
        description: "Bloquear venda com margem negativa",
        type: "boolean",
      },
      {
        key: "products.require_ncm",
        value: false,
        description: "Tornar NCM obrigatório ao cadastrar produto",
        type: "boolean",
      },
      {
        key: "products.auto_calculate_margin",
        value: true,
        description: "Calcular margem automaticamente ao cadastrar produto",
        type: "boolean",
      },
    ],

    // ========== REGRAS DE CLIENTES ==========
    CUSTOMERS: [
      {
        key: "customers.default_credit_limit",
        value: 1000,
        description: "Limite de crédito padrão (R$) para novos clientes",
        type: "number",
      },
      {
        key: "customers.block_overdue_sales",
        value: true,
        description: "Bloquear vendas para clientes inadimplentes",
        type: "boolean",
      },
      {
        key: "customers.overdue_days_to_block",
        value: 15,
        description:
          "Dias de atraso para bloquear automaticamente o cliente",
        type: "number",
      },
    ],

    // ========== REGRAS DE RELATÓRIOS ==========
    REPORTS: [
      {
        key: "reports.allow_export_seller",
        value: false,
        description: "Permitir VENDEDOR exportar relatórios",
        type: "boolean",
      },
      {
        key: "reports.allow_financial_seller",
        value: false,
        description: "Permitir VENDEDOR ver relatórios financeiros",
        type: "boolean",
      },
      {
        key: "reports.log_access",
        value: true,
        description: "Registrar log de quem acessa relatórios sensíveis",
        type: "boolean",
      },
    ],
  };
}

/**
 * Helper para obter tipo de input apropriado para uma regra
 */
export function getRuleInputType(key: string): "number" | "boolean" | "text" {
  const defaults = getDefaultRules();
  for (const category of Object.values(defaults)) {
    const rule = category.find((r) => r.key === key);
    if (rule) {
      return rule.type as "number" | "boolean" | "text";
    }
  }
  return "text";
}

/**
 * Helper para validar valor de regra
 */
export function validateRuleValue(
  key: string,
  value: any
): { valid: boolean; error?: string } {
  const type = getRuleInputType(key);

  if (type === "number") {
    const num = Number(value);
    if (isNaN(num)) {
      return { valid: false, error: "Valor deve ser um número" };
    }
    if (num < 0) {
      return { valid: false, error: "Valor não pode ser negativo" };
    }
  }

  if (type === "boolean") {
    if (typeof value !== "boolean") {
      return { valid: false, error: "Valor deve ser verdadeiro ou falso" };
    }
  }

  return { valid: true };
}
