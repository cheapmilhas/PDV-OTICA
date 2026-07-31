import { describe, it, expect, vi } from "vitest";
import {
  LIVE_STATUSES,
  checkSubscription,
  resolvePastDueAccess,
  type SubscriptionDbClient,
} from "./subscription";

/**
 * Testes de CARACTERIZAÇÃO: travam o comportamento atual de LIVE_STATUSES
 * (quais status de assinatura mantêm as features do plano liberadas).
 * Rede de segurança para as fases futuras que vão mexer em cobrança.
 * Se algum destes falhar, foi uma MUDANÇA de comportamento — confirme se é intencional.
 */
describe("LIVE_STATUSES (caracterização)", () => {
  it("inclui TRIAL, ACTIVE e PAST_DUE (status que liberam features)", () => {
    expect(LIVE_STATUSES).toContain("TRIAL");
    expect(LIVE_STATUSES).toContain("ACTIVE");
    expect(LIVE_STATUSES).toContain("PAST_DUE");
  });

  it("NÃO inclui SUSPENDED, CANCELED nem TRIAL_EXPIRED (status que zeram features)", () => {
    expect(LIVE_STATUSES).not.toContain("SUSPENDED");
    expect(LIVE_STATUSES).not.toContain("CANCELED");
    expect(LIVE_STATUSES).not.toContain("TRIAL_EXPIRED");
  });

  it("tem exatamente 3 status vivos", () => {
    expect(LIVE_STATUSES).toHaveLength(3);
  });
});

