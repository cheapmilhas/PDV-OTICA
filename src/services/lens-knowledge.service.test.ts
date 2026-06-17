import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lensKnowledgeDoc: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
import { prisma } from "@/lib/prisma";
import {
  estimateTokens,
  createDoc,
  listDocs,
  updateDoc,
  deleteDoc,
  buildKnowledgeContext,
  buildGlobalContext,
} from "./lens-knowledge.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lens-knowledge.service", () => {
  describe("estimateTokens", () => {
    it("estima ~4 chars/token (ceil)", () => {
      expect(estimateTokens("abcd")).toBe(1); // ceil(4/4)
    });
    it("string vazia → 0", () => {
      expect(estimateTokens("")).toBe(0);
    });
    it("string longa proporcional (ceil)", () => {
      expect(estimateTokens("a".repeat(10))).toBe(3); // ceil(10/4)=3
      expect(estimateTokens("a".repeat(8))).toBe(2); // ceil(8/4)=2
    });
    it("null/undefined → 0 (guard)", () => {
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });
  });

  describe("createDoc", () => {
    it("cria com tokensEstimate computado do content + companyId null (global)", async () => {
      (prisma.lensKnowledgeDoc.create as any).mockResolvedValue({ id: "d1" });
      await createDoc({ title: "Lentes", content: "abcdefgh", companyId: null, createdByAdminId: "adm1" });
      const arg = (prisma.lensKnowledgeDoc.create as any).mock.calls[0][0];
      expect(arg.data.title).toBe("Lentes");
      expect(arg.data.content).toBe("abcdefgh");
      expect(arg.data.companyId).toBeNull();
      expect(arg.data.tokensEstimate).toBe(2); // ceil(8/4)
      expect(arg.data.createdByAdminId).toBe("adm1");
    });
    it("createdByAdminId default null quando ausente", async () => {
      (prisma.lensKnowledgeDoc.create as any).mockResolvedValue({ id: "d2" });
      await createDoc({ title: "T", content: "abcd", companyId: "A" });
      const arg = (prisma.lensKnowledgeDoc.create as any).mock.calls[0][0];
      expect(arg.data.createdByAdminId).toBeNull();
      expect(arg.data.companyId).toBe("A");
    });
  });

  describe("listDocs", () => {
    it("chama findMany ordenado (admin: todos os docs)", async () => {
      (prisma.lensKnowledgeDoc.findMany as any).mockResolvedValue([]);
      await listDocs();
      const arg = (prisma.lensKnowledgeDoc.findMany as any).mock.calls[0][0];
      expect(arg.orderBy).toEqual([{ companyId: "asc" }, { createdAt: "desc" }]);
      expect(arg.where).toBeUndefined();
    });
  });

  describe("updateDoc", () => {
    it("recomputa tokensEstimate ao mudar content", async () => {
      (prisma.lensKnowledgeDoc.update as any).mockResolvedValue({ id: "d1" });
      await updateDoc("d1", { content: "a".repeat(12) });
      const arg = (prisma.lensKnowledgeDoc.update as any).mock.calls[0][0];
      expect(arg.where).toEqual({ id: "d1" });
      expect(arg.data.content).toBe("a".repeat(12));
      expect(arg.data.tokensEstimate).toBe(3); // ceil(12/4)
    });
    it("seta active sem mexer em tokensEstimate", async () => {
      (prisma.lensKnowledgeDoc.update as any).mockResolvedValue({ id: "d1" });
      await updateDoc("d1", { active: false });
      const arg = (prisma.lensKnowledgeDoc.update as any).mock.calls[0][0];
      expect(arg.data.active).toBe(false);
      expect(arg.data.tokensEstimate).toBeUndefined();
    });
  });

  describe("deleteDoc", () => {
    it("chama delete por id", async () => {
      (prisma.lensKnowledgeDoc.delete as any).mockResolvedValue({ id: "d1" });
      await deleteDoc("d1");
      const arg = (prisma.lensKnowledgeDoc.delete as any).mock.calls[0][0];
      expect(arg).toEqual({ where: { id: "d1" } });
    });
  });

  describe("buildKnowledgeContext (isolamento multi-tenant CRÍTICO)", () => {
    it("retorna global + da ótica A, com WHERE scopado em companyId A", async () => {
      (prisma.lensKnowledgeDoc.findMany as any).mockResolvedValue([
        { title: "Global", content: "abcd", companyId: null },
        { title: "Da ótica A", content: "abcdefgh", companyId: "A" },
      ]);
      const ctx = await buildKnowledgeContext("A");
      const arg = (prisma.lensKnowledgeDoc.findMany as any).mock.calls[0][0];
      expect(arg.where).toEqual({ active: true, OR: [{ companyId: null }, { companyId: "A" }] });
      expect(ctx.docs).toHaveLength(2);
      expect(ctx.docs[0].scope).toBe("global");
      expect(ctx.docs[1].scope).toBe("company");
      expect(ctx.tokens).toBe(1 + 2); // ceil(4/4)+ceil(8/4)
    });

    it("ANTI-LEAK: chamado com B, o WHERE filtra por companyId B (nunca A)", async () => {
      (prisma.lensKnowledgeDoc.findMany as any).mockResolvedValue([]);
      await buildKnowledgeContext("B");
      const arg = (prisma.lensKnowledgeDoc.findMany as any).mock.calls[0][0];
      expect(arg.where).toEqual({ active: true, OR: [{ companyId: null }, { companyId: "B" }] });
      // O companyId no WHERE tem que ser o passado, jamais hardcoded/de outra ótica.
      expect(JSON.stringify(arg.where)).toContain('"companyId":"B"');
      expect(JSON.stringify(arg.where)).not.toContain('"companyId":"A"');
    });

    it("companyId vazio → LANÇA (fail closed)", async () => {
      await expect(buildKnowledgeContext("")).rejects.toThrow();
      expect(prisma.lensKnowledgeDoc.findMany).not.toHaveBeenCalled();
    });

    it("companyId undefined → LANÇA (fail closed)", async () => {
      await expect(buildKnowledgeContext(undefined as unknown as string)).rejects.toThrow();
      expect(prisma.lensKnowledgeDoc.findMany).not.toHaveBeenCalled();
    });
  });

  describe("buildGlobalContext", () => {
    it("WHERE { active:true, companyId:null }; só docs globais (scope global)", async () => {
      (prisma.lensKnowledgeDoc.findMany as any).mockResolvedValue([
        { title: "Global", content: "abcd", companyId: null },
      ]);
      const ctx = await buildGlobalContext();
      const arg = (prisma.lensKnowledgeDoc.findMany as any).mock.calls[0][0];
      expect(arg.where).toEqual({ active: true, companyId: null });
      expect(ctx.docs).toHaveLength(1);
      expect(ctx.docs[0].scope).toBe("global");
      expect(ctx.tokens).toBe(1);
    });
  });
});
