import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSaga } from "./executor";
import type { SagaDeps, ClaimedSagaOp, CasResult } from "./executor";
import type { SagaState } from "./saga";

// Longe no futuro: op NÃO expirada por padrão (a expiração é testada à parte).
const FAR_FUTURE = new Date(4102444800000); // 2100-01-01
const TOKEN = "lease-token-1"; // posse padrão da op nos testes

function makeOp(state: ClaimedSagaOp["state"] = "RECEIVED", over: Partial<ClaimedSagaOp> = {}): ClaimedSagaOp {
  return {
    id: "op1",
    eventId: "ev1",
    visCompanyId: "co1",
    requestedTier: "clinic_full",
    targetPlanId: "plan_clinica",
    state,
    asaasRef: null,
    expiresAt: FAR_FUTURE,
    leaseToken: TOKEN,
    claimedAt: new Date(1_700_000_000_000),
    attemptCount: 0,
    ...over,
  };
}

const OK: CasResult = { applied: true };

/**
 * Deps de teste que simulam o "banco": estado + leaseToken + contador por estado.
 * Os CAS só avançam se o estado esperado bate E o token bate (fencing). O avanço
 * reseta o contador. `dbToken` simula perda de lease; `attemptStart` simula uma op
 * que já acumulou tentativas no estado atual (p/ testar exaustão).
 */
function makeDeps(
  over: Partial<SagaDeps> = {},
  dbStateInit: SagaState = "RECEIVED",
  dbTokenInit: string = TOKEN,
  attemptStart: number = 0,
) {
  const state = { value: dbStateInit as SagaState };
  const db = { token: dbTokenInit as string | null, attempts: attemptStart };
  const calls = { confirmBilling: 0, applyLocal: 0, publish: 0, renewLease: 0, beginAttempt: 0, markFinancialTerminalAndAlert: 0, scheduleRetry: 0 };
  const order: string[] = []; // ordem real dos efeitos (cobra→aplica→publica)

  const owns = (op: ClaimedSagaOp) => op.leaseToken === db.token;
  // avança o estado e reseta o contador por estado (Fase D).
  const advance = (to: SagaState) => { state.value = to; db.attempts = 0; };

  const base: SagaDeps = {
    beginAttempt: vi.fn(async (op, s): Promise<{ attemptCount: number }> => {
      calls.beginAttempt++;
      if (state.value !== s || !owns(op)) return { attemptCount: 0 };
      db.attempts += 1;
      return { attemptCount: db.attempts };
    }),
    renewLease: vi.fn(async (op): Promise<CasResult> => {
      calls.renewLease++;
      return { applied: owns(op) };
    }),
    confirmBilling: vi.fn(async () => {
      calls.confirmBilling++;
      order.push("billing");
      return { asaasRef: "asaas-real-id" };
    }),
    applyLocal: vi.fn(async (op): Promise<CasResult> => {
      calls.applyLocal++;
      if (state.value !== "BILLING_CONFIRMED" || !owns(op)) return { applied: false };
      order.push("local");
      advance("LOCAL_APPLIED");
      return OK;
    }),
    publish: vi.fn(async () => {
      calls.publish++;
      order.push("publish");
    }),
    transition: vi.fn(async (op, from, to): Promise<CasResult> => {
      if (state.value !== from || !owns(op)) return { applied: false };
      advance(to);
      return OK;
    }),
    recordError: vi.fn(async (op): Promise<CasResult> => ({ applied: owns(op) })),
    markTerminal: vi.fn(async (op, from, terminal): Promise<CasResult> => {
      if (state.value !== from || !owns(op)) return { applied: false };
      state.value = terminal;
      return OK;
    }),
    markFinancialTerminalAndAlert: vi.fn(async (op, from, terminal): Promise<CasResult> => {
      calls.markFinancialTerminalAndAlert++;
      if (state.value !== from || !owns(op)) return { applied: false };
      state.value = terminal;
      return OK;
    }),
    reloadOp: vi.fn(async () => ({ state: state.value, asaasRef: null as string | null, leaseToken: db.token })),
    // FASE E: scheduleRetry é chamado pelos CHAMADORES (worker/endpoint), NÃO pelo
    // runSaga. No harness ele só conta invocações — o runSaga jamais deve chamá-lo.
    scheduleRetry: vi.fn(async (op): Promise<CasResult> => {
      calls.scheduleRetry++;
      return { applied: owns(op) };
    }),
    releaseLease: vi.fn(async (op): Promise<CasResult> => ({ applied: owns(op) })),
    ...over,
  };
  return { deps: base, state, db, calls, order };
}

