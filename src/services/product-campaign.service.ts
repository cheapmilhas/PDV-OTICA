import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateCampaignDTO {
  companyId: string;
  branchId?: string;
  scope: "SELLER" | "BRANCH" | "BOTH";
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  bonusType: "PER_UNIT" | "MINIMUM_FIXED" | "MINIMUM_PER_UNIT" | "PER_PACKAGE" | "TIERED";
  countMode: "BY_QUANTITY" | "BY_ITEM" | "BY_SALE";
  allowStacking?: boolean;
  priority?: number;

  // Campos específicos por tipo
  bonusPerUnit?: number;
  minimumUnits?: number;
  minimumCountMode?: "AFTER_MINIMUM" | "FROM_MINIMUM";
  bonusFixedOnMin?: number;
  bonusPerUnitAfter?: number;
  packageUnits?: number;
  bonusPerPackage?: number;
  tiers?: Prisma.InputJsonValue;

  // Itens da campanha
  items: {
    productId?: string;
    categoryId?: string;
    brandId?: string;
    supplierId?: string;
  }[];

  createdById: string;
}

export interface BonusCalculationResult {
  bonusAmount: number;
  eligibleQuantity: number;
  appliedTier?: number;
  details: string;
}

export interface CampaignFilter {
  companyId: string;
  branchId?: string;
  status?: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELED";
  scope?: "SELLER" | "BRANCH" | "BOTH";
  active?: boolean; // se true, filtra por ACTIVE + data válida
}

// ============================================================================
// CRUD DE CAMPANHAS
// ============================================================================

export async function createCampaign(data: CreateCampaignDTO) {
  return await prisma.$transaction(async (tx) => {
    const campaign = await tx.productCampaign.create({
      data: {
        companyId: data.companyId,
        branchId: data.branchId,
        scope: data.scope,
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        bonusType: data.bonusType,
        countMode: data.countMode,
        allowStacking: data.allowStacking ?? false,
        priority: data.priority ?? 0,
        bonusPerUnit: data.bonusPerUnit,
        minimumUnits: data.minimumUnits,
        minimumCountMode: data.minimumCountMode,
        bonusFixedOnMin: data.bonusFixedOnMin,
        bonusPerUnitAfter: data.bonusPerUnitAfter,
        packageUnits: data.packageUnits,
        bonusPerPackage: data.bonusPerPackage,
        status: "DRAFT",
        createdByUserId: data.createdById,
      },
    });

    // Criar itens da campanha
    if (data.items.length > 0) {
      await tx.productCampaignItem.createMany({
        data: data.items.map((item) => ({
          campaignId: campaign.id,
          productId: item.productId,
          categoryId: item.categoryId,
          brandId: item.brandId,
          supplierId: item.supplierId,
        })),
      });
    }

    return campaign;
  });
}

