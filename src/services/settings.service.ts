import { prisma } from "@/lib/prisma";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";
import { missingMessageTemplates } from "@/lib/settings-templates";
import type { CompanySettingsDTO } from "@/lib/validations/settings.schema";

export const settingsService = {
  /**
   * Busca configurações da empresa.
   *
   * SEC/consistência (auditoria 2026-07-02): antes este GET escrevia no banco em
   * TODA chamada — além do create-se-ausente, fazia um `update` de backfill de
   * templates a cada leitura (não-idempotente, e o create abria corrida entre
   * dois GETs simultâneos de uma empresa nova). Agora:
   *  - Registro EXISTE (caminho de 99,9% dos GETs): LEITURA PURA. Se houver
   *    templates legados NULL, os defaults são mesclados só na RESPOSTA (em
   *    memória) — NÃO grava mais no banco a cada GET.
   *  - Registro AUSENTE (só o 1º acesso de uma empresa): inicialização preguiçosa
   *    via `upsert` (idempotente/race-safe — dois GETs concorrentes não colidem;
   *    o 2º cai no update no-op). Mantém a resposta com o shape COMPLETO da
   *    entidade (id + todas as colunas), do qual a UI de configurações depende.
   */
  async get(companyId: string) {
    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
    });

    if (settings) {
      // Existe com templates legados NULL: mescla defaults só na RESPOSTA (não grava).
      const patch = missingMessageTemplates(settings);
      return Object.keys(patch).length > 0 ? { ...settings, ...patch } : settings;
    }

    // Ausente: inicialização preguiçosa idempotente (upsert fecha a corrida).
    return prisma.companySettings.upsert({
      where: { companyId },
      update: {}, // já existe (corrida) → no-op, só retorna
      create: {
        companyId,
        messageThankYou: DEFAULT_MESSAGES.thankYou,
        messageQuote: DEFAULT_MESSAGES.quote,
        messageReminder: DEFAULT_MESSAGES.reminder,
        messageBirthday: DEFAULT_MESSAGES.birthday,
        defaultQuoteValidDays: 15,
      },
    });
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
