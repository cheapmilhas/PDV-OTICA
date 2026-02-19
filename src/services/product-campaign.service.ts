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
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    throw new Error("Apenas campanhas em DRAFT ou SCHEDULED podem ser ativadas");
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

  return {
    bonusAmount: 0,
    eligibleQuantity: 0,
    details: "Tipo de bonificação desconhecido",
  };
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
          product: true,
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
    // Filtrar itens elegíveis
    const eligibleItems = sale.items.filter((saleItem) => {
      const product = saleItem.product;

      // Se não há filtros, todos produtos são elegíveis
      if (campaign.products.length === 0) return true;

      // Verificar se algum item da campanha corresponde
      return campaign.products.some((campaignItem) => {
        if (campaignItem.productId && campaignItem.productId === product.id) return true;
        if (campaignItem.categoryId && campaignItem.categoryId === product.categoryId) return true;
        if (campaignItem.brandId && campaignItem.brandId === product.brandId) return true;
        if (campaignItem.supplierId && campaignItem.supplierId === product.supplierId) return true;
        return false;
      });
    });

    if (eligibleItems.length === 0) continue;

    // Calcular quantidade total conforme countMode
    let totalCount = 0;
    if (campaign.countMode === "BY_QUANTITY") {
      totalCount = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
    } else if (campaign.countMode === "BY_ITEM") {
      totalCount = eligibleItems.length;
    } else if (campaign.countMode === "BY_SALE") {
      totalCount = 1;
    }

    // Calcular bônus
    const result = calculateBonus(campaign, totalCount);

    if (result.bonusAmount <= 0) continue;

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

    // Determinar seller (item seller > sale seller)
    const sellerId = eligibleItems[0]?.sellerId ?? sale.sellerId;

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
              saleItemId: saleItem.id,
            },
          },
          create: {
            companyId,
            campaignId: campaign.id,
            saleId: sale.id,
            saleItemId: saleItem.id,
            branchId: effectiveBranchId,
            sellerId: sellerId ?? undefined,
            bonusAmount: result.bonusAmount / eligibleItems.length, // Dividir igualmente
            eligibleQuantity: saleItem.quantity,
            calculationDetails: result.details,
            status: "PENDING",
          },
          update: {
            // Idempotente: não atualiza se já existe
          },
        });

        processedCount++;
        bonusTotal += result.bonusAmount / eligibleItems.length;
      } catch (error) {
        // Unique constraint: já processado, ok
        console.log(`Item ${saleItem.id} já processado para campanha ${campaign.id}`);
      }
    }

    // Atualizar progresso incremental
    if (sellerId && (campaign.scope === "SELLER" || campaign.scope === "BOTH")) {
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
      if (entry.sellerId) {
        await tx.campaignSellerProgress.updateMany({
          where: {
            campaignId: entry.campaignId,
            sellerId: entry.sellerId,
          },
          data: {
            totalBonus: { decrement: entry.bonusAmount },
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
  sellerId: string,
  branchId: string | null,
  quantity: number,
  bonusAmount: number
) {
  await prisma.campaignSellerProgress.upsert({
    where: {
      campaignId_sellerId_branchId: {
        campaignId,
        sellerId,
        branchId: branchId ?? "",
      },
    },
    create: {
      campaignId,
      sellerId,
      branchId,
      currentCount: quantity,
      totalBonus: bonusAmount,
      lastUpdated: new Date(),
    },
    update: {
      currentCount: { increment: quantity },
      totalBonus: { increment: bonusAmount },
      lastUpdated: new Date(),
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
    by: ["sellerId", "branchId"],
    where: {
      campaignId,
      status: { not: "REVERSED" },
    },
    _sum: {
      bonusAmount: true,
      eligibleQuantity: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    // Limpar progresso antigo
    await tx.campaignSellerProgress.deleteMany({
      where: { campaignId },
    });

    // Recriar progresso
    for (const entry of entries) {
      if (!entry.sellerId) continue;

      await tx.campaignSellerProgress.create({
        data: {
          campaignId,
          sellerId: entry.sellerId,
          branchId: entry.branchId,
          currentCount: entry._sum.eligibleQuantity ?? 0,
          totalBonus: entry._sum.bonusAmount ?? 0,
          lastUpdated: new Date(),
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
    _sum: { bonusAmount: true },
    _count: true,
  });

  // Top vendedores
  const topSellers = await prisma.campaignBonusEntry.groupBy({
    by: ["sellerId"],
    where: {
      campaignId,
      status: { not: "REVERSED" },
    },
    _sum: { bonusAmount: true },
    orderBy: {
      _sum: { bonusAmount: "desc" },
    },
    take: 10,
  });

  // Buscar nomes dos vendedores
  const sellerIds = topSellers.map((s) => s.sellerId).filter((id): id is string => id !== null);
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true },
  });

  const topSellersWithNames = topSellers.map((seller) => ({
    sellerId: seller.sellerId,
    sellerName: sellers.find((s) => s.id === seller.sellerId)?.name ?? "Desconhecido",
    totalBonus: seller._sum.bonusAmount ?? 0,
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
      totalBonus: bonusByStatus.reduce((sum, b) => sum + (b._sum.bonusAmount ?? 0), 0),
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