export async function getCampaigns(filter: CampaignFilter) {
  const where: Prisma.ProductCampaignWhereInput = {
    companyId: filter.companyId,
    ...(filter.branchId && { branchId: filter.branchId }),
    ...(filter.status && { status: filter.status }),
    ...(filter.scope && { scope: filter.scope }),
  };

  if (filter.active) {
    const now = new Date();
    where.status = "ACTIVE";
    where.startDate = { lte: now };
    where.endDate = { gte: now };
  }

  return await prisma.productCampaign.findMany({
    where,
    include: {
      products: {
        include: {
          product: true,
          category: true,
          brand: true,
          supplier: true,
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getCampaignById(id: string, companyId: string) {
  return await prisma.productCampaign.findFirst({
    where: { id, companyId },
    include: {
      products: {
        include: {
          product: true,
          category: true,
          brand: true,
          supplier: true,
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
      _count: {
        select: {
          bonusEntries: true,
        },
      },
    },
  });
}

export async function activateCampaign(id: string, companyId: string) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id, companyId },
    include: { products: true },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    throw new Error("Apenas campanhas em DRAFT ou SCHEDULED podem ser ativadas");
  }

  // Validar que há produtos elegíveis configurados
  if (campaign.products.length === 0) {
    throw new Error(
      "Campanha sem produtos elegíveis. Adicione ao menos um produto, categoria, marca ou fornecedor antes de ativar."
    );
  }

  return await prisma.productCampaign.update({
    where: { id },
    data: {
      status: "ACTIVE",
    },
  });
}

export async function updateCampaign(
  id: string,
  companyId: string,
  data: Partial<CreateCampaignDTO>
) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id, companyId },
    include: {
      _count: {
        select: { bonusEntries: true },
      },
    },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  // Lock: se há bônus gerados, não pode alterar regras
  if (campaign._count.bonusEntries > 0) {
    const lockedFields = [
      "bonusType",
      "countMode",
      "bonusPerUnit",
      "minimumCount",
      "minimumCountMode",
      "fixedBonusAmount",
      "packageSize",
      "bonusPerPackage",
      "tiers",
    ];
    const hasLockedChanges = lockedFields.some((field) => field in data);

    if (hasLockedChanges) {
      throw new Error(
        "Não é possível alterar regras de bonificação de uma campanha com bônus já gerados"
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    // Atualizar campanha
    const updated = await tx.productCampaign.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        allowStacking: data.allowStacking,
        priority: data.priority,
        bonusPerUnit: data.bonusPerUnit,
        minimumUnits: data.minimumUnits,
        minimumCountMode: data.minimumCountMode,
        bonusFixedOnMin: data.bonusFixedOnMin,
        bonusPerUnitAfter: data.bonusPerUnitAfter,
        packageUnits: data.packageUnits,
        bonusPerPackage: data.bonusPerPackage,
      },
    });

    // Atualizar itens se fornecido
    if (data.items && data.items.length > 0) {
      // Deletar itens antigos
      await tx.productCampaignItem.deleteMany({
        where: { campaignId: id },
      });

      // Criar novos itens
      await tx.productCampaignItem.createMany({
        data: data.items.map((item) => ({
          campaignId: id,
          productId: item.productId,
          categoryId: item.categoryId,
          brandId: item.brandId,
          supplierId: item.supplierId,
        })),
      });
    }

    return updated;
  });
}

export async function pauseCampaign(id: string, companyId: string) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id, companyId },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  if (campaign.status !== "ACTIVE") {
    throw new Error("Apenas campanhas ACTIVE podem ser pausadas");
  }

  return await prisma.productCampaign.update({
    where: { id },
    data: { status: "PAUSED" },
  });
}

export async function endCampaign(id: string, companyId: string) {
  return await prisma.productCampaign.update({
    where: { id },
    data: {
      status: "ENDED",
      endDate: new Date(),
    },
  });
}

// ============================================================================
// CÁLCULO DE BÔNUS
// ============================================================================

/**
 * Calcula bônus TIERED (escalonado por faixas)
 * Exemplo: [{from: 0, to: 10, bonus: 2}, {from: 11, to: 20, bonus: 5}, {from: 21, to: null, bonus: 10}]
 * - Se vender 15 unidades: aplica bônus de R$ 5 (faixa 11-20)
 * - Se vender 25 unidades: aplica bônus de R$ 10 (faixa 21+)
 */
function calculateTieredBonus(
  campaign: {
    tiers?: Prisma.JsonValue | null;
  },
  quantity: number
): BonusCalculationResult {
  if (!campaign.tiers) {
    return {
      bonusAmount: 0,
      eligibleQuantity: 0,
      details: "Nenhuma faixa configurada",
    };
  }

  // Parse tiers (esperado: array de {from, to, bonus})
  let tiersArray: Array<{ from: number; to: number | null; bonus: number }> = [];

  try {
    tiersArray = campaign.tiers as any;
    if (!Array.isArray(tiersArray) || tiersArray.length === 0) {
      return {
        bonusAmount: 0,
        eligibleQuantity: 0,
        details: "Faixas inválidas",
      };
    }
  } catch {
    return {
      bonusAmount: 0,
      eligibleQuantity: 0,
      details: "Erro ao processar faixas",
    };
  }

  // Ordenar por 'from' (garantir que seja crescente)
  const sortedTiers = [...tiersArray].sort((a, b) => a.from - b.from);

  // Encontrar a faixa aplicável
  let appliedTierIndex = -1;
  let appliedTier: typeof sortedTiers[0] | null = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const from = tier.from;
    const to = tier.to;

    // Verificar se a quantidade está dentro da faixa
    if (quantity >= from && (to === null || quantity <= to)) {
      appliedTierIndex = i;
      appliedTier = tier;
      break;
    }
  }

  if (!appliedTier) {
    return {
      bonusAmount: 0,
      eligibleQuantity: 0,
      details: `Quantidade ${quantity} não se encaixa em nenhuma faixa`,
    };
  }

  // Calcular bônus: quantidade × bonus da faixa
  const bonusAmount = quantity * appliedTier.bonus;

  return {
    bonusAmount,
    eligibleQuantity: quantity,
    appliedTier: appliedTierIndex,
    details: `Faixa ${appliedTier.from}-${appliedTier.to ?? '∞'}: ${quantity} unidades × R$ ${appliedTier.bonus.toFixed(2)} = R$ ${bonusAmount.toFixed(2)}`,
  };
}