beforeEach(() => vi.clearAllMocks());

describe("runSaga — ordem Asaas-first (upgrade nunca libera sem cobrar)", () => {
  it("caminho feliz: cobra → aplica local → publica → COMPLETED, nessa ordem", async () => {
    const { deps, order } = makeDeps({}, "RECEIVED");
    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(order).toEqual(["billing", "local", "publish"]);
    expect(final.kind).toBe("completed");
    expect(final.state).toBe("COMPLETED");
  });

  it("cobrança FALHA (1º erro) → NÃO aplica local nem publica; retryable, checkpoint em BILLING_REQUESTED", async () => {
    const { deps, calls } = makeDeps({
      confirmBilling: vi.fn().mockRejectedValue(new Error("asaas down")),
    });
    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(calls.applyLocal).toBe(0); // não libera tier sem pagar
    expect(calls.publish).toBe(0);
    // 1º erro NÃO promove a terminal — é retomável (checkpoint preservado).
    expect(final.kind).toBe("retryable_failure");
    expect(final.state).toBe("BILLING_REQUESTED");
    if (final.kind === "retryable_failure") expect(final.lastError).toContain("asaas");
    expect(deps.recordError).toHaveBeenCalledWith(
      expect.anything(),
      "BILLING_REQUESTED",
      expect.stringContaining("asaas"),
    );
  });

  it("retomar após falha de cobrança → continua de BILLING_REQUESTED (recobra idempotente)", async () => {
    const deps1 = makeDeps({ confirmBilling: vi.fn().mockRejectedValue(new Error("timeout")) }, "BILLING_REQUESTED");
    const r1 = await runSaga(makeOp("BILLING_REQUESTED"), deps1.deps);
    expect(r1.state).toBe("BILLING_REQUESTED");

    const deps2 = makeDeps({}, "BILLING_REQUESTED");
    const r2 = await runSaga(makeOp("BILLING_REQUESTED"), deps2.deps);
    expect(deps2.calls.confirmBilling).toBe(1);
    expect(r2.kind).toBe("completed");
    expect(r2.state).toBe("COMPLETED");
  });
});

describe("runSaga — retomada por estado (crash recovery)", () => {
  it("retoma de BILLING_CONFIRMED → NÃO recobra, aplica local + publica", async () => {
    const { deps, calls } = makeDeps({}, "BILLING_CONFIRMED");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    expect(calls.confirmBilling).toBe(0); // já cobrou antes do crash
    expect(calls.applyLocal).toBe(1);
    expect(calls.publish).toBe(1);
    expect(final.kind).toBe("completed");
  });

  it("retoma de LOCAL_APPLIED → só publica", async () => {
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED");
    const final = await runSaga(makeOp("LOCAL_APPLIED"), deps);

    expect(calls.confirmBilling).toBe(0);
    expect(calls.applyLocal).toBe(0);
    expect(calls.publish).toBe(1);
    expect(final.kind).toBe("completed");
  });

  it("op já COMPLETED → no-op (não repete nada)", async () => {
    const { deps, calls } = makeDeps({}, "COMPLETED");
    const final = await runSaga(makeOp("COMPLETED"), deps);
    expect(calls.confirmBilling).toBe(0);
    expect(calls.applyLocal).toBe(0);
    expect(calls.publish).toBe(0);
    expect(final.kind).toBe("completed");
  });
});

