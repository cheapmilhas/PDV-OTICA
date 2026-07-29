import { describe, it, expect } from "vitest";
import { SubscriptionStatus } from "@prisma/client";
import { resolveEffectiveSubscription, type SubscriptionCandidate } from "./effective-subscription";

const sub = (over: Partial<SubscriptionCandidate> = {}): SubscriptionCandidate => ({
  id: over.id ?? "s1",
  status: over.status ?? "ACTIVE",
});

describe("resolveEffectiveSubscription", () => {
  it("uma assinatura viva → é a efetiva", () => {
    const r = resolveEffectiveSubscription([sub()]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.subscription.id).toBe("s1");
  });

  it("ignora CANCELED ao escolher", () => {
    const r = resolveEffectiveSubscription([
      sub({ id: "morta", status: "CANCELED" }),
      sub({ id: "viva", status: "ACTIVE" }),
    ]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.subscription.id).toBe("viva");
  });

  it("nenhuma assinatura viva → none (não é erro, é ausência)", () => {
    expect(resolveEffectiveSubscription([sub({ status: "CANCELED" })]).kind).toBe("none");
  });

  it("DUAS vivas → ambíguo, NUNCA escolhe", () => {
    // Escolher "a mais recente" cobraria a assinatura errada, com valor e
    // plano errados. Fail-closed: não cobra e alerta o operador.
    const r = resolveEffectiveSubscription([
      sub({ id: "a", status: "ACTIVE" }),
      sub({ id: "b", status: "PAST_DUE" }),
    ]);
    expect(r.kind).toBe("ambiguous");
    // Ordem determinística (a função ordena os ids) — não mascarar com .sort() aqui.
    if (r.kind === "ambiguous") expect(r.ids).toEqual(["a", "b"]);
  });

  it("lista vazia → none", () => {
    expect(resolveEffectiveSubscription([]).kind).toBe("none");
  });

  // Table-driven sobre os SEIS valores do enum SubscriptionStatus
  // (prisma/schema.prisma). Os testes acima só exercitam 3 (ACTIVE,
  // PAST_DUE, CANCELED) — não bastam para travar a costura com
  // LIVE_STATUSES: sabotagens que trocam a definição de "viva" (ex.: "tudo
  // menos CANCELED", que promoveria SUSPENDED/TRIAL_EXPIRED a vivas) passam
  // por eles sem protestar. `status` é tipado como SubscriptionStatus de
  // verdade (não `as never`) para que o compilador force a tabela a cobrir
  // o enum inteiro.
  const casos: Array<{ status: SubscriptionStatus; viva: boolean }> = [
    { status: "TRIAL", viva: true },
    { status: "ACTIVE", viva: true },
    { status: "PAST_DUE", viva: true },
    { status: "TRIAL_EXPIRED", viva: false },
    { status: "SUSPENDED", viva: false },
    { status: "CANCELED", viva: false },
  ];

  it.each(casos)("status $status → viva=$viva", ({ status, viva }) => {
    const r = resolveEffectiveSubscription([sub({ id: "x", status })]);
    expect(r.kind).toBe(viva ? "ok" : "none");
  });
});
