import { z } from "zod";
import { checkRange } from "@/lib/prescription-grade-ranges";

/**
 * Schema do grau digitado no Livro de Receitas (rota PATCH .../grau).
 *
 * Cada campo com faixa clínica é validado pela fonte única `checkRange`
 * (aceita vírgula/ponto; vazio/null = válido). prisma/base não têm faixa.
 * Extraído da rota para poder ser testado isoladamente.
 */

/** Campo de string opcional/nulável que valida sua própria faixa de dioptria. */
function gradeField(field: string) {
  return z
    .string()
    .optional()
    .nullable()
    .refine((v) => checkRange(field, v), { message: `${field} fora da faixa clínica` });
}

const eyeSchema = z
  .object({
    esf: gradeField("esf"),
    cil: gradeField("cil"),
    eixo: gradeField("eixo"),
    dnp: gradeField("dnp"),
    altura: gradeField("altura"),
    add: gradeField("add"),
    prisma: z.string().optional().nullable(),
    base: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

export const gradeSchema = z.object({
  od: eyeSchema,
  oe: eyeSchema,
  adicao: gradeField("add"),
  isDependente: z.boolean().optional(),
  patientName: z.string().max(120).optional().nullable(),
  patientBirthDate: z.coerce.date().optional().nullable(),
});

export type GradeSchemaDTO = z.infer<typeof gradeSchema>;
