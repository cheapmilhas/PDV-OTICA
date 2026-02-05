import { z } from "zod";

/**
 * Schema para criar supplier
 */
export const createSupplierSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateSupplierDTO = z.infer<typeof createSupplierSchema>;

/**
 * Schema para atualizar supplier
 */
export const updateSupplierSchema = createSupplierSchema.partial().extend({
  active: z.boolean().optional(),
});

export type UpdateSupplierDTO = z.infer<typeof updateSupplierSchema>;

/**
 * Schema para query de suppliers (GET /api/suppliers)
 */
export const supplierQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
  sortBy: z.enum(["name", "createdAt", "city"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type SupplierQuery = z.infer<typeof supplierQuerySchema>;

/**
 * Remove campos vazios/undefined de um DTO
 */
export function sanitizeSupplierDTO(data: any) {
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== "" && value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
