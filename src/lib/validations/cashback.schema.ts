import { z } from "zod";

/**
 * Schema de configuração do cashback
 */
export const cashbackConfigSchema = z.object({
  isActive: z.boolean().default(true),
  earnPercent: z.coerce.number().min(0).max(100).default(5),
  minPurchaseToEarn: z.coerce.number().min(0).default(0),
  maxCashbackPerSale: z.coerce.number().min(0).nullable().optional(),
  expirationDays: z.coerce.number().int().min(0).nullable().optional(),
  minPurchaseMultiplier: z.coerce.number().min(1).max(10).default(2),
  maxUsagePercent: z.coerce.number().min(0).max(100).default(50),
  birthdayMultiplier: z.coerce.number().min(0).max(10).default(2),
  birthdayDaysRange: z.coerce.number().int().min(0).max(30).default(7),
});

export type CashbackConfigDTO = z.infer<typeof cashbackConfigSchema>;

/**
 * Schema para usar cashback
 */
export const useCashbackSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive(),
  saleId: z.string().cuid().optional(),
  description: z.string().max(200).optional(),
});

export type UseCashbackDTO = z.infer<typeof useCashbackSchema>;

/**
 * Schema para ajuste manual de cashback
 */
export const adjustCashbackSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().refine((val) => val !== 0, {
    message: "Amount cannot be zero",
  }),
  // ADJUSTMENT é o valor real do enum Prisma (CashbackMovementType). CORRECTION
  // é aceito por retrocompat — o service mapeia qualquer não-BONUS p/ ADJUSTMENT.
  type: z.enum(["BONUS", "ADJUSTMENT", "CORRECTION"]),
  description: z.string().min(3).max(200),
}).refine((d) => !(d.type === "BONUS" && d.amount < 0), {
  message: "Bônus não pode ser negativo (use ADJUSTMENT para débito).",
  path: ["amount"],
});

export type AdjustCashbackDTO = z.infer<typeof adjustCashbackSchema>;

/**
 * Schema para query de histórico
 */
export const cashbackHistoryQuerySchema = z.object({
  customerId: z.string().cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CashbackHistoryQueryDTO = z.infer<typeof cashbackHistoryQuerySchema>;

/**
 * Schema para validar uso de cashback
 */
export const validateCashbackUsageSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive(),
  saleTotal: z.coerce.number().positive(),
});

export type ValidateCashbackUsageDTO = z.infer<typeof validateCashbackUsageSchema>;