export function calculateBonus(
  campaign: {
    bonusType: string;
    countMode: string;
    bonusPerUnit?: number | null | Prisma.Decimal;
    minimumUnits?: number | null;
    minimumCountMode?: string | null;
    bonusFixedOnMin?: number | null | Prisma.Decimal;
    bonusPerUnitAfter?: number | null | Prisma.Decimal;
    packageUnits?: number | null;
    bonusPerPackage?: number | null | Prisma.Decimal;
    tiers?: Prisma.JsonValue | null;
  },
  quantity: number
): BonusCalculationResult {
  const { bonusType, countMode } = campaign;

  // TIPO A: PER_UNIT
  if (bonusType === "PER_UNIT") {
    const bonusPerUnit = Number(campaign.bonusPerUnit ?? 0);
    const bonusAmount = quantity * bonusPerUnit;
    return {
      bonusAmount,
      eligibleQuantity: quantity,
      details: `${quantity} unidades × R$ ${bonusPerUnit.toFixed(2)} = R$ ${bonusAmount.toFixed(2)}`,
    };
  }

  // TIPO B1: MINIMUM_FIXED
  if (bonusType === "MINIMUM_FIXED") {
    const min = campaign.minimumUnits ?? 0;
    const fixedBonus = Number(campaign.bonusFixedOnMin ?? 0);

    if (quantity >= min) {
      return {
        bonusAmount: fixedBonus,
        eligibleQuantity: quantity,
        details: `Atingiu mínimo de ${min} → Bônus fixo de R$ ${fixedBonus.toFixed(2)}`,
      };
    }

    return {
      bonusAmount: 0,
      eligibleQuantity: 0,
      details: `Não atingiu o mínimo de ${min} (atual: ${quantity})`,
    };
  }

  // TIPO B2: MINIMUM_PER_UNIT
  if (bonusType === "MINIMUM_PER_UNIT") {
    const min = campaign.minimumUnits ?? 0;
    const bonusPerUnit = Number(campaign.bonusPerUnitAfter ?? 0);
    const minimumCountMode = campaign.minimumCountMode ?? "AFTER_MINIMUM";

    if (quantity < min) {
      return {
        bonusAmount: 0,
        eligibleQuantity: 0,
        details: `Não atingiu o mínimo de ${min} (atual: ${quantity})`,
      };
    }

    let eligibleQty = 0;
    if (minimumCountMode === "AFTER_MINIMUM") {
      // Conta ACIMA do mínimo (ex: min=10, qty=15 → 5 unidades)
      eligibleQty = quantity - min;
    } else {
      // FROM_MINIMUM: conta A PARTIR do mínimo (ex: min=10, qty=15 → 6 unidades)
      eligibleQty = quantity - min + 1;
    }

    const bonusAmount = eligibleQty * bonusPerUnit;
    return {
      bonusAmount,
      eligibleQuantity: eligibleQty,
      details: `Mínimo ${min} atingido. ${eligibleQty} unidades elegíveis × R$ ${bonusPerUnit.toFixed(2)} = R$ ${bonusAmount.toFixed(2)} (modo: ${minimumCountMode})`,
    };
  }

  // TIPO C: PER_PACKAGE
  if (bonusType === "PER_PACKAGE") {
    const packageSize = campaign.packageUnits ?? 1;
    const bonusPerPackage = Number(campaign.bonusPerPackage ?? 0);
    const packages = Math.floor(quantity / packageSize);
    const bonusAmount = packages * bonusPerPackage;

    return {
      bonusAmount,
      eligibleQuantity: packages * packageSize,
      details: `${packages} pacotes (${packageSize} por pacote) × R$ ${bonusPerPackage.toFixed(2)} = R$ ${bonusAmount.toFixed(2)}`,
    };
  }

  // TIPO D: TIERED (escalonado por faixas)
  if (bonusType === "TIERED") {
    return calculateTieredBonus(campaign as any, quantity);
  }

  return {
    bonusAmount: 0,
    eligibleQuantity: 0,
    details: "Tipo de bonificação desconhecido",
  };
}

