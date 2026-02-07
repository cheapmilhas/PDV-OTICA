import { z } from "zod";

/**
 * Schema para abertura de caixa
 */
export const openShiftSchema = z.object({
  branchId: z.string().min(1, "Branch ID é obrigatório"),
  openingFloatAmount: z.number().min(0, "Valor de abertura deve ser >= 0"),
  notes: z.string().optional(),
});

export type OpenShiftDTO = z.infer<typeof openShiftSchema>;

/**
 * Schema para fechamento de caixa
 */
export const closeShiftSchema = z.object({
  closingDeclaredCash: z.number().min(0, "Valor declarado deve ser >= 0"),
  differenceJustification: z.string().optional(),
  notes: z.string().optional(),
});

export type CloseShiftDTO = z.infer<typeof closeShiftSchema>;

/**
 * Schema para movimento de caixa (sangria/suprimento)
 */
export const cashMovementSchema = z.object({
  type: z.enum(["SUPPLY", "WITHDRAWAL"], {
    message: "Tipo deve ser SUPPLY ou WITHDRAWAL",
  }),
  amount: z.number().positive("Valor deve ser maior que 0"),
  method: z.enum(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD", "OTHER"]).default("CASH"),
  note: z.string().optional(),
});

export type CashMovementDTO = z.infer<typeof cashMovementSchema>;
