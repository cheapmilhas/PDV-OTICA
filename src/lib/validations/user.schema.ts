import { z } from "zod";

/**
 * Enum de roles (sincronizado com Prisma)
 */
export const UserRoleEnum = z.enum(["ADMIN", "GERENTE", "VENDEDOR", "CAIXA", "ATENDENTE"]);

/**
 * Schema para criar usuário
 */
export const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  role: UserRoleEnum,
  defaultCommissionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  active: z.boolean().default(true),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;

/**
 * Schema para atualizar usuário
 */
export const updateUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  email: z.string().email("Email inválido").optional(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").optional(),
  role: UserRoleEnum.optional(),
  defaultCommissionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  active: z.boolean().optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;

/**
 * Schema para query de usuários (GET /api/users)
 */
export const userQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
  role: UserRoleEnum.optional(),
  sortBy: z.enum(["name", "email", "createdAt", "role"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type UserQuery = z.infer<typeof userQuerySchema>;

/**
 * Remove campos vazios/undefined de um DTO
 */
export function sanitizeUserDTO(data: any) {
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== "" && value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
