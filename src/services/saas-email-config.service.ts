import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface SaasEmailConfigPatch {
  masterEnabled?: boolean;
  testMode?: boolean;
  testEmail?: string | null;
  welcomeEnabled?: boolean;
  trialEndingEnabled?: boolean;
  trialExpiredEnabled?: boolean;
  invoiceOverdueEnabled?: boolean;
  paymentConfirmedEnabled?: boolean;
  subscriptionSuspendedEnabled?: boolean;
  subscriptionCanceledEnabled?: boolean;
}

/** Lê (e garante) o registro único de config dos emails do SaaS. */
export async function getSaasEmailConfig() {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Atualiza o singleton registrando quem mudou. */
export async function updateSaasEmailConfig(patch: SaasEmailConfigPatch, updatedBy?: string) {
  return prisma.saasEmailConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...patch, updatedBy },
    update: { ...patch, updatedBy },
  });
}
