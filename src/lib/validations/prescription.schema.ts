import { z } from "zod";

export const prescriptionSchema = z.object({
  customerId: z.string().cuid(),
  doctorId: z.string().cuid().optional().nullable(),

  issuedAt: z.coerce.date(),
  prescriptionType: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),

  // Valores da receita (OD e OE)
  values: z.object({
    // Olho Direito
    odSph: z.coerce.number().min(-30).max(30).optional().nullable(),
    odCyl: z.coerce.number().min(-10).max(10).optional().nullable(),
    odAxis: z.coerce.number().int().min(0).max(180).optional().nullable(),
    odAdd: z.coerce.number().min(0.5).max(4).optional().nullable(),
    odPrism: z.coerce.number().min(0).max(10).optional().nullable(),
    odBase: z.string().max(10).optional().nullable(),

    // Olho Esquerdo
    oeSph: z.coerce.number().min(-30).max(30).optional().nullable(),
    oeCyl: z.coerce.number().min(-10).max(10).optional().nullable(),
    oeAxis: z.coerce.number().int().min(0).max(180).optional().nullable(),
    oeAdd: z.coerce.number().min(0.5).max(4).optional().nullable(),
    oePrism: z.coerce.number().min(0).max(10).optional().nullable(),
    oeBase: z.string().max(10).optional().nullable(),

    // Medidas adicionais
    pdFar: z.coerce.number().min(20).max(80).optional().nullable(),
    pdNear: z.coerce.number().min(20).max(80).optional().nullable(),
    fittingHeightOd: z.coerce.number().min(10).max(40).optional().nullable(),
    fittingHeightOe: z.coerce.number().min(10).max(40).optional().nullable(),
    pantoscopicAngle: z.coerce.number().min(0).max(30).optional().nullable(),
    vertexDistance: z.coerce.number().min(0).max(30).optional().nullable(),
    frameCurvature: z.coerce.number().min(0).max(10).optional().nullable(),
  }).optional().nullable(),
});

export type PrescriptionDTO = z.infer<typeof prescriptionSchema>;

export const prescriptionQuerySchema = z.object({
  customerId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});
