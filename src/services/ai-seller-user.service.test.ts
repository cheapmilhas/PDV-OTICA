import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: vi.fn(), create: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { getOrCreateAiSellerUser } from "./ai-seller-user.service";

beforeEach(() => vi.clearAllMocks());

describe("getOrCreateAiSellerUser", () => {
  it("retorna o robô existente sem criar", async () => {
    (prisma.user.findFirst as any).mockResolvedValue({ id: "u_bot" });
    const id = await getOrCreateAiSellerUser("co1");
    expect(id).toBe("u_bot");
    expect(prisma.user.create).not.toHaveBeenCalled();
    const where = (prisma.user.findFirst as any).mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
  });

  it("cria robô ATENDENTE isSystem quando não existe", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: "u_new" });
    const id = await getOrCreateAiSellerUser("co1");
    expect(id).toBe("u_new");
    const data = (prisma.user.create as any).mock.calls[0][0].data;
    expect(data.companyId).toBe("co1");
    expect(data.role).toBe("ATENDENTE");
    expect(data.active).toBe(true);
    expect(data.isSystem).toBe(true);
    expect(data.email).toContain("co1");
    expect(typeof data.passwordHash).toBe("string");
    expect(data.passwordHash.length).toBeGreaterThan(0);
  });

  it("race: se create falha com P2002, relê e retorna o existente", async () => {
    (prisma.user.findFirst as any).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u_race" });
    const err: any = new Error("unique"); err.code = "P2002";
    (prisma.user.create as any).mockRejectedValue(err);
    const id = await getOrCreateAiSellerUser("co1");
    expect(id).toBe("u_race");
  });
});