describe("runSaga — monotonia (CAS): executor atrasado não regride nem duplica", () => {
  it("op já avançou por outro executor (db=COMPLETED) → beginAttempt detecta, NÃO aplica, terminal", async () => {
    // db já está em COMPLETED (outro executor terminou); este chega atrasado em
    // BILLING_CONFIRMED. beginAttempt(op,BILLING_CONFIRMED) vê o estado mudado →
    // retorna 0 → resync vê COMPLETED (terminal). applyLocal nem é tentado (Fase D:
    // beginAttempt roda antes do passo — não gasta o efeito se o estado mudou).
    const { deps, calls } = makeDeps({}, "COMPLETED");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    expect(calls.applyLocal).toBe(0); // nem tentou — beginAttempt já detectou
    expect(calls.publish).toBe(0);
    // resync adota COMPLETED (avanço estrito no ORDER); o loop encerra → completed
    // (COMPLETED é sucesso, não terminal humano). Idempotente com o vencedor.
    expect(final.kind).toBe("completed");
    expect(final.state).toBe("COMPLETED");
  });

  it("CAS perde e reloadOp devolve o MESMO estado → para sem laço infinito", async () => {
    const { deps } = makeDeps({}, "RECEIVED");
    // força transition a nunca pegar (simula perda contínua do CAS), mas o token
    // AINDA é o nosso (não é perda de lease — é o caso "mesmo estado").
    (deps.transition as ReturnType<typeof vi.fn>).mockResolvedValue({ applied: false });
    (deps.reloadOp as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "RECEIVED", asaasRef: null, leaseToken: TOKEN });

    const final = await runSaga(makeOp("RECEIVED"), deps);
    // resync vê real===atual → stop retryable → o executor para, sem girar.
    expect(final.kind).toBe("retryable_failure");
    expect(final.state).toBe("RECEIVED");
  });

  it("CAS perde e reloadOp devolve estado ANTERIOR (regressão) → NÃO adota, para", async () => {
    // Achado Codex #6: um executor em BILLING_CONFIRMED que relê RECEIVED NÃO pode
    // adotar a regressão (reexecutaria confirmBilling = dupla cobrança).
    const { deps, calls } = makeDeps({}, "BILLING_CONFIRMED");
    (deps.applyLocal as ReturnType<typeof vi.fn>).mockResolvedValue({ applied: false });
    (deps.reloadOp as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "RECEIVED", asaasRef: null, leaseToken: TOKEN });

    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    expect(calls.confirmBilling).toBe(0); // NÃO recobra
    expect(final.kind).toBe("retryable_failure"); // para no checkpoint, não regride
  });

  it("crash pós-applyLocal (db=LOCAL_APPLIED): efeito nunca roda 2×, segue pro publish", async () => {
    // db já está LOCAL_APPLIED (applyLocal commitou antes do crash). Retoma de
    // BILLING_CONFIRMED (checkpoint antigo em memória): beginAttempt vê o estado
    // avançado → 0 → resync ADOTA LOCAL_APPLIED (avanço estrito, mesmo token) →
    // segue pro publish → COMPLETED. applyLocal NÃO roda de novo (sem 2º efeito).
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    expect(calls.applyLocal).toBe(0); // nem tentou — beginAttempt detectou o avanço
    expect(calls.publish).toBe(1);
    expect(final.kind).toBe("completed");
  });
});

describe("runSaga — terminais humanos não são processados", () => {
  it.each(["FAILED", "FAILED_BEFORE_BILLING", "CHARGED_NOT_APPLIED", "MANUAL_REVIEW"] as const)(
    "estado terminal %s → no-op imediato, kind=terminal",
    async (terminal) => {
      const { deps, calls } = makeDeps({}, terminal);
      const final = await runSaga(makeOp(terminal), deps);
      expect(calls.confirmBilling).toBe(0);
      expect(calls.applyLocal).toBe(0);
      expect(calls.publish).toBe(0);
      expect(final.kind).toBe("terminal");
      expect(final.state).toBe(terminal);
    },
  );
});