// ============================================================================
// VERIFICAÇÃO DE LIMITES
// ============================================================================

/**
 * Verifica se um bônus respeita os limites da campanha
 * Retorna { allowed: true, bonusAmount } ou { allowed: false, reason, cappedAmount }
 */
async function checkBonusLimits(
  campaignId: string,
  companyId: string,
  campaign: {
    maxBonusPerSeller?: number | null;
    maxBonusPerBranch?: number | null;
    maxBonusTotal?: number | null;
    maxBonusPerDay?: number | null;
    branchId?: string | null;
  },
  proposedBonus: number,
  sellerUserId: string,
  branchId: string | null,
  saleDate: Date
): Promise<{ allowed: boolean; bonusAmount: number; reason?: string }> {
  let cappedBonus = proposedBonus;

  // 1. Limite por vendedor
  if (campaign.maxBonusPerSeller) {
    const sellerTotal = await prisma.campaignBonusEntry.aggregate({
      where: {
        campaignId,
        companyId,
        sellerUserId,
        status: "APPROVED",
      },
      _sum: { totalBonus: true },
    });

    const currentTotal = Number(sellerTotal._sum.totalBonus ?? 0);
    const remaining = campaign.maxBonusPerSeller - currentTotal;

    if (remaining <= 0) {
      return {
        allowed: false,
        bonusAmount: 0,
        reason: `Vendedor atingiu limite de R$ ${(campaign.maxBonusPerSeller / 100).toFixed(2)}`,
      };
    }

    cappedBonus = Math.min(cappedBonus, remaining);
  }

  // 2. Limite por filial
  if (campaign.maxBonusPerBranch && branchId) {
    const branchTotal = await prisma.campaignBonusEntry.aggregate({
      where: {
        campaignId,
        companyId,
        branchId,
        status: "APPROVED",
      },
      _sum: { totalBonus: true },
    });

    const currentTotal = Number(branchTotal._sum.totalBonus ?? 0);
    const remaining = campaign.maxBonusPerBranch - currentTotal;

    if (remaining <= 0) {
      return {
        allowed: false,
        bonusAmount: 0,
        reason: `Filial atingiu limite de R$ ${(campaign.maxBonusPerBranch / 100).toFixed(2)}`,
      };
    }

    cappedBonus = Math.min(cappedBonus, remaining);
  }

  // 3. Limite total da campanha
  if (campaign.maxBonusTotal) {
    const totalCampaign = await prisma.campaignBonusEntry.aggregate({
      where: {
        campaignId,
        companyId,
        status: "APPROVED",
      },
      _sum: { totalBonus: true },
    });

    const currentTotal = Number(totalCampaign._sum.totalBonus ?? 0);
    const remaining = campaign.maxBonusTotal - currentTotal;

    if (remaining <= 0) {
      return {
        allowed: false,
        bonusAmount: 0,
        reason: `Campanha atingiu limite total de R$ ${(campaign.maxBonusTotal / 100).toFixed(2)}`,
      };
    }

    cappedBonus = Math.min(cappedBonus, remaining);
  }

  // 4. Limite por dia
  if (campaign.maxBonusPerDay) {
    const startOfDay = new Date(saleDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(saleDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dayTotal = await prisma.campaignBonusEntry.aggregate({
      where: {
        campaignId,
        companyId,
        status: "APPROVED",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      _sum: { totalBonus: true },
    });

    const currentTotal = Number(dayTotal._sum.totalBonus ?? 0);
    const remaining = campaign.maxBonusPerDay - currentTotal;

    if (remaining <= 0) {
      return {
        allowed: false,
        bonusAmount: 0,
        reason: `Limite diário atingido: R$ ${(campaign.maxBonusPerDay / 100).toFixed(2)}`,
      };
    }

    cappedBonus = Math.min(cappedBonus, remaining);
  }

  return {
    allowed: true,
    bonusAmount: cappedBonus,
  };
}

// ============================================================================
// FILTRO DE ITENS ELEGÍVEIS
// ============================================================================

/**
 * Filtra itens elegíveis da venda para uma campanha
 * Aplica condições extras: minSaleAmount, excludeDiscounted, onlyFullPrice
 */
function filterEligibleItems(
  sale: any,
  campaign: any
): any[] {
  // 1. Verificar valor mínimo da venda (em centavos)
  if (campaign.minSaleAmount) {
    const saleTotal = Number(sale.total) * 100; // converter para centavos
    if (saleTotal < campaign.minSaleAmount) {
      return []; // Venda não atingiu mínimo
    }
  }

  // 2. Filtrar itens
  return sale.items.filter((saleItem: any) => {
    const product = saleItem.product;
    if (!product) return false;

    // 3. Verificar se item tem desconto (excludeDiscounted)
    if (campaign.excludeDiscounted) {
      const itemDiscount = Number(saleItem.discount ?? 0);
      if (itemDiscount > 0) return false;
    }

    // 4. Verificar se está em preço cheio (onlyFullPrice)
    if (campaign.onlyFullPrice) {
      const unitPrice = Number(saleItem.unitPrice);
      const productPrice = Number(product.price);
      // Tolerância de 1 centavo para comparação
      if (Math.abs(unitPrice - productPrice) > 0.01) {
        return false;
      }
    }

    // 5. Verificar se corresponde aos filtros de produto da campanha
    // Se não há filtros configurados, nenhum produto é elegível
    if (campaign.products.length === 0) {
      console.warn(`Campanha ${campaign.id} sem produtos - nenhum item elegível`);
      return false;
    }

    // Verificar se algum item da campanha corresponde
    return campaign.products.some((campaignItem: any) => {
      if (campaignItem.productId && campaignItem.productId === product.id) return true;
      if (campaignItem.categoryId && campaignItem.categoryId === product.categoryId) return true;
      if (campaignItem.brandId && campaignItem.brandId === product.brandId) return true;
      if (campaignItem.supplierId && campaignItem.supplierId === product.supplierId) return true;
      return false;
    });
  });
}

// ============================================================================
// PROCESSAMENTO DE VENDAS (IDEMPOTENTE)
// ============================================================================

export async function processaSaleForCampaigns(
  saleId: string,
  companyId: string
) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              brandId: true,
              supplierId: true,
            },
          },
        },
      },
      sellerUser: true,
      branch: true,
    },
  });

  if (!sale) {
    throw new Error("Venda não encontrada");
  }

  const now = new Date();

  // Buscar campanhas ativas válidas
  const campaigns = await prisma.productCampaign.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [
        { branchId: sale.branchId },
        { branchId: null },
      ],
    },
    include: {
      products: true,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  if (campaigns.length === 0) {
    return { processed: 0, bonusTotal: 0 };
  }

  let processedCount = 0;
  let bonusTotal = 0;

  for (const campaign of campaigns) {
    // Filtrar itens elegíveis (com condições extras)
    const eligibleItems = filterEligibleItems(sale, campaign);

    if (eligibleItems.length === 0) continue;

    // Calcular quantidade total conforme countMode
    let totalCount = 0;
    if (campaign.countMode === "BY_QUANTITY") {
      totalCount = eligibleItems.reduce((sum, item) => sum + item.qty, 0);
    } else if (campaign.countMode === "BY_ITEM") {
      totalCount = eligibleItems.length;
    } else if (campaign.countMode === "BY_SALE") {
      totalCount = 1;
    }

    // Calcular bônus
    const result = calculateBonus(campaign, totalCount);

    if (result.bonusAmount <= 0) continue;

    // Verificar limites da campanha
    const limitCheck = await checkBonusLimits(
      campaign.id,
      companyId,
      campaign,
      result.bonusAmount,
      sale.sellerUserId,
      sale.branchId,
      sale.createdAt
    );

    if (!limitCheck.allowed) {
      console.log(`⚠️ Campanha ${campaign.name}: ${limitCheck.reason}`);
      continue;
    }

    // Usar bônus possivelmente reduzido pelo limite
    const finalBonus = limitCheck.bonusAmount;

    if (finalBonus <= 0) continue;

    // Verificar conflitos (se não permite stacking)
    if (!campaign.allowStacking) {
      const existingBonus = await prisma.campaignBonusEntry.findFirst({
        where: {
          saleId: sale.id,
          campaignId: { not: campaign.id },
        },
      });

      if (existingBonus) {
        // Winner-takes-all: pular esta campanha
        continue;
      }
    }

    // Determinar seller (usar seller da venda)
    const sellerId = sale.sellerUserId;

    // Determinar branchId
    let effectiveBranchId: string | null = null;
    if (campaign.scope === "BRANCH" || campaign.scope === "BOTH") {
      effectiveBranchId = sale.branchId;
    }

    // Processar cada item elegível (idempotente via upsert)
    for (const saleItem of eligibleItems) {
      try {
        await prisma.campaignBonusEntry.upsert({
          where: {
            campaignId_saleId_saleItemId: {
              campaignId: campaign.id,
              saleId: sale.id,
              saleItemId: saleItem.id ?? "",
            },
          },
          create: {
            companyId,
            campaignId: campaign.id,
            saleId: sale.id,
            saleItemId: saleItem.id,
            branchId: effectiveBranchId,
            sellerUserId: sellerId,
            quantity: saleItem.qty,
            totalBonus: finalBonus / eligibleItems.length, // Dividir igualmente (com limite aplicado)
            calculationDetails: result.details,
            status: "PENDING",
          },
          update: {
            // Idempotente: não atualiza se já existe
          },
        });

        processedCount++;
        bonusTotal += finalBonus / eligibleItems.length;
      } catch (error) {
        // Unique constraint: já processado, ok
        console.log(`Item ${saleItem.id} já processado para campanha ${campaign.id}`);
      }
    }

    // Atualizar progresso incremental
    if (campaign.scope === "SELLER" || campaign.scope === "BOTH") {
      await updateProgressIncremental(
        campaign.id,
        sellerId,
        effectiveBranchId,
        totalCount,
        result.bonusAmount
      );
    }
  }

  return { processed: processedCount, bonusTotal };
}

