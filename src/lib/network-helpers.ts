import { prisma } from "@/lib/prisma";

/**
 * Retorna os IDs de todas as empresas da rede de uma empresa.
 * Se a empresa não está em rede, retorna apenas o próprio ID.
 */
export async function getNetworkCompanyIds(companyId: string): Promise<string[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { networkId: true },
  });

  if (!company?.networkId) return [companyId];

  const networkCompanies = await prisma.company.findMany({
    where: { networkId: company.networkId, isBlocked: false },
    select: { id: true },
  });

  return networkCompanies.map((c) => c.id);
}

/**
 * Retorna as configurações de compartilhamento da rede.
 */
export async function getNetworkConfig(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { network: true },
  });

  return {
    hasNetwork: !!company?.networkId,
    networkId: company?.networkId ?? null,
    networkName: company?.network?.name ?? null,
    sharedCatalog: company?.network?.sharedCatalog ?? false,
    sharedCustomers: company?.network?.sharedCustomers ?? false,
    sharedPricing: company?.network?.sharedPricing ?? false,
    sharedSuppliers: company?.network?.sharedSuppliers ?? false,
  };
}