describe("runSaga — matriz de classificação ao ESGOTAR tentativas (Fase D)", () => {
  // attemptStart=5: beginAttempt levará a 6 (> MAX_ATTEMPTS_PER_STATE=5) → promove.
  const EXHAUSTED = 5;

  it("RECEIVED esgotado → FAILED_BEFORE_BILLING (seguro, sem alerta)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED", TOKEN, EXHAUSTED);
    const final = await runSaga(makeOp("RECEIVED"), deps);
    expect(final.kind).toBe("terminal");
    expect(final.state).toBe("FAILED_BEFORE_BILLING");
    expect(deps.markTerminal).toHaveBeenCalled();
    expect(deps.markFinancialTerminalAndAlert).not.toHaveBeenCalled(); // sem alerta
    expect(calls.confirmBilling).toBe(0);
  });

  it("BILLING_REQUESTED esgotado → MANUAL_REVIEW + alerta (AMBÍGUO, nunca FAILED_BEFORE_BILLING)", async () => {
    const { deps } = makeDeps({}, "BILLING_REQUESTED", TOKEN, EXHAUSTED);
    const final = await runSaga(makeOp("BILLING_REQUESTED"), deps);
    expect(final.kind).toBe("terminal");
    expect(final.state).toBe("MANUAL_REVIEW"); // NUNCA FAILED_BEFORE_BILLING (esconderia cobrança)
    expect(deps.markFinancialTerminalAndAlert).toHaveBeenCalledWith(
      expect.anything(), "BILLING_REQUESTED", "MANUAL_REVIEW", expect.any(String),
    );
  });

  it("BILLING_CONFIRMED esgotado → CHARGED_NOT_APPLIED + alerta (cobrado, plano não aplicado)", async () => {
    const { deps } = makeDeps({}, "BILLING_CONFIRMED", TOKEN, EXHAUSTED);
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    expect(final.kind).toBe("terminal");
    expect(final.state).toBe("CHARGED_NOT_APPLIED");
    expect(deps.markFinancialTerminalAndAlert).toHaveBeenCalledWith(
      expect.anything(), "BILLING_CONFIRMED", "CHARGED_NOT_APPLIED", expect.any(String),
    );
  });

  it("LOCAL_APPLIED esgotado NÃO é cortado: continua e CONCLUI (publish→COMPLETED)", async () => {
    // Achado Codex: LOCAL_APPLIED fora do corte de exaustão — o plano já foi
    // aplicado, cortá-lo prenderia a op pra sempre. Mesmo com attemptCount>MAX,
    // segue tentando concluir (publish é idempotente/fire-and-forget).
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED", TOKEN, EXHAUSTED);
    const final = await runSaga(makeOp("LOCAL_APPLIED"), deps);
    expect(final.kind).toBe("completed"); // conclui, não fica preso
    expect(calls.publish).toBe(1);
    expect(deps.markFinancialTerminalAndAlert).not.toHaveBeenCalled();
    expect(deps.markTerminal).not.toHaveBeenCalled();
  });

  it("contador reseta no avanço: 4 falhas em BILLING_REQUESTED + sucesso NÃO herda contador", async () => {
    // db começa com 4 tentativas em BILLING_REQUESTED; a 5ª (beginAttempt→5) está
    // no limite (não >5), então tenta e sucede → avança e reseta. Não promove.
    const { deps } = makeDeps({}, "BILLING_REQUESTED", TOKEN, 4);
    const final = await runSaga(makeOp("BILLING_REQUESTED"), deps);
    expect(final.kind).toBe("completed");
    expect(deps.markFinancialTerminalAndAlert).not.toHaveBeenCalled();
  });

  it("markFinancialTerminalAndAlert LANÇA (erro de banco no alerta) → catch → retryable, NÃO propaga (Codex #2)", async () => {
    // Se o upsert do SystemEvent falha, a tx reverte (terminal+evento) e a
    // exceção é CAPTURADA pela fronteira de erro do runSaga → retryable_failure
    // (não escapa como 500 genérico). recordError registra; o worker retoma.
    const { deps } = makeDeps({
      markFinancialTerminalAndAlert: vi.fn().mockRejectedValue(new Error("db down no alerta")),
    }, "BILLING_CONFIRMED", TOKEN, EXHAUSTED);
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    expect(final.kind).toBe("retryable_failure");
    expect(deps.recordError).toHaveBeenCalled();
  });
});

describe("runSaga — fencing por lease (Fase C)", () => {
  it("renewLease antes do Asaas: perdi o lease → NÃO cobra, para", async () => {
    const { deps, calls, db } = makeDeps({}, "BILLING_REQUESTED");
    // simula: outro executor re-claimou (db.token mudou) antes de cobrarmos.
    db.token = "outro-token";

    const final = await runSaga(makeOp("BILLING_REQUESTED"), deps);
    // beginAttempt roda 1º e já vê o token trocado (owns=false) → 0 → resync
    // detecta lost_lease ANTES de renewLease/confirmBilling (Fase D).
    expect(calls.confirmBilling).toBe(0); // NÃO cobra sem posse
    expect(final.kind).toBe("lost_lease");
  });

  it("perdi o lease no meio (renewLease ok, mas token mudou antes do publish) → não republica", async () => {
    const { deps, calls, db } = makeDeps({}, "LOCAL_APPLIED");
    db.token = "outro-token"; // perdemos a posse antes do publish

    const final = await runSaga(makeOp("LOCAL_APPLIED"), deps);
    expect(calls.publish).toBe(0); // não publica sem posse
    expect(final.kind).toBe("lost_lease");
  });

  it("CAS perde por PERDA DE LEASE (token real ≠ o meu) → NÃO adota estado avançado, para", async () => {
    // db avançou pra LOCAL_APPLIED mas sob OUTRO token (outro executor). Nós, em
    // BILLING_CONFIRMED com o token velho, perdemos o applyLocal; o resync vê token
    // diferente → lost_lease (não segue pro publish com autoridade perdida).
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED", "outro-token");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    // beginAttempt já vê o token trocado → 0 → resync lost_lease. applyLocal nem
    // é tentado; publish não roda (autoridade perdida).
    expect(calls.applyLocal).toBe(0);
    expect(calls.publish).toBe(0);
    expect(final.kind).toBe("lost_lease");
  });

  it("caminho feliz mantém a posse o tempo todo (renewLease sempre ok)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED");
    const final = await runSaga(makeOp("RECEIVED"), deps);
    expect(final.kind).toBe("completed");
    expect(calls.renewLease).toBe(2); // antes do Asaas e antes do publish
  });
});

