import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const AI_BOT_EMAIL = (companyId: string) => `ia-bot@${companyId}.vis.local`;
const AI_BOT_NAME = "IA (Funil WhatsApp)";

/**
 * id de um User-robô (isSystem, role ATENDENTE) da empresa, criando-o se preciso.
 * Usado como sellerUserId dos leads que a IA cria. Idempotente.
 * Excluído da tela de equipe (user.service.list filtra isSystem).
 * passwordHash aleatório e inutilizável: o robô NUNCA loga (bcrypt.compare falha).
 */
export async function getOrCreateAiSellerUser(companyId: string): Promise<string> {
  const email = AI_BOT_EMAIL(companyId);
  const existing = await prisma.user.findFirst({ where: { companyId, email }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await prisma.user.create({
      data: {
        companyId, name: AI_BOT_NAME, email,
        passwordHash: randomBytes(32).toString("hex"),
        role: "ATENDENTE", active: true, isSystem: true,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e: unknown) {
    const again = await prisma.user.findFirst({ where: { companyId, email }, select: { id: true } });
    if (again) return again.id;
    throw e;
  }
}