// ============================================================================
// REVERSÃO DE BÔNUS
// ============================================================================

export async function reverseBonusForSale(saleId: string, companyId: string) {
  const entries = await prisma.campaignBonusEntry.findMany({
    where: {
      saleId,
      companyId,
      status: { not: "REVERSED" },
    },
  });

  if (entries.length === 0) {
    return { reversed: 0 };
  }

  await prisma.$transaction(async (tx) => {
    // Marcar como revertidos
    await tx.campaignBonusEntry.updateMany({
      where: {
        saleId,
        companyId,
      },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
      },
    });

    // Atualizar progresso (subtrair)
    for (const entry of entries) {
      if (entry.sellerUserId) {
        await tx.campaignSellerProgress.updateMany({
          where: {
            campaignId: entry.campaignId,
            sellerUserId: entry.sellerUserId,
          },
          data: {
            totalBonus: { decrement: entry.totalBonus },
          },
        });
      }
    }
  });

  return { reversed: entries.length };
}

// ============================================================================
// PROGRESSO INCREMENTAL
// ============================================================================

async function updateProgressIncremental(
  campaignId: string,
  sellerUserId: string,
  branchId: string | null,
  quantity: number,
  bonusAmount: number
) {
  await prisma.campaignSellerProgress.upsert({
    where: {
      campaignId_sellerUserId: {
        campaignId,
        sellerUserId,
      },
    },
    create: {
      campaignId,
      sellerUserId,
      branchId,
      totalQuantity: quantity,
      totalBonus: bonusAmount,
      lastCalculatedAt: new Date(),
    },
    update: {
      totalQuantity: { increment: quantity },
      totalBonus: { increment: bonusAmount },
      lastCalculatedAt: new Date(),
    },
  });
}

