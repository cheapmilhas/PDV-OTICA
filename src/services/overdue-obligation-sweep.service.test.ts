import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import {
  sweepOverdueObligations,
  type SweepDbClient,
} from "./overdue-obligation-sweep.service";

/**
 * O buraco do escritor único.
 *
 * Até esta entrega existia UM único escritor capaz de CRIAR inadimplência no
 * sistema inteiro: o webhook `PAYMENT_OVERDUE` do Asaas. Uma obrigação que
 * vencesse sem passar pelo gateway não fazia ninguém ficar `PAST_DUE` — o caso
 * Óticas Ultra, três meses sem cobrar com o sistema achando que estava tudo
 * `ACTIVE`.
 *
 * ⚠️ `billing_obligations` está VAZIA em produção (o bootstrap ainda não rodou),
 * então esta correção não muda nada hoje. **Estes testes são a única prova.**
 */

const obligationFindMany = vi.fn();
const subscriptionUpdateMany = vi.fn();

/**
 * Banco falso, injetado por `SweepDbClient` — a interface ESTREITA que o serviço
 * declara (só `billingObligation.findMany` e `subscription.updateMany`).
 *
 * Sem `as never`/`as any` de propósito: um `as` aqui desligaria a checagem de
 * tipos exatamente onde ela protege (um `data:` com campo errado passaria
 * compilando), e este repo já teve um typo passar assim.
 */
function fakePrisma(): SweepDbClient {
  return {
    billingObligation: { findMany: obligationFindMany },
    subscription: { updateMany: subscriptionUpdateMany },
  };
}

const NOW = new Date("2026-07-31T08:00:00.000Z");

/** Obrigação emitida e vencida, no formato que o `select` do serviço devolve. */
function overdueObligation(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "obl-1",
    dueAt: new Date("2026-06-01T00:00:00.000Z"),
    subscriptionId: "sub-1",
    subscription: { id: "sub-1", companyId: "co-1" },
    ...over,
  };
}

function run() {
  return sweepOverdueObligations({ prismaClient: fakePrisma(), now: NOW });
}

