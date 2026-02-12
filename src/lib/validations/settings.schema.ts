import { z } from "zod";

export const companySettingsSchema = z.object({
  // Dados da empresa
  displayName: z.string().min(1, "Nome é obrigatório").optional(),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),

  // Mensagens
  messageThankYou: z.string().optional(),
  messageQuote: z.string().optional(),
  messageReminder: z.string().optional(),
  messageBirthday: z.string().optional(),

  // PDF
  pdfHeaderText: z.string().optional(),
  pdfFooterText: z.string().optional(),

  // Orçamento
  defaultQuoteValidDays: z.coerce.number().int().min(1).max(365).default(15),
  defaultPaymentTerms: z.string().optional(),
});

export type CompanySettingsDTO = z.infer<typeof companySettingsSchema>;
