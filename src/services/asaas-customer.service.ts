import { prisma as defaultPrisma } from "@/lib/prisma";
import { asaas as defaultAsaas } from "@/lib/asaas";

interface ResolveArgs {
  name: string;
  email: string;
  cpfCnpjRaw: string;
  mobilePhone?: string;
  externalReference: string;
}

/**
 * Resolve (find-or-create) um customer no Asaas a partir de dados puros.
 *
 * Não toca no banco. Normaliza o CPF/CNPJ para somente dígitos, valida o
 * tamanho (11 = CPF, 14 = CNPJ), tenta localizar por CPF/CNPJ e só cria caso
 * não exista.
 */
export async function resolveAsaasCustomerId(
  args: ResolveArgs,
  deps: { asaasClient?: typeof defaultAsaas } = {},
): Promise<{ asaasCustomerId: string; created: boolean }> {
  const asaas = deps.asaasClient ?? defaultAsaas;

  const cpfCnpj = args.cpfCnpjRaw.replace(/\D/g, "");
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    throw new Error("CPF/CNPJ inválido ou ausente");
  }

  const found = await asaas.customers.findByCpfCnpj(cpfCnpj);
  if (found) {
    // Customers pré-existentes (criados antes do silenciamento) ainda têm a
    // notificação automática do Asaas ligada — o que faz o cliente receber DOIS
    // emails (o do Asaas + o nosso). Garante notificationDisabled também neles.
    if (found.notificationDisabled !== true) {
      await asaas.customers.update(found.id, { notificationDisabled: true });
    }
    return { asaasCustomerId: found.id, created: false };
  }

  const created = await asaas.customers.create({
    name: args.name,
    email: args.email,
    cpfCnpj,
    mobilePhone: args.mobilePhone,
    externalReference: args.externalReference,
    notificationDisabled: true, // silencia o email automático do Asaas
  });

  return { asaasCustomerId: created.id, created: true };
}

/**
 * Garante que a subscription (não-cancelada mais recente) da empresa possui um
 * customer Asaas associado, criando-o via find-or-create quando necessário.
 *
 * - No-op idempotente quando a subscription já tem `asaasCustomerId`.
 * - Persiste o `asaasCustomerId` na subscription quando o resolve cria/encontra.
 */
export async function ensureAsaasCustomer(
  companyId: string,
  deps: {
    prismaClient?: typeof defaultPrisma;
    asaasClient?: typeof defaultAsaas;
  } = {},
): Promise<{ asaasCustomerId: string; created: boolean }> {
  const prisma = deps.prismaClient ?? defaultPrisma;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, cnpj: true, email: true, phone: true },
  });
  if (!company) {
    throw new Error("Empresa não encontrada");
  }

  let sub = await prisma.subscription.findFirst({
    where: { companyId, status: { not: "CANCELED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) {
    sub = await prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!sub) {
    throw new Error("Empresa sem subscription");
  }

  if (sub.asaasCustomerId) {
    return { asaasCustomerId: sub.asaasCustomerId, created: false };
  }

  const r = await resolveAsaasCustomerId(
    {
      name: company.name,
      email: company.email ?? "",
      cpfCnpjRaw: company.cnpj ?? "",
      mobilePhone: company.phone ?? undefined,
      externalReference: `company:${companyId}`,
    },
    { asaasClient: deps.asaasClient },
  );

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { asaasCustomerId: r.asaasCustomerId },
  });

  return r;
}
