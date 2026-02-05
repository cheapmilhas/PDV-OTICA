import { z } from "zod";
import { ProductType } from "@prisma/client";

/**
 * Schema para criação de produto
 *
 * Campos obrigatórios: type, name, sku, salePrice
 * Campos opcionais: todos os outros
 */
export const createProductSchema = z.object({
  // Tipo e identificação
  type: z.nativeEnum(ProductType, {
    message: "Tipo de produto inválido",
  }),

  name: z.string()
    .min(3, "Nome deve ter no mínimo 3 caracteres")
    .max(200, "Nome deve ter no máximo 200 caracteres"),

  sku: z.string()
    .min(3, "SKU deve ter no mínimo 3 caracteres")
    .max(50, "SKU deve ter no máximo 50 caracteres")
    .regex(/^[A-Z0-9-_]+$/i, "SKU deve conter apenas letras, números, hífen e underscore"),

  barcode: z.string()
    .max(50, "Código de barras deve ter no máximo 50 caracteres")
    .optional()
    .or(z.literal("")),

  manufacturerCode: z.string()
    .max(50, "Código do fabricante deve ter no máximo 50 caracteres")
    .optional()
    .or(z.literal("")),

  description: z.string()
    .max(1000, "Descrição deve ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),

  // Relações
  categoryId: z.string()
    .optional()
    .or(z.literal("")),

  brandId: z.string()
    .optional()
    .or(z.literal("")),

  shapeId: z.string()
    .optional()
    .or(z.literal("")),

  colorId: z.string()
    .optional()
    .or(z.literal("")),

  supplierId: z.string()
    .optional()
    .or(z.literal("")),

  // Preços
  costPrice: z.coerce.number()
    .min(0, "Preço de custo não pode ser negativo")
    .default(0),

  salePrice: z.coerce.number()
    .positive("Preço de venda deve ser maior que zero"),

  promoPrice: z.coerce.number()
    .positive("Preço promocional deve ser maior que zero")
    .optional()
    .or(z.literal(0))
    .transform((val) => (val === 0 ? undefined : val)),

  marginPercent: z.coerce.number()
    .min(0, "Margem não pode ser negativa")
    .max(100, "Margem não pode ser maior que 100%")
    .optional()
    .or(z.literal(0))
    .transform((val) => (val === 0 ? undefined : val)),

  // Estoque
  stockControlled: z.boolean()
    .default(true),

  stockQty: z.coerce.number()
    .int("Quantidade em estoque deve ser um número inteiro")
    .min(0, "Quantidade em estoque não pode ser negativa")
    .default(0),

  stockMin: z.coerce.number()
    .int("Estoque mínimo deve ser um número inteiro")
    .min(0, "Estoque mínimo não pode ser negativo")
    .default(0),

  stockMax: z.coerce.number()
    .int("Estoque máximo deve ser um número inteiro")
    .min(0, "Estoque máximo não pode ser negativo")
    .optional()
    .or(z.literal(0))
    .transform((val) => (val === 0 ? undefined : val)),

  reorderPoint: z.coerce.number()
    .int("Ponto de pedido deve ser um número inteiro")
    .min(0, "Ponto de pedido não pode ser negativo")
    .optional()
    .or(z.literal(0))
    .transform((val) => (val === 0 ? undefined : val)),

  // Classificação ABC e giro
  abcClass: z.enum(["A", "B", "C"])
    .optional()
    .or(z.literal("")),

  turnoverDays: z.coerce.number()
    .int("Giro em dias deve ser um número inteiro")
    .positive("Giro em dias deve ser maior que zero")
    .optional()
    .or(z.literal(0))
    .transform((val) => (val === 0 ? undefined : val)),

  // Fiscal
  ncm: z.string()
    .max(10, "NCM deve ter no máximo 10 caracteres")
    .optional()
    .or(z.literal("")),

  cest: z.string()
    .max(10, "CEST deve ter no máximo 10 caracteres")
    .optional()
    .or(z.literal("")),

  // Imagens
  mainImage: z.string()
    .url("URL da imagem principal inválida")
    .optional()
    .or(z.literal("")),

  // Status
  active: z.boolean()
    .default(true),

  featured: z.boolean()
    .default(false),

  launch: z.boolean()
    .default(false),
});

/**
 * Schema para atualização de produto
 * Todos os campos são opcionais
 */
export const updateProductSchema = createProductSchema.partial();

/**
 * Schema para query params de listagem de produtos
 */
export const productQuerySchema = z.object({
  // Paginação
  page: z.coerce.number()
    .int()
    .min(1, "Página deve ser maior que 0")
    .default(1),

  pageSize: z.coerce.number()
    .int()
    .min(1, "PageSize deve ser maior que 0")
    .max(100, "PageSize deve ser no máximo 100")
    .default(20),

  // Busca full-text
  search: z.string()
    .optional(),

  // Filtros
  status: z.enum(["ativos", "inativos", "todos"])
    .default("ativos"),

  type: z.nativeEnum(ProductType)
    .optional(),

  categoryId: z.string()
    .optional(),

  brandId: z.string()
    .optional(),

  inStock: z.coerce.boolean()
    .optional(),

  lowStock: z.coerce.boolean()
    .optional(),

  featured: z.coerce.boolean()
    .optional(),

  launch: z.coerce.boolean()
    .optional(),

  abcClass: z.enum(["A", "B", "C"])
    .optional(),

  // Ordenação
  sortBy: z.enum(["name", "sku", "salePrice", "stockQty", "createdAt"])
    .default("createdAt"),

  sortOrder: z.enum(["asc", "desc"])
    .default("desc"),
});

/**
 * Type inference dos schemas
 */
export type CreateProductDTO = z.infer<typeof createProductSchema>;
export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;

/**
 * Helper para limpar campos vazios do DTO
 */
export function sanitizeProductDTO(
  data: CreateProductDTO | UpdateProductDTO
): CreateProductDTO | UpdateProductDTO {
  const sanitized: any = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === "" || value === null) {
      sanitized[key] = undefined;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper para calcular margem de lucro
 *
 * @param salePrice Preço de venda
 * @param costPrice Preço de custo
 * @returns Margem percentual
 *
 * @example
 * calculateMargin(100, 60) // 40
 */
export function calculateMargin(salePrice: number, costPrice: number): number {
  if (costPrice === 0) return 100;
  return ((salePrice - costPrice) / salePrice) * 100;
}

/**
 * Helper para calcular preço de venda baseado em margem desejada
 *
 * @param costPrice Preço de custo
 * @param marginPercent Margem desejada (%)
 * @returns Preço de venda
 *
 * @example
 * calculateSalePrice(60, 40) // 100
 */
export function calculateSalePrice(costPrice: number, marginPercent: number): number {
  return costPrice / (1 - marginPercent / 100);
}

/**
 * Helper para validar se produto está com estoque baixo
 *
 * @param stockQty Quantidade em estoque
 * @param stockMin Estoque mínimo
 * @returns true se estoque está baixo
 */
export function isLowStock(stockQty: number, stockMin: number): boolean {
  return stockQty <= stockMin;
}

/**
 * Helper para validar se produto está fora de estoque
 *
 * @param stockQty Quantidade em estoque
 * @param stockControlled Se o produto tem controle de estoque
 * @returns true se está fora de estoque
 */
export function isOutOfStock(stockQty: number, stockControlled: boolean): boolean {
  return stockControlled && stockQty === 0;
}
