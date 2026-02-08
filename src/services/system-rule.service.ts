import { prisma } from "@/lib/prisma";
import { RuleCategory } from "@prisma/client";
import type { UpsertSystemRuleDTO, SystemRuleQuery } from "@/lib/validations/system-rule.schema";
import { getDefaultRules } from "@/lib/validations/system-rule.schema";

export class SystemRuleService {
  /**
   * Cria ou atualiza uma regra do sistema
   */
  async upsert(
    data: UpsertSystemRuleDTO,
    companyId: string
  ) {
    const rule = await prisma.systemRule.upsert({
      where: {
        companyId_key: {
          companyId,
          key: data.key,
        },
      },
      create: {
        companyId,
        category: data.category,
        key: data.key,
        value: data.value,
        description: data.description,
        active: data.active ?? true,
      },
      update: {
        value: data.value,
        description: data.description,
        active: data.active,
      },
    });

    return rule;
  }

  /**
   * Busca o valor de uma regra específica
   * Retorna o valor padrão se a regra não existir
   */
  async get(key: string, companyId: string): Promise<any> {
    const rule = await prisma.systemRule.findUnique({
      where: {
        companyId_key: {
          companyId,
          key,
        },
      },
    });

    if (rule && rule.active) {
      return rule.value;
    }

    // Se não encontrou, retorna valor padrão
    return this.getDefaultValue(key);
  }

  /**
   * Busca todas as regras de uma categoria
   */
  async getByCategory(category: RuleCategory, companyId: string) {
    const rules = await prisma.systemRule.findMany({
      where: {
        companyId,
        category,
        active: true,
      },
      orderBy: {
        key: "asc",
      },
    });

    return rules;
  }

  /**
   * Lista regras com filtros
   */
  async list(query: SystemRuleQuery, companyId: string) {
    const { category, active, search } = query;

    const rules = await prisma.systemRule.findMany({
      where: {
        companyId,
        ...(category && { category }),
        ...(active !== undefined && { active }),
        ...(search && {
          OR: [
            { key: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    return rules;
  }

  /**
   * Deleta uma regra
   */
  async delete(key: string, companyId: string) {
    await prisma.systemRule.delete({
      where: {
        companyId_key: {
          companyId,
          key,
        },
      },
    });
  }

  /**
   * Busca todas as regras de estoque
   */
  async getStockRules(companyId: string) {
    return this.getByCategory(RuleCategory.STOCK, companyId);
  }

  /**
   * Busca todas as regras de vendas
   */
  async getSalesRules(companyId: string) {
    return this.getByCategory(RuleCategory.SALES, companyId);
  }

  /**
   * Busca todas as regras financeiras
   */
  async getFinancialRules(companyId: string) {
    return this.getByCategory(RuleCategory.FINANCIAL, companyId);
  }

  /**
   * Busca todas as regras de produtos
   */
  async getProductRules(companyId: string) {
    return this.getByCategory(RuleCategory.PRODUCTS, companyId);
  }

  /**
   * Busca todas as regras de clientes
   */
  async getCustomerRules(companyId: string) {
    return this.getByCategory(RuleCategory.CUSTOMERS, companyId);
  }

  /**
   * Busca todas as regras de relatórios
   */
  async getReportRules(companyId: string) {
    return this.getByCategory(RuleCategory.REPORTS, companyId);
  }

  /**
   * Popula regras padrão para uma empresa
   */
  async seedDefaultRules(companyId: string) {
    const defaults = getDefaultRules();
    const created: any[] = [];

    for (const [categoryKey, rules] of Object.entries(defaults)) {
      const category = categoryKey as RuleCategory;

      for (const rule of rules) {
        const existing = await prisma.systemRule.findUnique({
          where: {
            companyId_key: {
              companyId,
              key: rule.key,
            },
          },
        });

        // Só cria se não existir
        if (!existing) {
          const newRule = await prisma.systemRule.create({
            data: {
              companyId,
              category,
              key: rule.key,
              value: rule.value,
              description: rule.description,
              active: true,
            },
          });

          created.push(newRule);
        }
      }
    }

    return created;
  }

  /**
   * Restaura regras padrão (sobrescreve valores existentes)
   */
  async restoreDefaults(companyId: string, category?: RuleCategory) {
    const defaults = getDefaultRules();
    const restored: any[] = [];

    const categoriesToRestore = category
      ? [category]
      : Object.keys(defaults);

    for (const categoryKey of categoriesToRestore) {
      const cat = categoryKey as RuleCategory;
      const rules = defaults[cat];

      if (!rules) continue;

      for (const rule of rules) {
        const updated = await this.upsert(
          {
            category: cat,
            key: rule.key,
            value: rule.value,
            description: rule.description,
            active: true,
          },
          companyId
        );

        restored.push(updated);
      }
    }

    return restored;
  }

  /**
   * Busca valor padrão de uma regra
   */
  private getDefaultValue(key: string): any {
    const defaults = getDefaultRules();

    for (const rules of Object.values(defaults)) {
      const rule = rules.find((r) => r.key === key);
      if (rule) {
        return rule.value;
      }
    }

    return null;
  }

  /**
   * Valida se um usuário pode executar uma ação baseado nas regras
   */
  async canUserPerformAction(
    action: string,
    userRole: string,
    companyId: string
  ): Promise<boolean> {
    // Exemplos de validações baseadas em regras:

    // Pode aplicar desconto?
    if (action.startsWith("apply_discount_")) {
      const discountPercent = parseFloat(action.split("_")[2]);
      const maxDiscountKey = `sales.discount.max_${userRole.toLowerCase()}`;
      const maxDiscount = await this.get(maxDiscountKey, companyId);

      return discountPercent <= (maxDiscount || 0);
    }

    // Pode exportar relatórios?
    if (action === "export_report") {
      if (userRole === "ADMIN" || userRole === "MANAGER") {
        return true;
      }

      const allowExportSeller = await this.get(
        "reports.allow_export_seller",
        companyId
      );
      return allowExportSeller || false;
    }

    // Pode ver relatórios financeiros?
    if (action === "view_financial_report") {
      if (userRole === "ADMIN" || userRole === "MANAGER") {
        return true;
      }

      const allowFinancialSeller = await this.get(
        "reports.allow_financial_seller",
        companyId
      );
      return allowFinancialSeller || false;
    }

    return false;
  }
}
