import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface StockPositionFilters {
  categoryId?: string;
  brandId?: string;
  productType?: string;
  branchId?: string;
  minStock?: number;
  maxStock?: number;
  belowMinimum?: boolean;
}

export interface ProductStockData {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string | null;
  brandName: string | null;
  type: string;
  currentStock: number;
  minimumStock: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  status: "OK" | "LOW" | "OUT" | "EXCESS";
  lastMovementDate: Date | null;
  lastMovementType: string | null;
}

export interface StockPositionReport {
  summary: {
    totalProducts: number;
    totalStockValue: number;
    averageCostPrice: number;
    productsOK: number;
    productsLow: number;
    productsOut: number;
    totalStockQty: number;
  };
  products: ProductStockData[];
  statusDistribution: Array<{
    status: string;
    count: number;
    value: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    productCount: number;
    stockValue: number;
    stockQty: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    productCount: number;
    stockValue: number;
    stockQty: number;
  }>;
}

export class StockPositionService {
  async generateReport(
    companyId: string,
    filters: StockPositionFilters
  ): Promise<StockPositionReport> {
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

    if (filters.minStock !== undefined) {
      where.stockQty = { gte: filters.minStock };
    }

    if (filters.maxStock !== undefined) {
      where.stockQty = {
        ...(where.stockQty || {}),
        lte: filters.maxStock,
      } as any;
    }

    // Fetch products with stock info
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
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            type: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 5000, // Limit for performance
    });

    // Process products
    let productsData: ProductStockData[] = products.map((product) => {
      const currentStock = product.stockQty;
      const minimumStock = product.minStockQty || 0;
      const costPrice = Number(product.costPrice);
      const salePrice = Number(product.salePrice);
      const stockValue = currentStock * costPrice;

      // Determine status
      let status: "OK" | "LOW" | "OUT" | "EXCESS";
      if (currentStock === 0) {
        status = "OUT";
      } else if (currentStock < minimumStock) {
        status = "LOW";
      } else if (minimumStock > 0 && currentStock > minimumStock * 3) {
        status = "EXCESS";
      } else {
        status = "OK";
      }

      const lastMovement = product.stockMovements[0];

      return {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        categoryName: product.category?.name || null,
        brandName: product.brand?.name || null,
        type: product.type,
        currentStock,
        minimumStock,
        costPrice,
        salePrice,
        stockValue,
        status,
        lastMovementDate: lastMovement?.createdAt || null,
        lastMovementType: lastMovement?.type || null,
      };
    });

    // Apply below minimum filter if requested
    if (filters.belowMinimum) {
      productsData = productsData.filter(
        (p) => p.status === "LOW" || p.status === "OUT"
      );
    }

    // Calculate summary
    const totalStockValue = productsData.reduce((sum, p) => sum + p.stockValue, 0);
    const totalStockQty = productsData.reduce((sum, p) => sum + p.currentStock, 0);
    const productsOK = productsData.filter((p) => p.status === "OK").length;
    const productsLow = productsData.filter((p) => p.status === "LOW").length;
    const productsOut = productsData.filter((p) => p.status === "OUT").length;

    const summary = {
      totalProducts: productsData.length,
      totalStockValue,
      averageCostPrice:
        productsData.length > 0
          ? productsData.reduce((sum, p) => sum + p.costPrice, 0) /
            productsData.length
          : 0,
      productsOK,
      productsLow,
      productsOut,
      totalStockQty,
    };

    // Status distribution
    const statusMap = new Map<string, { count: number; value: number }>();
    productsData.forEach((product) => {
      const current = statusMap.get(product.status) || { count: 0, value: 0 };
      statusMap.set(product.status, {
        count: current.count + 1,
        value: current.value + product.stockValue,
      });
    });

    const statusDistribution = Array.from(statusMap.entries()).map(
      ([status, data]) => ({
        status,
        count: data.count,
        value: data.value,
      })
    );

    // Category breakdown
    const categoryMap = new Map<
      string | null,
      { categoryName: string; productCount: number; stockValue: number; stockQty: number }
    >();

    productsData.forEach((product) => {
      const key = product.categoryName || "Sem Categoria";
      const current = categoryMap.get(key) || {
        categoryName: key,
        productCount: 0,
        stockValue: 0,
        stockQty: 0,
      };

      categoryMap.set(key, {
        ...current,
        productCount: current.productCount + 1,
        stockValue: current.stockValue + product.stockValue,
        stockQty: current.stockQty + product.currentStock,
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
      { productCount: number; stockValue: number; stockQty: number }
    >();

    productsData.forEach((product) => {
      const current = typeMap.get(product.type) || {
        productCount: 0,
        stockValue: 0,
        stockQty: 0,
      };

      typeMap.set(product.type, {
        productCount: current.productCount + 1,
        stockValue: current.stockValue + product.stockValue,
        stockQty: current.stockQty + product.currentStock,
      });
    });

    const typeBreakdown = Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type,
        ...data,
      }))
      .sort((a, b) => b.stockValue - a.stockValue);

    return {
      summary,
      products: productsData,
      statusDistribution,
      categoryBreakdown,
      typeBreakdown,
    };
  }
}
