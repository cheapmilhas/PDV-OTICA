import { headers } from "next/headers";
import { createTenantPrismaClient, TenantPrismaClient } from "./prisma-tenant";

interface TenantContext {
  companyId: string;
  networkId: string | null;
  prisma: TenantPrismaClient;
}

/**
 * Obtém o contexto do tenant (companyId) do header da request
 * IMPORTANTE: Deve ser chamado apenas em Server Components ou API Routes
 * O middleware injeta o companyId no header x-company-id
 */
export async function getTenantContext(): Promise<TenantContext> {
  const headersList = await headers();
  const companyId = headersList.get("x-company-id");
  const networkId = headersList.get("x-network-id");

  if (!companyId) {
    throw new Error("Tenant não identificado. Certifique-se de estar autenticado.");
  }

  const prisma = createTenantPrismaClient(companyId, networkId);

  return {
    companyId,
    networkId,
    prisma,
  };
}
