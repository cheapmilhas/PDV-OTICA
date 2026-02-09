import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface ProductsTopSellersFilters {
  startDate: Date;
  endDate: Date;
  categoryId?: string;
  brandId?: string;
  productType?: string;
  limit?: number;
}

export interface ProductTopSellerData {
  productId: string;
  productName: string;
  sku: string;
  categoryName: string | null;
  brandName: string | null;
  type: string;
  qtySold: number;
  revenue: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
  abcClass: "A" | "B" | "C";
}

export interface ProductsTopSellersReport {
  summary: {
    totalProducts: number;
    totalRevenue: number;
    totalCost: number;
    averageMargin: number;
    classACount: number;
    classBCount: number;
    classCCount: number;
  };
  products: ProductTopSellerData[];
  abcDistribution: Array<{
    class: "A" | "B" | "C";
    count: number;
    revenue: number;
    percentage: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    revenue: number;
    productCount: number;
  }>;
}

export class ProductsTopSellersService {
  async generateReport(
    companyId: string,
    filters: ProductsTopSellersFilters
  ): Promise<ProductsTopSellersReport> {
    const limit = Math.min(filters.limit || 100, 200);

    // Build where clause for sales
    const saleWhere: Prisma.SaleWhereInput = {
      companyId,
      status: "COMPLETED",
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    // Build where clause for sale items
    const itemWhere: Prisma.SaleItemWhereInput = {
      sale: saleWhere,
      productId: { not: null },
    };

    // Fetch all sale items with product data
    const saleItems = await prisma.saleItem.findMany({
      where: itemWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            type: true,
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
          },
        },
        sale: {
          select: {
            status: true,
          },
        },
      },
      take: 10000, // Limit for performance
    });

    // Filter by product filters
    let filteredItems = saleItems.filter((item) => item.product);

    if (filters.categoryId) {
      filteredItems = filteredItems.filter(
        (item) => item.product?.category?.id === filters.categoryId
      );
    }

    if (filters.brandId) {
      filteredItems = filteredItems.filter(
        (item) => item.product?.brand?.id === filters.brandId
      );
    }

    if (filters.productType) {
      filteredItems = filteredItems.filter(
        (item) => item.product?.type === filters.productType
      );
    }

    // Group by product and calculate metrics
    const productMap = new Map<
      string,
      {
        productName: string;
        sku: string;
        categoryName: string | null;
        brandName: string | null;
        type: string;
        qtySold: number;
        revenue: number;
        totalCost: number;
      }
    >();

    filteredItems.forEach((item) => {
      if (!item.product) return;

      const productId = item.product.id;
      const current = productMap.get(productId) || {
        productName: item.product.name,
        sku: item.product.sku,
        categoryName: item.product.category?.name || null,
        brandName: item.product.brand?.name || null,
        type: item.product.type,
        qtySold: 0,
        revenue: 0,
        totalCost: 0,
      };

      productMap.set(productId, {
        ...current,
        qtySold: current.qtySold + item.qty,
        revenue: current.revenue + Number(item.lineTotal),
        totalCost: current.totalCost + Number(item.costPrice) * item.qty,
      });
    });

    // Convert to array and calculate margins
    const productsArray = Array.from(productMap.entries()).map(
      ([productId, data]) => ({
        productId,
        ...data,
        margin: data.revenue - data.totalCost,
        marginPercent:
          data.revenue > 0
            ? ((data.revenue - data.totalCost) / data.revenue) * 100
            : 0,
      })
    );

    // Sort by revenue and apply limit
    productsArray.sort((a, b) => b.revenue - a.revenue);
    const topProducts = productsArray.slice(0, limit);

    // Calculate ABC classification
    const totalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0);
    let accumulatedRevenue = 0;

    const productsWithABC: ProductTopSellerData[] = topProducts.map(
      (product) => {
        accumulatedRevenue += product.revenue;
        const accumulatedPercent = (accumulatedRevenue / totalRevenue) * 100;

        let abcClass: "A" | "B" | "C";
        if (accumulatedPercent <= 80) {
          abcClass = "A";
        } else if (accumulatedPercent <= 95) {
          abcClass = "B";
        } else {
          abcClass = "C";
        }

        return {
          ...product,
          abcClass,
        };
      }
    );

    // Calculate summary
    const totalCost = productsWithABC.reduce((sum, p) => sum + p.totalCost, 0);
    const classACount = productsWithABC.filter((p) => p.abcClass === "A").length;
    const classBCount = productsWithABC.filter((p) => p.abcClass === "B").length;
    const classCCount = productsWithABC.filter((p) => p.abcClass === "C").length;

    const summary = {
      totalProducts: productsWithABC.length,
      totalRevenue,
      totalCost,
      averageMargin:
        totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
      classACount,
      classBCount,
      classCCount,
    };

    // ABC distribution
    const classARevenue = productsWithABC
      .filter((p) => p.abcClass === "A")
      .reduce((sum, p) => sum + p.revenue, 0);
    const classBRevenue = productsWithABC
      .filter((p) => p.abcClass === "B")
      .reduce((sum, p) => sum + p.revenue, 0);
    const classCRevenue = productsWithABC
      .filter((p) => p.abcClass === "C")
      .reduce((sum, p) => sum + p.revenue, 0);

    const abcDistribution = [
      {
        class: "A" as const,
        count: classACount,
        revenue: classARevenue,
        percentage: totalRevenue > 0 ? (classARevenue / totalRevenue) * 100 : 0,
      },
      {
        class: "B" as const,
        count: classBCount,
        revenue: classBRevenue,
        percentage: totalRevenue > 0 ? (classBRevenue / totalRevenue) * 100 : 0,
      },
      {
        class: "C" as const,
        count: classCCount,
        revenue: classCRevenue,
        percentage: totalRevenue > 0 ? (classCRevenue / totalRevenue) * 100 : 0,
      },
    ];

    // Category breakdown
    const categoryMap = new Map<
      string | null,
      { categoryName: string; revenue: number; productCount: number }
    >();

    productsWithABC.forEach((product) => {
      const categoryId = product.categoryName
        ? product.productId
        : null;
      const key = product.categoryName || "Sem Categoria";
      const current = categoryMap.get(key) || {
        categoryName: product.categoryName || "Sem Categoria",
        revenue: 0,
        productCount: 0,
      };

      categoryMap.set(key, {
        ...current,
        revenue: current.revenue + product.revenue,
        productCount: current.productCount + 1,
      });
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([key, data]) => ({
        categoryId: key === "Sem Categoria" ? null : key,
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      summary,
      products: productsWithABC,
      abcDistribution,
      categoryBreakdown,
    };
  }
}