describe("resolvePastDueAccess", () => {
  it("recém-vencido (0 dias), aviso despachado → pode LER e ESCREVER, com aviso", () => {
    const r = resolvePastDueAccess(0, true);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("durante os avisos (7 dias), aviso despachado → ainda escreve", () => {
    expect(resolvePastDueAccess(7, true).readOnly).toBe(false);
  });

  it("no marco final (14 dias), aviso despachado → perde a escrita, mantém a leitura", () => {
    const r = resolvePastDueAccess(14, true);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(true);
  });

  it("passou do marco (20 dias) MAS o aviso NÃO foi despachado → mantém a escrita", () => {
    const r = resolvePastDueAccess(20, false);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("a mensagem muda de tom entre avisar e restringir", () => {
    expect(resolvePastDueAccess(3, true).message).not.toBe(
      resolvePastDueAccess(14, true).message
    );
  });

  it("passou do marco sem aviso despachado → mensagem continua no tom de aviso, não de bloqueio", () => {
    // Não pode dizer "está bloqueado" para quem ainda escreve — seria mentira.
    const r = resolvePastDueAccess(20, false);
    expect(r.message).not.toContain("bloqueado");
  });

  it("a mensagem sempre informa os dias de atraso", () => {
    expect(resolvePastDueAccess(9, true).message).toContain("9");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I2 — "vencimento GRAVA ESTADO, nunca só calcula"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Banco falso para `checkSubscription`. Estrutural, não `as never`: satisfaz
 * `SubscriptionDbClient` por forma, do mesmo jeito que o `prisma` real.
 *
 * `accessEnabled: false` de propósito em TODOS os casos — com `true` (o estado
 * de 14 das 17 empresas em produção) `checkSubscription` devolve
 * `allowed:true, readOnly:false` ANTES de sequer ler a assinatura, e qualquer
 * asserção sobre a régua passaria por vacuidade. Foi um dos achados do painel.
 */
function fakeDb(opts: {
  subscription: Record<string, unknown> | null;
  dunningEvent?: Record<string, unknown> | null;
}): SubscriptionDbClient {
  return {
    company: {
      findUnique: vi.fn(async () => ({
        accessEnabled: false,
        name: "Empresa Teste",
        isBlocked: false,
      })),
    },
    subscription: {
      findFirst: vi.fn(async () => opts.subscription),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    dunningEvent: {
      findFirst: vi.fn(async () => opts.dunningEvent ?? null),
    },
  } as unknown as SubscriptionDbClient;
}

/** Assinatura PAST_DUE mínima, com os dois campos que a decisão pode usar. */
function pastDueSub(opts: {
  pastDueSince: Date | null;
  currentPeriodEnd: Date | null;
}) {
  return {
    id: "sub-i2",
    status: "PAST_DUE",
    pastDueSince: opts.pastDueSince,
    currentPeriodEnd: opts.currentPeriodEnd,
    trialEndsAt: null,
    plan: { name: "Profissional" },
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("checkSubscription — I2: a decisão sai de estado ESCRITO, não do relógio", () => {
  /**
   * 🔑 O TESTE DA INVARIANTE. É o que o revisor usou para PROVAR a violação:
   * a função foi chamada 2× com o MESMO estado de banco, variando só `now`, e
   * a decisão flipou — sem uma única escrita, sem trigger, sem revisão nova.
   *
   * Como `checkSubscription` lê o relógio internamente (`new Date()`), "variar
   * só `now`" aqui é feito com fake timers: mesmo mock de banco, mesmo objeto de
   * assinatura, dois instantes que cruzam a fronteira dos 14 dias contados a
   * partir de `currentPeriodEnd`.
   *
   * Com o fallback `?? currentPeriodEnd` restaurado este teste FALHA — que é
   * exatamente o ponto: ele existe para impedir que o fallback volte.
   */
  it("mesmo estado de banco, dois `now` que cruzam o marco → MESMO readOnly", async () => {
    // `currentPeriodEnd` bem no passado e `pastDueSince` NULO: o cenário em que
    // o fallback removido decidia por data de calendário.
    const periodEnd = new Date("2026-06-01T00:00:00.000Z");
    const sub = pastDueSub({ pastDueSince: null, currentPeriodEnd: periodEnd });

    // A trilha de aviso EXISTE (I3 satisfeita) — sem isso o segundo fator
    // mascararia a violação e o teste passaria pelo motivo errado.
    const db = fakeDb({ subscription: sub, dunningEvent: { id: "evt-14" } });

    vi.useFakeTimers();
    try {
      // 13 dias após o fim do período: antes do marco por qualquer leitura.
      vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
      const antes = await checkSubscription("co-i2", db);

      // 20 dias após o fim do período: DEPOIS do marco de 14 dias. Nada foi
      // escrito entre as duas chamadas — só o relógio andou.
      vi.setSystemTime(new Date("2026-06-21T00:00:00.000Z"));
      const depois = await checkSubscription("co-i2", db);

      expect(depois.readOnly).toBe(antes.readOnly);
      // E a direção: sem carimbo gravado, ninguém é restringido.
      expect(antes.readOnly).toBe(false);
      expect(depois.readOnly).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("PAST_DUE com pastDueSince NULO e currentPeriodEnd antigo → NÃO restringe", async () => {
    // Regressão direta do fallback removido. `currentPeriodEnd` tem 5+ escritores
    // e ninguém o carimba como "início da inadimplência" — `mark_paid` inclusive
    // confirma pagamento SEM avançá-lo. Antes desta correção, esta assinatura era
    // restringida por um vencimento de período que ninguém reconheceu como dívida.
    const db = fakeDb({
      subscription: pastDueSub({ pastDueSince: null, currentPeriodEnd: daysAgo(90) }),
      dunningEvent: { id: "evt-14" },
    });

    const r = await checkSubscription("co-sem-carimbo", db);

    expect(r.status).toBe("PAST_DUE");
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
    // `?? now` → daysOverdue = 0. Fail-OPEN a favor do cliente, de propósito.
    expect(r.daysOverdue).toBe(0);
  });

  it("sem carimbo, o gate NÃO consulta a trilha de aviso (nem toca o banco à toa)", async () => {
    // Consequência observável de `daysOverdue = 0`: não passou do marco, então
    // `hasDispatchedNotice` nem é chamado. Se alguém restaurar um fallback que
    // volte a inflar `daysOverdue`, esta asserção quebra junto.
    const db = fakeDb({
      subscription: pastDueSub({ pastDueSince: null, currentPeriodEnd: daysAgo(90) }),
      dunningEvent: { id: "evt-14" },
    });

    await checkSubscription("co-sem-carimbo", db);

    expect(db.dunningEvent.findFirst).not.toHaveBeenCalled();
  });

  it("COM carimbo gravado e aviso despachado → restringe (o caminho legítimo segue vivo)", async () => {
    // A correção não pode virar "nunca restringe ninguém". Com `pastDueSince`
    // ESCRITO — que é o que o varredor de obrigações passa a gravar — a régua
    // funciona normalmente.
    const db = fakeDb({
      subscription: pastDueSub({ pastDueSince: daysAgo(20), currentPeriodEnd: null }),
      dunningEvent: { id: "evt-14" },
    });

    const r = await checkSubscription("co-carimbado", db);

    expect(r.readOnly).toBe(true);
    expect(r.daysOverdue).toBe(20);
  });

  it("COM carimbo mas SEM aviso despachado → mantém a escrita (I3 continua valendo)", async () => {
    const db = fakeDb({
      subscription: pastDueSub({ pastDueSince: daysAgo(20), currentPeriodEnd: null }),
      dunningEvent: null,
    });

    const r = await checkSubscription("co-sem-aviso", db);

    expect(r.readOnly).toBe(false);
    expect(r.daysOverdue).toBe(20);
  });

  it("currentPeriodEnd NÃO influencia a decisão de quem tem carimbo próprio", async () => {
    // Blindagem contra o fallback voltar por outra porta (ex.: `Math.min` dos
    // dois campos). Dois cenários com o MESMO `pastDueSince` e
    // `currentPeriodEnd` radicalmente diferentes têm que decidir igual.
    const carimbo = daysAgo(20);
    const comPeriodoAntigo = await checkSubscription(
      "co-a",
      fakeDb({
        subscription: pastDueSub({ pastDueSince: carimbo, currentPeriodEnd: daysAgo(365) }),
        dunningEvent: { id: "evt-14" },
      }),
    );
    const comPeriodoFuturo = await checkSubscription(
      "co-b",
      fakeDb({
        subscription: pastDueSub({ pastDueSince: carimbo, currentPeriodEnd: daysAgo(-365) }),
        dunningEvent: { id: "evt-14" },
      }),
    );

    expect(comPeriodoFuturo.readOnly).toBe(comPeriodoAntigo.readOnly);
    expect(comPeriodoFuturo.daysOverdue).toBe(comPeriodoAntigo.daysOverdue);
  });
});