export async function reconcileCampaignProgress(
  campaignId: string,
  companyId: string
) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id: campaignId, companyId },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  // Reprocessar progresso a partir dos bônus existentes
  const entries = await prisma.campaignBonusEntry.groupBy({
    by: ["sellerUserId", "branchId"],
    where: {
      campaignId,
      status: { not: "REVERSED" },
    },
    _sum: {
      totalBonus: true,
      quantity: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    // Limpar progresso antigo
    await tx.campaignSellerProgress.deleteMany({
      where: { campaignId },
    });

    // Recriar progresso
    for (const entry of entries) {
      if (!entry.sellerUserId) continue;

      await tx.campaignSellerProgress.create({
        data: {
          campaignId,
          sellerUserId: entry.sellerUserId,
          branchId: entry.branchId,
          totalQuantity: entry._sum.quantity ?? 0,
          totalBonus: entry._sum.totalBonus ?? 0,
          lastCalculatedAt: new Date(),
        },
      });
    }
  });

  return { reconciled: entries.length };
}

// ============================================================================
// RELATÓRIOS
// ============================================================================

export async function getCampaignReport(campaignId: string, companyId: string) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id: campaignId, companyId },
    include: {
      products: {
        include: {
          product: true,
          category: true,
          brand: true,
          supplier: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  // Total de bônus por status
  const bonusByStatus = await prisma.campaignBonusEntry.groupBy({
    by: ["status"],
    where: { campaignId },
    _sum: { totalBonus: true },
    _count: true,
  });

  // Top vendedores
  const topSellers = await prisma.campaignBonusEntry.groupBy({
    by: ["sellerUserId"],
    where: {
      campaignId,
      status: { not: "REVERSED" },
    },
    _sum: { totalBonus: true },
    orderBy: {
      _sum: { totalBonus: "desc" },
    },
    take: 10,
  });

  // Buscar nomes dos vendedores
  const sellerIds = topSellers.map((s) => s.sellerUserId).filter((id): id is string => id !== null);
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true },
  });

  const topSellersWithNames = topSellers.map((seller) => ({
    sellerId: seller.sellerUserId,
    sellerName: sellers.find((s) => s.id === seller.sellerUserId)?.name ?? "Desconhecido",
    totalBonus: seller._sum.totalBonus ?? 0,
  }));

  // Produtos mais vendidos na campanha
  const topProducts = await prisma.$queryRaw<
    Array<{ productId: string; totalQty: number; totalBonus: number }>
  >`
    SELECT
      si."productId",
      SUM(si.quantity)::int as "totalQty",
      SUM(cbe."bonusAmount")::float as "totalBonus"
    FROM "CampaignBonusEntry" cbe
    JOIN "SaleItem" si ON si.id = cbe."saleItemId"
    WHERE cbe."campaignId" = ${campaignId}
      AND cbe.status != 'REVERSED'
    GROUP BY si."productId"
    ORDER BY "totalBonus" DESC
    LIMIT 10
  `;

  const productIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });

  const topProductsWithNames = topProducts.map((p) => ({
    productId: p.productId,
    productName: products.find((prod) => prod.id === p.productId)?.name ?? "Desconhecido",
    totalQuantity: p.totalQty,
    totalBonus: p.totalBonus,
  }));

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      bonusType: campaign.bonusType,
      countMode: campaign.countMode,
    },
    summary: {
      totalBonus: bonusByStatus.reduce((sum, b) => sum + Number(b._sum.totalBonus ?? 0), 0),
      totalEntries: bonusByStatus.reduce((sum, b) => sum + b._count, 0),
      byStatus: bonusByStatus,
    },
    topSellers: topSellersWithNames,
    topProducts: topProductsWithNames,
  };
}

// ============================================================================
// SIMULAÇÃO
// ============================================================================

export async function simulateBonus(
  campaignId: string,
  companyId: string,
  quantity: number
) {
  const campaign = await prisma.productCampaign.findFirst({
    where: { id: campaignId, companyId },
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  const result = calculateBonus(campaign, quantity);

  return {
    campaignName: campaign.name,
    bonusType: campaign.bonusType,
    inputQuantity: quantity,
    ...result,
  };
}
