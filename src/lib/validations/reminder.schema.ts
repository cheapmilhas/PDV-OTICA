import { z } from "zod";

export const reminderConfigSchema = z.object({
  prescriptionReminderEnabled: z.boolean().default(true),
  prescriptionReminderDays: z.coerce.number().int().min(1).max(90).default(30),
  prescriptionValidityMonths: z.coerce.number().int().min(1).max(24).default(12),
  inactiveReminderEnabled: z.boolean().default(true),
  inactiveAfterDays: z.coerce.number().int().min(30).max(365).default(180),
  birthdayReminderEnabled: z.boolean().default(true),
  birthdayReminderDaysBefore: z.coerce.number().int().min(0).max(7).default(0),
  cashbackExpiringReminderEnabled: z.boolean().default(true),
  cashbackExpiringDaysBefore: z.coerce.number().int().min(1).max(30).default(7),
});

export type ReminderConfigDTO = z.infer<typeof reminderConfigSchema>;

export const updateReminderSchema = z.object({
  status: z.enum(["COMPLETED", "DISMISSED", "SKIPPED"]),
  dismissReason: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type UpdateReminderDTO = z.infer<typeof updateReminderSchema>;

export const createContactSchema = z.object({
  customerId: z.string().cuid(),
  type: z.enum([
    "PRESCRIPTION_REMINDER",
    "BIRTHDAY_GREETING",
    "INACTIVE_REACTIVATION",
    "CASHBACK_EXPIRING",
    "CASHBACK_AVAILABLE",
    "SALE_THANK_YOU",
    "CUSTOM"
  ]),
  channel: z.enum(["WHATSAPP", "PHONE", "EMAIL", "SMS"]).default("WHATSAPP"),
  status: z.enum(["SENT", "CONFIRMED", "SKIPPED", "FAILED"]).default("SENT"),
  message: z.string().optional(),
  notes: z.string().max(500).optional(),
  reminderId: z.string().cuid().optional(),
});

export type CreateContactDTO = z.infer<typeof createContactSchema>;

export const reminderQuerySchema = z.object({
  type: z.enum([
    "PRESCRIPTION_REMINDER",
    "BIRTHDAY_GREETING",
    "INACTIVE_REACTIVATION",
    "CASHBACK_EXPIRING",
    "CASHBACK_AVAILABLE"
  ]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "DISMISSED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export type ReminderQueryDTO = z.infer<typeof reminderQuerySchema>;
