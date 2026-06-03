import { prisma } from "@/lib/prisma";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";
import { missingMessageTemplates } from "@/lib/settings-templates";
import type { CompanySettingsDTO } from "@/lib/validations/settings.schema";

export const settingsService = {
  /**
   * Busca configurações da empresa (cria se não existir)
   */
  async get(companyId: string) {
    let settings = await prisma.companySettings.findUnique({
      where: { companyId },
    });

    // Se não existir, criar com valores padrão
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyId,
          messageThankYou: DEFAULT_MESSAGES.thankYou,
          messageQuote: DEFAULT_MESSAGES.quote,
          messageReminder: DEFAULT_MESSAGES.reminder,
          messageBirthday: DEFAULT_MESSAGES.birthday,
          defaultQuoteValidDays: 15,
        },
      });
      return settings;
    }

    // Backfill de templates legados (drift de schema): registros criados antes
    // das colunas de mensagem existirem ficaram com NULL e travavam os botões
    // de WhatsApp (Agradecer/Orçamento/Lembrete/Aniversário). Preenche só o que
    // falta, num único update — idempotente (após o 1º GET o patch fica vazio).
    const patch = missingMessageTemplates(settings);
    if (Object.keys(patch).length > 0) {
      settings = await prisma.companySettings.update({
        where: { companyId },
        data: patch,
      });
    }

    return settings;
  },

  /**
   * Atualiza configurações da empresa
   */
  async update(companyId: string, data: CompanySettingsDTO) {
    // Verificar se existe
    const existing = await prisma.companySettings.findUnique({
      where: { companyId },
    });

    if (existing) {
      return prisma.companySettings.update({
        where: { companyId },
        data,
      });
    } else {
      return prisma.companySettings.create({
        data: {
          companyId,
          ...data,
        },
      });
    }
  },

  /**
   * Restaura mensagem para padrão
   */
  async resetMessage(
    companyId: string,
    messageType: "thankYou" | "quote" | "reminder" | "birthday"
  ) {
    const fieldMap = {
      thankYou: "messageThankYou",
      quote: "messageQuote",
      reminder: "messageReminder",
      birthday: "messageBirthday",
    };

    return prisma.companySettings.update({
      where: { companyId },
      data: {
        [fieldMap[messageType]]: DEFAULT_MESSAGES[messageType],
      },
    });
  },
};
