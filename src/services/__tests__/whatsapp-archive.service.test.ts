import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Arquivamento de conversas na troca de número da loja.
 *
 * Prova: preview conta o que seria arquivado; archive marca em lote só o que é
 * anterior ao corte (numberChangedAt) e ainda ativo; unarchive
 * reverte; sem conexão/data → no-op fail-safe (não esconde nada por engano).
 */

const mock = vi.hoisted(() => {
  const state = {
    // conversas: {companyId, lastMessageAt, archivedAt}
    convs: [] as any[],
    // Corte da TROCA REAL de número (não connectedAt — que muda a cada reconexão).
    numberChangedAt: null as Date | null,
  };
  const inScope = (c: any, where: any) =>
    c.companyId === where.companyId &&
    (where.archivedAt === null ? c.archivedAt === null : where.archivedAt?.not !== undefined ? c.archivedAt !== null : true) &&
    (where.lastMessageAt?.lt ? c.lastMessageAt < where.lastMessageAt.lt : true);

  const prisma = {
    whatsappConnection: {
      findUnique: vi.fn(async () => ({ numberChangedAt: state.numberChangedAt })),
    },
    whatsappConversation: {
      count: vi.fn(async ({ where }: any) => state.convs.filter((c) => inScope(c, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const c of state.convs) {
          if (inScope(c, where)) {
            c.archivedAt = data.archivedAt;
            count++;
          }
        }
        return { count };
      }),
    },
  };
  return { state, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mock.prisma }));
vi.mock("@/lib/logger", () => {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return { logger: l };
});

import {
  previewArchiveOldNumber,
  archiveOldNumberConversations,
  unarchiveConversations,
} from "@/services/whatsapp-archive.service";

const CHANGED_AT = new Date("2026-07-01T12:00:00Z"); // número trocou aqui
const OLD = new Date("2026-06-20T10:00:00Z"); // antes → número antigo
const NEW = new Date("2026-07-02T10:00:00Z"); // depois → número novo

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.numberChangedAt = CHANGED_AT;
  mock.state.convs = [
    { companyId: "co1", lastMessageAt: OLD, archivedAt: null }, // antiga, ativa
    { companyId: "co1", lastMessageAt: OLD, archivedAt: null }, // antiga, ativa
    { companyId: "co1", lastMessageAt: NEW, archivedAt: null }, // nova, ativa
    { companyId: "co2", lastMessageAt: OLD, archivedAt: null }, // outra empresa
  ];
});

describe("whatsapp-archive.service", () => {
  it("preview conta só as conversas anteriores ao corte, da empresa, ainda ativas", async () => {
    const r = await previewArchiveOldNumber("co1");
    expect(r.archived).toBe(2); // as 2 antigas de co1 (a nova e a de co2 ficam de fora)
    expect(r.cutoff).toBe(CHANGED_AT.toISOString());
  });

  it("archive marca em lote só as antigas ativas de co1 (não toca na nova nem em co2)", async () => {
    const r = await archiveOldNumberConversations("co1");
    expect(r.archived).toBe(2);
    // a conversa nova de co1 segue ativa; co2 intacta
    expect(mock.state.convs[2].archivedAt).toBeNull();
    expect(mock.state.convs[3].archivedAt).toBeNull();
    expect(mock.state.convs[0].archivedAt).not.toBeNull();
  });

  it("archive é idempotente: rodar de novo não re-arquiva (archivedAt=null já foi consumido)", async () => {
    await archiveOldNumberConversations("co1");
    const again = await archiveOldNumberConversations("co1");
    expect(again.archived).toBe(0);
  });

  it("unarchive reverte todas as arquivadas da empresa", async () => {
    await archiveOldNumberConversations("co1");
    const u = await unarchiveConversations("co1");
    expect(u.unarchived).toBe(2);
    expect(mock.state.convs[0].archivedAt).toBeNull();
  });

  it("sem numberChangedAt (nunca trocou de fato) → no-op fail-safe, não arquiva nada", async () => {
    mock.state.numberChangedAt = null;
    const r = await archiveOldNumberConversations("co1");
    expect(r.archived).toBe(0);
    expect(r.cutoff).toBeNull();
    expect(mock.state.convs.every((c) => c.archivedAt === null)).toBe(true);
  });

  it("override de corte (mode all-current): arquiva tudo até o corte passado, mesmo sem numberChangedAt", async () => {
    // Dono trocou o número ANTES da feature existir → sem numberChangedAt, mas
    // confirma "arquivar tudo agora". A rota passa cutoff=now (aqui NEW+1min).
    mock.state.numberChangedAt = null;
    const cutoff = new Date(NEW.getTime() + 60_000);
    const r = await archiveOldNumberConversations("co1", cutoff);
    // as 3 conversas de co1 (2 antigas + 1 "nova", todas antes do corte) arquivam.
    expect(r.archived).toBe(3);
    expect(mock.state.convs[3].archivedAt).toBeNull(); // co2 intacta
  });
});
