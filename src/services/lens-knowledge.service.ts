import { prisma } from "@/lib/prisma";

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4); // heurística ~4 chars/token (aproximação v1)
}

export interface KnowledgeDocInput {
  title: string;
  content: string;
  companyId: string | null; // null = global
  createdByAdminId?: string | null;
}

export async function createDoc(input: KnowledgeDocInput) {
  return prisma.lensKnowledgeDoc.create({
    data: {
      title: input.title,
      content: input.content,
      companyId: input.companyId,
      tokensEstimate: estimateTokens(input.content),
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
}

export async function listDocs() {
  return prisma.lensKnowledgeDoc.findMany({ orderBy: [{ companyId: "asc" }, { createdAt: "desc" }] });
}

export async function updateDoc(id: string, patch: Partial<{ title: string; content: string; active: boolean }>) {
  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string") data.title = patch.title;
  if (typeof patch.content === "string") {
    data.content = patch.content;
    data.tokensEstimate = estimateTokens(patch.content);
  }
  if (typeof patch.active === "boolean") data.active = patch.active;
  return prisma.lensKnowledgeDoc.update({ where: { id }, data });
}

export async function deleteDoc(id: string) {
  return prisma.lensKnowledgeDoc.delete({ where: { id } });
}

export interface KnowledgeContext {
  docs: { title: string; content: string; scope: "global" | "company" }[];
  tokens: number;
}

/**
 * Contexto curado para o fluxo do VENDEDOR: docs globais ativos + docs ativos
 * DAQUELA ótica. companyId OBRIGATÓRIO e tipado — falha fechada (lança) se
 * ausente, p/ nunca vazar corpus entre óticas.
 */
export async function buildKnowledgeContext(companyId: string): Promise<KnowledgeContext> {
  if (!companyId || typeof companyId !== "string") {
    throw new Error("buildKnowledgeContext: companyId obrigatório (isolamento multi-tenant)");
  }
  const rows = await prisma.lensKnowledgeDoc.findMany({
    where: { active: true, OR: [{ companyId: null }, { companyId }] },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }],
  });
  const docs = rows.map((r) => ({
    title: r.title,
    content: r.content,
    scope: (r.companyId === null ? "global" : "company") as "global" | "company",
  }));
  return { docs, tokens: docs.reduce((s, d) => s + estimateTokens(d.content), 0) };
}

/** Só os docs GLOBAIS ativos — usado pelo playground quando testa "só global". */
export async function buildGlobalContext(): Promise<KnowledgeContext> {
  const rows = await prisma.lensKnowledgeDoc.findMany({
    where: { active: true, companyId: null },
    orderBy: { createdAt: "asc" },
  });
  const docs = rows.map((r) => ({ title: r.title, content: r.content, scope: "global" as const }));
  return { docs, tokens: docs.reduce((s, d) => s + estimateTokens(d.content), 0) };
}