beforeEach(() => {
  obligationFindMany.mockReset().mockResolvedValue([]);
  subscriptionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("sweepOverdueObligations — fecha o buraco do escritor único", () => {
  it("obrigação ISSUED vencida sem carimbo → grava PAST_DUE + pastDueSince", async () => {
    obligationFindMany.mockResolvedValue([overdueObligation()]);

    const r = await run();

    expect(r.marked).toEqual([
      {
        subscriptionId: "sub-1",
        companyId: "co-1",
        pastDueSince: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    expect(subscriptionUpdateMany).toHaveBeenCalledTimes(1);
    const call = subscriptionUpdateMany.mock.calls[0][0];
    expect(call.data.status).toBe("PAST_DUE");
  });

  // ── A regra que impede a régua de reiniciar ────────────────────────────────

  it("🔑 pastDueSince recebe o `dueAt` da obrigação, NUNCA `now()`", async () => {
    // Com `now()` no lugar de `dueAt`, cada rodada que reencontrasse a mesma
    // dívida reiniciaria o relógio da régua e o cliente jamais chegaria aos 14
    // dias — inadimplência eterna e inconsequente. E um atraso de 60 dias
    // descoberto hoje valeria zero.
    const dueAt = new Date("2026-06-01T00:00:00.000Z");
    obligationFindMany.mockResolvedValue([overdueObligation({ dueAt })]);

    await run();

    const gravado = subscriptionUpdateMany.mock.calls[0][0].data.pastDueSince as Date;
    expect(gravado.getTime()).toBe(dueAt.getTime());
    expect(gravado.getTime()).not.toBe(NOW.getTime());
  });

  it("duas obrigações vencidas na mesma assinatura → uma escrita só, a PRIMEIRA da lista", async () => {
    // Dedup por assinatura: sem ele, um cliente com 3 meses de atraso levaria 3
    // updates na mesma rodada (os 2 últimos inúteis, barrados pela guarda).
    const antiga = new Date("2026-05-01T00:00:00.000Z");
    obligationFindMany.mockResolvedValue([
      overdueObligation({ id: "obl-antiga", dueAt: antiga }),
      overdueObligation({ id: "obl-nova", dueAt: new Date("2026-07-01T00:00:00.000Z") }),
    ]);

    const r = await run();

    expect(subscriptionUpdateMany).toHaveBeenCalledTimes(1);
    expect(r.marked).toHaveLength(1);
    expect(r.marked[0].pastDueSince.getTime()).toBe(antiga.getTime());
  });

  it("🔑 a ordenação da busca é `dueAt` ASCENDENTE — a dedup pega a MAIS ANTIGA", async () => {
    // O teste acima prova a DEDUP, mas ele alimenta uma lista já ordenada à mão:
    // inverter o `orderBy` do serviço passaria despercebido. Quem escolhe qual
    // das obrigações vence a dedup é o BANCO, e a instrução dada a ele é a única
    // coisa que este processo controla.
    //
    // A direção importa: com `desc`, um cliente com 3 meses de atraso seria
    // carimbado pelo vencimento MAIS RECENTE — a dívida encolheria de 90 para 30
    // dias e ele ganharia dois meses de escrita que não tem.
    await run();

    expect(obligationFindMany.mock.calls[0][0].orderBy).toEqual({ dueAt: "asc" });
  });

  // ── Guarda idempotente ────────────────────────────────────────────────────

  it("🔑 o CAS exige `pastDueSince: null` — não reseta o relógio de quem já está na régua", async () => {
    obligationFindMany.mockResolvedValue([overdueObligation()]);

    await run();

    const where = subscriptionUpdateMany.mock.calls[0][0].where;
    expect(where.pastDueSince).toBeNull();
  });

  it("🔑 o CAS exclui SUSPENDED e CANCELED — não ressuscita estado terminal", async () => {
    // Mesmo padrão do webhook (`webhooks/asaas/route.ts:642`). Sem isto, um
    // vencimento reabriria como `PAST_DUE` quem o cron já suspendeu, e a cada
    // rodada o admin seria re-notificado da mesma suspensão.
    obligationFindMany.mockResolvedValue([overdueObligation()]);

    await run();

    const where = subscriptionUpdateMany.mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(expect.arrayContaining(["SUSPENDED", "CANCELED"]));
  });

  it("CAS que não casa (count 0) → conta como skipped, não como marcada", async () => {
    // Alguém escreveu entre o findMany e o update (webhook, admin, outra rodada).
    obligationFindMany.mockResolvedValue([overdueObligation()]);
    subscriptionUpdateMany.mockResolvedValue({ count: 0 });

    const r = await run();

    expect(r.marked).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });

  // ── Isenções ──────────────────────────────────────────────────────────────

  it("🔑 só obrigação CHARGE entra na busca — cortesia/interna/legada nunca carimbam", async () => {
    // Carimbar inadimplência por uma cortesia seria cobrar quem o dono isentou.
    // As isentas criadas pelo motor nascem `PAID` (o filtro de `state` já as
    // pega), mas o bootstrap e as ferramentas manuais escrevem `disposition` à
    // mão — uma linha isenta com `dueAt` no passado É possível.
    await run();

    const where = obligationFindMany.mock.calls[0][0].where;
    expect(where.disposition).toBe("CHARGE");
  });

  it("🔑 só obrigação ISSUED e VENCIDA entra na busca (I1)", async () => {
    // `PLANNED` é dívida NÃO emitida — ninguém foi cobrado por ela, e marcar
    // inadimplência por ela puniria o cliente pela nossa falha de emissão.
    await run();

    const where = obligationFindMany.mock.calls[0][0].where;
    expect(where.state).toBe("ISSUED");
    expect((where.dueAt.lt as Date).getTime()).toBe(NOW.getTime());
  });

  // ── Multi-tenant ──────────────────────────────────────────────────────────

  it("🔑 o tenant é transitivo por subscriptionId — a busca desce até companyId", async () => {
    // `billing_obligations` NÃO tem `companyId`. O escopo é `subscription: {...}`,
    // o mesmo padrão de `billing-obligation.service.ts`, e o `companyId` sai do
    // `select` aninhado — nenhum consumidor precisa reabrir o banco.
    obligationFindMany.mockResolvedValue([overdueObligation()]);

    const r = await run();

    const args = obligationFindMany.mock.calls[0][0];
    expect(args.where.subscription).toMatchObject({ pastDueSince: null });
    expect(args.select.subscription.select.companyId).toBe(true);
    expect(r.marked[0].companyId).toBe("co-1");
  });

  it("a busca só considera assinaturas em estado marcável (nunca SUSPENDED/CANCELED)", async () => {
    await run();

    const statuses = obligationFindMany.mock.calls[0][0].where.subscription.status.in as string[];
    expect(statuses).not.toContain("SUSPENDED");
    expect(statuses).not.toContain("CANCELED");
    expect(statuses).toContain("PAST_DUE");
  });

  // ── Nunca lança ───────────────────────────────────────────────────────────

  it("findMany falhando → devolve erro contado, NÃO lança (a régua do cron sobrevive)", async () => {
    obligationFindMany.mockRejectedValue(new Error("banco fora do ar"));

    const r = await run();

    expect(r.errors).toBe(1);
    expect(r.marked).toHaveLength(0);
  });

  it("update falhando numa assinatura → as OUTRAS continuam sendo carimbadas", async () => {
    obligationFindMany.mockResolvedValue([
      overdueObligation({ id: "obl-a", subscriptionId: "sub-a", subscription: { id: "sub-a", companyId: "co-a" } }),
      overdueObligation({ id: "obl-b", subscriptionId: "sub-b", subscription: { id: "sub-b", companyId: "co-b" } }),
    ]);
    subscriptionUpdateMany
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValueOnce({ count: 1 });

    const r = await run();

    expect(r.errors).toBe(1);
    expect(r.marked.map((m) => m.companyId)).toEqual(["co-b"]);
  });

  it("nenhuma obrigação vencida (o estado de produção HOJE) → nenhuma escrita", async () => {
    // `billing_obligations` está vazia: o deploy é um no-op observável.
    const r = await run();

    expect(r.marked).toHaveLength(0);
    expect(r.errors).toBe(0);
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });
});
