import { z } from "zod";

// Filtros de período
export const periodFilterSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  period: z.enum(["today", "week", "month", "quarter", "year", "custom"]).default("month"),
});

export type PeriodFilterDTO = z.infer<typeof periodFilterSchema>;

// Query para relatório de produtos
export const productReportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  period: z.enum(["today", "week", "month", "quarter", "year", "custom"]).default("month"),
  limit: z.coerce.number().int().min(5).max(100).default(20),
  categoryId: z.string().cuid().optional(),
});

export type ProductReportQueryDTO = z.infer<typeof productReportQuerySchema>;

// Query para relatório de clientes
export const customerReportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  period: z.enum(["today", "week", "month", "quarter", "year", "custom"]).default("month"),
});

export type CustomerReportQueryDTO = z.infer<typeof customerReportQuerySchema>;

// Query para relatório temporal
export const temporalReportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  period: z.enum(["today", "week", "month", "quarter", "year", "custom"]).default("month"),
  groupBy: z.enum(["hour", "dayOfWeek", "day", "month"]).default("dayOfWeek"),
});

export type TemporalReportQueryDTO = z.infer<typeof temporalReportQuerySchema>;

// Query para relatório óptico
export const opticalReportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  period: z.enum(["today", "week", "month", "quarter", "year", "custom"]).default("year"),
});

export type OpticalReportQueryDTO = z.infer<typeof opticalReportQuerySchema>;
