import { z } from "zod";

export const createExamAppointmentSchema = z.object({
  leadId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  assignedUserId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export type CreateExamAppointmentSchema = z.infer<typeof createExamAppointmentSchema>;

export const updateExamAppointmentSchema = z
  .object({
    status: z.enum(["SCHEDULED", "ATTENDED", "NO_SHOW", "CANCELLED"]).optional(),
    scheduledAt: z.coerce.date().optional(),
  })
  .refine((d) => d.status !== undefined || d.scheduledAt !== undefined, {
    message: "Informe status ou nova data",
  });

export type UpdateExamAppointmentSchema = z.infer<typeof updateExamAppointmentSchema>;
