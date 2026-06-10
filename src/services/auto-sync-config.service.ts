import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface AutoSyncPatch {
  isEnabled?: boolean;
  dryRun?: boolean;
}

/** Lê (e garante) o registro único de configuração da sincronização automática. */
export async function getAutoSyncConfig() {
  return prisma.autoSyncConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Atualiza o singleton (liga/desliga, modo) registrando quem mudou. */
export async function updateAutoSyncConfig(patch: AutoSyncPatch, updatedBy?: string) {
  return prisma.autoSyncConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...patch, updatedBy },
    update: { ...patch, updatedBy },
  });
}
