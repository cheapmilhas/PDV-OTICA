import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "global";

/**
 * Config GLOBAL das travas anti-bloqueio do WhatsApp (Fase 2), editável pelo
 * super admin. Singleton id="global" (igual AiGlobalConfig). Os defaults do
 * model = valores da Fase 1, então criar o registro não muda o comportamento.
 *
 * staleMin NÃO é exposto na UI (técnico) — fica no default do model.
 */
export interface WhatsappGlobalConfigView {
  openHour: number;
  closeHour: number;
  dailyCap: number;
  skipSaturday: boolean;
}

export async function getWhatsappGlobalConfig(): Promise<WhatsappGlobalConfigView> {
  const c = await prisma.whatsappGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return {
    openHour: c.openHour,
    closeHour: c.closeHour,
    dailyCap: c.dailyCap,
    skipSaturday: c.skipSaturday,
  };
}

export interface UpdateWhatsappGlobalConfigInput {
  openHour?: number;
  closeHour?: number;
  dailyCap?: number;
  skipSaturday?: boolean;
}

/** Limites de sanidade (anti-tiro-no-pé). Validados também na rota. */
export const WA_BOUNDS = {
  openHourMin: 0,
  openHourMax: 23,
  closeHourMin: 1,
  closeHourMax: 24,
  dailyCapMin: 1,
  dailyCapMax: 500,
} as const;

/**
 * Valida um conjunto (parcial) de limites. Retorna mensagem de erro ou null.
 * Considera os valores ATUAIS para a regra closeHour > openHour quando só um
 * dos dois vem no patch.
 */
export function validateWhatsappLimits(
  patch: UpdateWhatsappGlobalConfigInput,
  current: { openHour: number; closeHour: number },
): string | null {
  const openHour = patch.openHour ?? current.openHour;
  const closeHour = patch.closeHour ?? current.closeHour;

  if (patch.openHour != null && (patch.openHour < WA_BOUNDS.openHourMin || patch.openHour > WA_BOUNDS.openHourMax)) {
    return `Hora de abertura deve estar entre ${WA_BOUNDS.openHourMin} e ${WA_BOUNDS.openHourMax}.`;
  }
  if (patch.closeHour != null && (patch.closeHour < WA_BOUNDS.closeHourMin || patch.closeHour > WA_BOUNDS.closeHourMax)) {
    return `Hora de fechamento deve estar entre ${WA_BOUNDS.closeHourMin} e ${WA_BOUNDS.closeHourMax}.`;
  }
  if (closeHour <= openHour) {
    return "A hora de fechamento deve ser maior que a de abertura.";
  }
  if (patch.dailyCap != null && (patch.dailyCap < WA_BOUNDS.dailyCapMin || patch.dailyCap > WA_BOUNDS.dailyCapMax)) {
    return `Teto diário deve estar entre ${WA_BOUNDS.dailyCapMin} e ${WA_BOUNDS.dailyCapMax}.`;
  }
  return null;
}

export async function updateWhatsappGlobalConfig(
  patch: UpdateWhatsappGlobalConfigInput,
): Promise<WhatsappGlobalConfigView> {
  const data: Record<string, unknown> = {};
  if (typeof patch.openHour === "number") data.openHour = patch.openHour;
  if (typeof patch.closeHour === "number") data.closeHour = patch.closeHour;
  if (typeof patch.dailyCap === "number") data.dailyCap = patch.dailyCap;
  if (typeof patch.skipSaturday === "boolean") data.skipSaturday = patch.skipSaturday;

  await prisma.whatsappGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  return getWhatsappGlobalConfig();
}
