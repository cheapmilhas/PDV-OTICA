import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "lgpd" });

/**
 * Versão atual do termo de consentimento. Incrementa quando o conteúdo do
 * termo muda (afeta /termos e /privacidade). Clientes precisam re-aceitar
 * se a versão mudou.
 */
export const CURRENT_CONSENT_VERSION = "2026-05-25-v1";

/**
 * Escopo de consentimento (Art. 7º LGPD).
 * - personal_data: nome, contato, endereço
 * - health_data: receita oftalmológica (dado sensível, Art. 11)
 * - marketing: comunicações promocionais
 */
export type ConsentScope = "personal_data" | "health_data" | "marketing";

export interface RecordConsentInput {
  customerId: string;
  companyId: string;
  scopes: ConsentScope[];
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Registra consentimento granular do titular dos dados.
 * Idempotente: várias chamadas no mesmo dia são permitidas (cada aceite explícito).
 */
export async function recordConsent(input: RecordConsentInput): Promise<void> {
  await prisma.consentRecord.create({
    data: {
      customerId: input.customerId,
      companyId: input.companyId,
      termVersion: CURRENT_CONSENT_VERSION,
      scope: input.scopes.join(","),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  // Atualiza marcador rápido no Customer (evita join em cada consulta)
  await prisma.customer.update({
    where: { id: input.customerId },
    data: {
      lgpdConsentAt: new Date(),
      lgpdConsentVersion: CURRENT_CONSENT_VERSION,
    } as any,
  });

  log.info("Consent registrado", {
    customerId: input.customerId,
    scopes: input.scopes,
    version: CURRENT_CONSENT_VERSION,
  });
}

/**
 * Revoga consentimento ativo.
 */
export async function revokeConsent(customerId: string): Promise<void> {
  await prisma.consentRecord.updateMany({
    where: { customerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  log.info("Consent revogado", { customerId });
}

export type AccessResourceType = "prescription" | "personal_data" | "export" | "ai_summary";
export type AccessAction = "view" | "edit" | "export" | "delete" | "send_external";

export interface LogAccessInput {
  companyId: string;
  customerId: string;
  userId?: string | null;
  resourceType: AccessResourceType;
  resourceId?: string | null;
  action: AccessAction;
  ipAddress?: string | null;
}

/**
 * Registra acesso a dado pessoal sensível (auditoria LGPD Art. 37).
 * Não-bloqueante: falha de log nunca interrompe operação principal.
 */
export async function logCustomerAccess(input: LogAccessInput): Promise<void> {
  try {
    await prisma.customerAccessLog.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        userId: input.userId ?? null,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        action: input.action,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    log.warn("Falha ao logar acesso LGPD (não-fatal)", { err: String(err) });
  }
}

/**
 * Anonimiza dados pessoais do cliente preservando integridade referencial.
 * Chama em respostas a "direito ao esquecimento" (Art. 18, VI LGPD).
 *
 * Substitui CPF, telefone, email, endereço por valores anonimizados.
 * Mantém ID, vendas, histórico — sem o que pode identificar pessoa natural.
 */
export async function anonymizeCustomer(
  customerId: string,
  companyId: string,
): Promise<void> {
  const anonId = `ANON-${customerId.slice(0, 8)}`;

  await prisma.customer.update({
    where: { id: customerId, companyId } as any,
    data: {
      name: anonId,
      cpf: null,
      rg: null,
      phone: null,
      phone2: null,
      email: null,
      birthDate: null,
      address: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: null,
      state: null,
      zipCode: null,
      notes: null,
      cnpj: null,
      companyName: null,
      tradeName: null,
      acceptsMarketing: false,
      anonymizedAt: new Date(),
    } as any,
  });

  await revokeConsent(customerId);

  log.warn("Cliente anonimizado por solicitação LGPD", { customerId });
}
