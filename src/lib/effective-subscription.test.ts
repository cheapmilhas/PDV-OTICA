import { describe, it, expect } from "vitest";
import { resolveEffectiveSubscription } from "./effective-subscription";

const sub = (over: Partial<{ id: string; status: string; createdAt: Date }> = {}) => ({
  id: over.id ?? "s1",
  status: (over.status ?? "ACTIVE") as never,
  createdAt: over.createdAt ?? new Date("2026-01-01"),
});

describe("resolveEffectiveSubscription", () => {
  it("uma assinatura viva → é a efetiva", () => {
    const r = resolveEffectiveSubscription([sub()]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.subscription.id).toBe("s1");
  });

  it("ignora CANCELED ao escolher", () => {
    const r = resolveEffectiveSubscription([
      sub({ id: "morta", status: "CANCELED", createdAt: new Date("2026-06-01") }),
      sub({ id: "viva", status: "ACTIVE", createdAt: new Date("2026-01-01") }),
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
    if (r.kind === "ambiguous") expect(r.ids.sort()).toEqual(["a", "b"]);
  });

  it("lista vazia → none", () => {
    expect(resolveEffectiveSubscription([]).kind).toBe("none");
  });
});
