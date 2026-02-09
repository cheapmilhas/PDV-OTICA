import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";

export interface NoMovementProductsFilters {
  days: number; // Número de dias sem movimento
  categoryId?: string;
  brandId?: string;
  productType?: string;
  minStockQty?: number;
}

export interface ProductNoMovementData {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string | null;
  brandName: string | null;
  type: string;
  currentStock: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  daysWithoutMovement: number;
  lastMovementDate: Date | null;
  lastMovementType: string | null;
  lastSaleDate: Date | null;
}

export interface NoMovementProductsReport {
  summary: {
    totalProducts: number;
    totalStockValue: number;
    totalStockQty: number;
    averageDaysWithoutMovement: number;
    productsNeverSold: number;
  };
  products: ProductNoMovementData[];
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    productCount: number;
    stockValue: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    productCount: number;
    stockValue: number;
  }>;
  daysRangeBreakdown: Array<{
    range: string;
    count: number;
    value: number;
  }>;
}

export class NoMovementProductsService {
  async generateReport(
    companyId: string,
    filters: NoMovementProductsFilters
  ): Promise<NoMovementProductsReport> {
    const days = Math.min(filters.days || 90, 365); // Max 1 year
    const cutoffDate = subDays(new Date(), days);

    // Build where clause
    const where: Prisma.ProductWhereInput = {
      companyId,
      stockControlled: true,
    };

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.productType) {
      where.type = filters.productType as any;
    }

    if (filters.minStockQty !== undefined) {
      where.stockQty = { gte: filters.minStockQty };
    }

    // Fetch products with movements and sales
    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
        brand: {
          select: { id: true, name: true },
        },
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            type: true,
          },
        },
        items: {
          where: {
            sale: {
              status: "COMPLETED",
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            createdAt: true,
          },
        },
      },
    });

    // Filter products without movement in the specified period
    const productsWithoutMovement: ProductNoMovementData[] = [];

    products.forEach((product) => {
      const lastMovement = product.stockMovements[0];
      const lastSale = product.items[0];

      // Get most recent activity (movement or sale)
      const lastMovementDate = lastMovement?.createdAt || null;
      const lastSaleDate = lastSale?.createdAt || null;

      const mostRecentActivity = [lastMovementDate, lastSaleDate]
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      // If no activity or activity is older than cutoff date
      if (!mostRecentActivity || mostRecentActivity < cutoffDate) {
        const daysWithoutMovement = mostRecentActivity
          ? Math.floor(
              (new Date().getTime() - mostRecentActivity.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 9999; // Never had movement

        const currentStock = product.stockQty;
        const costPrice = Number(product.costPrice);
        const stockValue = currentStock * costPrice;

        productsWithoutMovement.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          categoryName: product.category?.name || null,
          brandName: product.brand?.name || null,
          type: product.type,
          currentStock,
          costPrice,
          salePrice: Number(product.salePrice),
          stockValue,
          daysWithoutMovement,
          lastMovementDate,
          lastMovementType: lastMovement?.type || null,
          lastSaleDate,
        });
      }
    });

    // Sort by days without movement (descending)
    productsWithoutMovement.sort(
      (a, b) => b.daysWithoutMovement - a.daysWithoutMovement
    );

    // Calculate summary
    const totalStockValue = productsWithoutMovement.reduce(
      (sum, p) => sum + p.stockValue,
      0
    );
    const totalStockQty = productsWithoutMovement.reduce(
      (sum, p) => sum + p.currentStock,
      0
    );
    const productsNeverSold = productsWithoutMovement.filter(
      (p) => !p.lastSaleDate
    ).length;
    const averageDaysWithoutMovement =
      productsWithoutMovement.length > 0
        ? productsWithoutMovement.reduce(
            (sum, p) => sum + p.daysWithoutMovement,
            0
          ) / productsWithoutMovement.length
        : 0;

    const summary = {
      totalProducts: productsWithoutMovement.length,
      totalStockValue,
      totalStockQty,
      averageDaysWithoutMovement: Math.floor(averageDaysWithoutMovement),
      productsNeverSold,
    };

    // Category breakdown
    const categoryMap = new Map<
      string | null,
      { categoryName: string; productCount: number; stockValue: number }
    >();

    productsWithoutMovement.forEach((product) => {
      const key = product.categoryName || "Sem Categoria";
      const current = categoryMap.get(key) || {
        categoryName: key,
        productCount: 0,
        stockValue: 0,
      };

      categoryMap.set(key, {
        ...current,
        productCount: current.productCount + 1,
        stockValue: current.stockValue + product.stockValue,
      });
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([key, data]) => ({
        categoryId: key === "Sem Categoria" ? null : key,
        ...data,
      }))
      .sort((a, b) => b.stockValue - a.stockValue);

    // Type breakdown
    const typeMap = new Map<
      string,
      { productCount: number; stockValue: number }
    >();

    productsWithoutMovement.forEach((product) => {
      const current = typeMap.get(product.type) || {
        productCount: 0,
        stockValue: 0,
      };

      typeMap.set(product.type, {
        productCount: current.productCount + 1,
        stockValue: current.stockValue + product.stockValue,
      });
    });

    const typeBreakdown = Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type,
        ...data,
      }))
      .sort((a, b) => b.stockValue - a.stockValue);

    // Days range breakdown
    const daysRanges = [
      { range: "90-180 dias", min: 90, max: 180 },
      { range: "180-365 dias", min: 180, max: 365 },
      { range: "Mais de 1 ano", min: 365, max: Infinity },
      { range: "Nunca vendido", min: 9999, max: Infinity },
    ];

    const daysRangeBreakdown = daysRanges.map((rangeConfig) => {
      const products = productsWithoutMovement.filter((p) => {
        if (rangeConfig.range === "Nunca vendido") {
          return p.daysWithoutMovement === 9999;
        }
        return (
          p.daysWithoutMovement >= rangeConfig.min &&
          p.daysWithoutMovement < rangeConfig.max
        );
      });

      return {
        range: rangeConfig.range,
        count: products.length,
        value: products.reduce((sum, p) => sum + p.stockValue, 0),
      };
    });

    return {
      summary,
      products: productsWithoutMovement,
      categoryBreakdown,
      typeBreakdown,
      daysRangeBreakdown,
    };
  }
}