describe("runSaga — expiração antes de cobrar (achado Codex #3)", () => {
  it("RECEIVED expirada → FAILED_BEFORE_BILLING, NÃO cobra (seguro)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED");
    const past = new Date(1000); // 1970 — bem no passado
    const now = new Date(2000);
    const final = await runSaga(makeOp("RECEIVED", { expiresAt: past }), deps, now);

    expect(calls.confirmBilling).toBe(0); // nunca tocou o Asaas
    expect(calls.applyLocal).toBe(0);
    expect(final.kind).toBe("terminal"); // expiração é terminal limpo
    expect(final.state).toBe("FAILED_BEFORE_BILLING");
  });

  it("RECEIVED ainda válida → segue o fluxo normal (cobra)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED");
    const now = new Date(2000);
    const future = new Date(999999999999);
    const final = await runSaga(makeOp("RECEIVED", { expiresAt: future }), deps, now);

    expect(calls.confirmBilling).toBe(1);
    expect(final.state).toBe("COMPLETED");
  });

  it("BILLING_REQUESTED expirada → MANUAL_REVIEW + alerta, NÃO cobra (Fase E, achado Codex #3)", async () => {
    // DECISÃO DO DONO (Fase E): uma op parada em BILLING_REQUESTED além do TTL é
    // AMBÍGUA (o PUT ao Asaas pode ter chegado e a resposta se perdido). NÃO cobra
    // com preço congelado semanas atrás nem a declara segura (FAILED_BEFORE_BILLING
    // esconderia cobrança) — vira MANUAL_REVIEW + alerta (humano confere no Asaas).
    const { deps, calls } = makeDeps({}, "BILLING_REQUESTED");
    const now = new Date(9_000_000_000_000);
    const final = await runSaga(makeOp("BILLING_REQUESTED", { expiresAt: new Date(1000) }), deps, now);

    expect(calls.confirmBilling).toBe(0); // NÃO cobra uma op vencida
    expect(calls.markFinancialTerminalAndAlert).toBe(1); // terminal financeiro + alerta atômico
    expect(final.kind).toBe("terminal");
    expect(final.state).toBe("MANUAL_REVIEW");
  });

  it("BILLING_REQUESTED ainda válida → segue cobrando normal (não expira)", async () => {
    // Guarda de regressão: a expiração NÃO pode disparar antes do TTL.
    const { deps, calls } = makeDeps({}, "BILLING_REQUESTED");
    const now = new Date(2000);
    const final = await runSaga(makeOp("BILLING_REQUESTED", { expiresAt: new Date(999999999999) }), deps, now);

    expect(calls.confirmBilling).toBe(1); // retomou a cobrança
    expect(calls.markFinancialTerminalAndAlert).toBe(0);
    expect(final.state).toBe("COMPLETED");
  });

  it("BILLING_CONFIRMED expirada → NÃO expira (pós-cobrança SEMPRE completa)", async () => {
    // Política state-aware (achado Codex #6): depois de cobrada, a op TEM que
    // aplicar o plano mesmo vencida — expirá-la abandonaria o cliente cobrado. Só
    // o pré-cobrança (RECEIVED/BILLING_REQUESTED) expira.
    const { deps, calls } = makeDeps({}, "BILLING_CONFIRMED");
    const now = new Date(9_000_000_000_000);
    const final = await runSaga(makeOp("BILLING_CONFIRMED", { expiresAt: new Date(1000) }), deps, now);

    expect(calls.applyLocal).toBe(1); // aplicou o plano cobrado
    expect(calls.markFinancialTerminalAndAlert).toBe(0);
    expect(final.state).toBe("COMPLETED");
  });
});

describe("runSaga — scheduleRetry é caller-driven (Fase E)", () => {
  it("runSaga NUNCA chama scheduleRetry (a política de backoff é do worker/endpoint)", async () => {
    // O backoff+release é responsabilidade do CHAMADOR, não do runSaga (que é
    // reusado). Um retryable_failure não deve agendar nada por dentro.
    const { deps, calls } = makeDeps({
      confirmBilling: vi.fn().mockRejectedValue(new Error("asaas down")),
    });
    const final = await runSaga(makeOp("RECEIVED"), deps);
    expect(final.kind).toBe("retryable_failure");
    expect(calls.scheduleRetry).toBe(0); // o chamador é quem agenda
  });
});
