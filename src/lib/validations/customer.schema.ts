import { z } from "zod";

/**
 * Regex para validação de CPF (apenas números, 11 dígitos)
 */
const CPF_REGEX = /^\d{11}$/;

/**
 * Regex para validação de telefone brasileiro
 * Aceita: (99) 99999-9999 ou 99999999999
 */
const PHONE_REGEX = /^(\(\d{2}\)\s?)?[\s9]?\d{4,5}-?\d{4}$/;

/**
 * Schema para criação de cliente
 *
 * Campos obrigatórios: name
 * Campos opcionais: todos os outros
 */
export const createCustomerSchema = z.object({
  // Dados pessoais
  name: z.string()
    .min(3, "Nome deve ter no mínimo 3 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),

  cpf: z.string()
    .regex(CPF_REGEX, "CPF inválido (deve conter 11 dígitos)")
    .optional()
    .or(z.literal("")),

  rg: z.string()
    .max(20, "RG deve ter no máximo 20 caracteres")
    .optional()
    .or(z.literal("")),

  email: z.string()
    .email("Email inválido")
    .optional()
    .or(z.literal("")),

  phone: z.string()
    .max(20, "Telefone deve ter no máximo 20 caracteres")
    .optional()
    .or(z.literal("")),

  phone2: z.string()
    .max(20, "Telefone 2 deve ter no máximo 20 caracteres")
    .optional()
    .or(z.literal("")),

  birthDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (formato: AAAA-MM-DD)")
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      if (!val || val === "") return undefined;
      // Converte formato date (YYYY-MM-DD) para ISO datetime para o Prisma
      return new Date(val + "T00:00:00.000Z").toISOString();
    }),

  gender: z.enum(["M", "F", "Outro"])
    .optional()
    .or(z.literal("")),

  // Endereço
  address: z.string()
    .max(200, "Endereço deve ter no máximo 200 caracteres")
    .optional()
    .or(z.literal("")),

  number: z.string()
    .max(20, "Número deve ter no máximo 20 caracteres")
    .optional()
    .or(z.literal("")),

  complement: z.string()
    .max(100, "Complemento deve ter no máximo 100 caracteres")
    .optional()
    .or(z.literal("")),

  neighborhood: z.string()
    .max(100, "Bairro deve ter no máximo 100 caracteres")
    .optional()
    .or(z.literal("")),

  city: z.string()
    .max(100, "Cidade deve ter no máximo 100 caracteres")
    .optional()
    .or(z.literal("")),

  state: z.string()
    .length(2, "Estado deve ter 2 caracteres (UF)")
    .optional()
    .or(z.literal("")),

  zipCode: z.string()
    .max(10, "CEP deve ter no máximo 10 caracteres")
    .optional()
    .or(z.literal("")),

  // Marketing e observações
  acceptsMarketing: z.boolean()
    .default(true),

  referralSource: z.string()
    .max(100, "Origem deve ter no máximo 100 caracteres")
    .optional()
    .or(z.literal("")),

  notes: z.string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),

  // Status (geralmente não vem do frontend no create, mas pode vir no update)
  active: z.boolean()
    .optional()
    .default(true),
});

/**
 * Schema para atualização de cliente
 * Todos os campos são opcionais
 */
export const updateCustomerSchema = createCustomerSchema.partial();

/**
 * Schema para query params de listagem de clientes
 */
export const customerQuerySchema = z.object({
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

  city: z.string()
    .optional(),

  referralSource: z.string()
    .optional(),

  // Ordenação
  sortBy: z.enum(["name", "createdAt", "city"])
    .default("createdAt"),

  sortOrder: z.enum(["asc", "desc"])
    .default("desc"),
});

/**
 * Type inference dos schemas
 */
export type CreateCustomerDTO = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDTO = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

/**
 * Helper para limpar campos vazios do DTO
 * Converte "" para undefined para não salvar strings vazias no banco
 */
export function sanitizeCustomerDTO(
  data: CreateCustomerDTO | UpdateCustomerDTO
): CreateCustomerDTO | UpdateCustomerDTO {
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
 * Helper para validar CPF (algoritmo)
 * Retorna true se CPF é válido, false caso contrário
 */
export function validateCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  const cleanCPF = cpf.replace(/\D/g, "");

  if (cleanCPF.length !== 11) return false;

  // Verifica se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1+$/.test(cleanCPF)) return false;

  // Validação dos dígitos verificadores
  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}
