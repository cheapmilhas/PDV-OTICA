import { describe, it, expect } from "vitest";
import { companyIdsWithEffectivePlan, type SubForEffectivePlan } from "./plan-propagation.service";

function sub(companyId: string, planId: string, daysAgo: number): SubForEffectivePlan {
  return { companyId, planId, createdAt: new Date(2026, 0, 30 - daysAgo) };
}

describe("companyIdsWithEffectivePlan", () => {
  it("empresa com 1 subscription no plano → incluída", () => {
    const subs = [sub("c1", "planA", 0)];
    expect(companyIdsWithEffectivePlan(subs, "planA")).toEqual(["c1"]);
  });

  it("empresa cuja subscription MAIS RECENTE é de outro plano → NÃO incluída", () => {
    // c1 migrou: subscription antiga no planA, mais recente no planB.
    const subs = [sub("c1", "planA", 30), sub("c1", "planB", 1)];
    expect(companyIdsWithEffectivePlan(subs, "planA")).toEqual([]);
    expect(companyIdsWithEffectivePlan(subs, "planB")).toEqual(["c1"]);
  });

  it("empresa cuja subscription mais recente É do plano editado → incluída mesmo com antiga em outro", () => {
    const subs = [sub("c1", "planB", 30), sub("c1", "planA", 1)];
    expect(companyIdsWithEffectivePlan(subs, "planA")).toEqual(["c1"]);
  });

  it("várias empresas, filtra só as do plano", () => {
    const subs = [sub("c1", "planA", 0), sub("c2", "planB", 0), sub("c3", "planA", 0)];
    const result = companyIdsWithEffectivePlan(subs, "planA").sort();
    expect(result).toEqual(["c1", "c3"]);
  });

  it("lista vazia → vazio", () => {
    expect(companyIdsWithEffectivePlan([], "planA")).toEqual([]);
  });

  it("nenhuma empresa no plano → vazio", () => {
    const subs = [sub("c1", "planB", 0)];
    expect(companyIdsWithEffectivePlan(subs, "planA")).toEqual([]);
  });
});
