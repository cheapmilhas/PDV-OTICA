import { z } from "zod";

/**
 * Schema para criar supplier
 */
export const createSupplierSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  tradeName: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email("Email inválido").nullable().optional().or(z.literal("")),
  website: z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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
  city: z.string().optional(),
  state: z.string().length(2).optional().or(z.literal("")),
  startDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
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
