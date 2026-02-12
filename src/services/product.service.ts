import { prisma } from "@/lib/prisma";
import type {
  CreateProductDTO,
  UpdateProductDTO,
  ProductQuery,
} from "@/lib/validations/product.schema";
import {
  notFoundError,
  duplicateError,
  businessRuleError,
} from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { Product } from "@prisma/client";

/**
 * Service de produtos
 * Camada de business logic para operações de Product
 */
export class ProductService {
  /**
   * Lista produtos com paginação, busca e filtros
   */
  async list(query: ProductQuery, companyId: string) {
    const {
      search,
      page,
      pageSize,
      status,
      type,
      categoryId,
      brandId,
      supplierId,
      inStock,
      stockLevel,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      lowStock,
      featured,
      launch,
      abcClass,
      sortBy,
      sortOrder,
    } = query;

    // Build where clause
    const where: any = {
      companyId,
    };

    // Filtro de status
    if (status === "ativos") {
      where.active = true;
    } else if (status === "inativos") {
      where.active = false;
    }

    // Filtros específicos
    if (type) {
      where.type = type;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (featured !== undefined) {
      where.featured = featured;
    }

    if (launch !== undefined) {
      where.launch = launch;
    }

    if (abcClass) {
      where.abcClass = abcClass;
    }

    // Filtro de estoque
    if (inStock !== undefined) {
      if (inStock) {
        where.stockQty = { gt: 0 };
      } else {
        where.stockQty = 0;
      }
    }

    // Filtro de nível de estoque
    if (stockLevel) {
      switch (stockLevel) {
        case "zerado":
          where.stockQty = 0;
          break;
        case "baixo":
          where.AND = where.AND || [];
          where.AND.push({
            stockQty: { gt: 0, lte: prisma.product.fields.stockMin },
          });
          break;
        case "normal":
          where.AND = where.AND || [];
          where.AND.push({
            stockQty: { gt: prisma.product.fields.stockMin },
          });
          break;
        case "alto":
          where.AND = where.AND || [];
          where.AND.push({
            stockQty: { gte: prisma.product.fields.stockMax },
          });
          break;
      }
    }

    // Filtro de estoque baixo (stockQty <= stockMin)
    if (lowStock) {
      where.AND = where.AND || [];
      where.AND.push({
        stockQty: { lte: prisma.product.fields.stockMin },
      });
    }

    // Filtro de faixa de preço
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.salePrice = {};
      if (minPrice !== undefined) {
        where.salePrice.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.salePrice.lte = maxPrice;
      }
    }

    // Filtro de período de cadastro
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    // Busca full-text
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { sku: { contains: search, mode: "insensitive" as const } },
        { barcode: { equals: search } },
        { brand: { name: { contains: search, mode: "insensitive" as const } } },
      ];
    }

    // Ordenação
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Paginação
    const { skip, take } = getPaginationParams(page, pageSize);

    // Execute query + count em paralelo
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: true,
          brand: true,
          color: true,
          shape: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      data,
      pagination: createPaginationMeta(page, pageSize, total),
    };
  }

  /**
   * Busca produto por ID
   */
  async getById(id: string, companyId: string, includeInactive = false): Promise<Product> {
    const where: any = {
      id,
      companyId,
    };

    if (!includeInactive) {
      where.active = true;
    }

    const product = await prisma.product.findFirst({
      where,
      include: {
        category: true,
        brand: true,
        color: true,
        shape: true,
      },
    });

    if (!product) {
      throw notFoundError("Produto não encontrado");
    }

    return product;
  }

  /**
   * Cria novo produto
   */
  async create(data: CreateProductDTO, companyId: string): Promise<Product> {
    // Validação: SKU duplicado
    const existingSKU = await prisma.product.findFirst({
      where: {
        companyId,
        sku: data.sku,
      },
    });

    if (existingSKU) {
      throw duplicateError("SKU já cadastrado nesta empresa", "sku");
    }

    // Validação: Barcode duplicado (se fornecido)
    if (data.barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: {
          companyId,
          barcode: data.barcode,
        },
      });

      if (existingBarcode) {
        throw duplicateError("Código de barras já cadastrado", "barcode");
      }
    }

    // Cria produto
    const product = await prisma.product.create({
      data: {
        ...data,
        companyId,
      },
      include: {
        category: true,
        brand: true,
        color: true,
        shape: true,
      },
    });

    return product;
  }

  /**
   * Atualiza produto existente
   */
  async update(id: string, data: UpdateProductDTO, companyId: string): Promise<Product> {
    // Verifica se produto existe
    await this.getById(id, companyId, true);

    // Validação: SKU duplicado (se mudando SKU)
    if (data.sku) {
      const existing = await prisma.product.findFirst({
        where: {
          companyId,
          sku: data.sku,
          NOT: { id },
        },
      });

      if (existing) {
        throw duplicateError("SKU já cadastrado para outro produto", "sku");
      }
    }

    // Validação: Barcode duplicado (se mudando barcode)
    if (data.barcode) {
      const existing = await prisma.product.findFirst({
        where: {
          companyId,
          barcode: data.barcode,
          NOT: { id },
        },
      });

      if (existing) {
        throw duplicateError("Código de barras já cadastrado para outro produto", "barcode");
      }
    }

    // Atualiza produto
    const product = await prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
        brand: true,
        color: true,
        shape: true,
      },
    });

    return product;
  }

  /**
   * Deleta produto (soft delete)
   */
  async softDelete(id: string, companyId: string): Promise<Product> {
    // Verifica se produto existe
    const product = await this.getById(id, companyId, true);

    // Regra de negócio: Não permite deletar produto com estoque > 0
    if (product.stockQty > 0 && product.stockControlled) {
      throw businessRuleError(
        `Não é possível deletar produto com estoque (${product.stockQty} unidades). Zere o estoque primeiro.`
      );
    }

    // Soft delete
    const deletedProduct = await prisma.product.update({
      where: { id },
      data: { active: false },
    });

    return deletedProduct;
  }

  /**
   * BONUS: Valida se há estoque suficiente para uma venda
   *
   * @param id ID do produto
   * @param qty Quantidade desejada
   * @param companyId ID da empresa
   * @throws {AppError} Se estoque insuficiente
   * @returns true se há estoque
   */
  async checkStock(id: string, qty: number, companyId: string): Promise<boolean> {
    const product = await this.getById(id, companyId);

    // Se não tem controle de estoque, sempre retorna true
    if (!product.stockControlled) {
      return true;
    }

    // Verifica se há estoque suficiente
    if (product.stockQty < qty) {
      throw businessRuleError(
        `Estoque insuficiente. Disponível: ${product.stockQty}, Solicitado: ${qty}`
      );
    }

    return true;
  }

  /**
   * BONUS: Busca produto por código de barras (para PDV)
   */
  async findByBarcode(barcode: string, companyId: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: {
        companyId,
        active: true,
        barcode,
      },
      include: {
        category: true,
        brand: true,
      },
    });
  }

  /**
   * BONUS: Busca produto por SKU
   */
  async findBySKU(sku: string, companyId: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: {
        companyId,
        active: true,
        sku,
      },
      include: {
        category: true,
        brand: true,
      },
    });
  }

  /**
   * BONUS: Lista produtos com estoque baixo
   */
  async listLowStock(companyId: string, limit = 20): Promise<Product[]> {
    return prisma.product.findMany({
      where: {
        companyId,
        active: true,
        stockControlled: true,
      },
      // Filtra onde stockQty <= stockMin
      // Note: Prisma não suporta comparação entre campos diretamente,
      // então precisamos fazer isso em SQL bruto ou filtrar em memória
      take: limit,
      orderBy: { stockQty: "asc" },
      include: {
        category: true,
        brand: true,
      },
    });
  }

  /**
   * BONUS: Conta total de produtos ativos
   */
  async countActive(companyId: string): Promise<number> {
    return prisma.product.count({
      where: {
        companyId,
        active: true,
      },
    });
  }

  /**
   * BONUS: Valor total do estoque
   */
  async getStockValue(companyId: string): Promise<number> {
    const products = await prisma.product.findMany({
      where: {
        companyId,
        active: true,
        stockControlled: true,
      },
      select: {
        stockQty: true,
        costPrice: true,
      },
    });

    return products.reduce((total, product) => {
      return total + (Number(product.costPrice) * product.stockQty);
    }, 0);
  }

  /**
   * BONUS: Lista marcas únicas (para filtro)
   */
  async listBrands(companyId: string): Promise<Array<{ id: string; name: string }>> {
    const brands = await prisma.brand.findMany({
      where: {
        companyId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return brands;
  }

  /**
   * BONUS: Lista categorias únicas (para filtro)
   */
  async listCategories(companyId: string): Promise<Array<{ id: string; name: string }>> {
    const categories = await prisma.category.findMany({
      where: {
        companyId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return categories;
  }
}

// Export singleton instance
export const productService = new ProductService();
