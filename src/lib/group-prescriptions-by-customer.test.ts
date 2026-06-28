import { describe, it, expect } from "vitest";
import { groupByCustomer } from "./group-prescriptions-by-customer";
import type { PrescriptionListItem } from "@/components/prescriptions/prescription-list";

const mk = (over: Partial<PrescriptionListItem>): PrescriptionListItem => ({
  id: "rx",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  status: "COMPLETA",
  customer: { id: "c1", name: "Maria" },
  values: null,
  ...over,
});

describe("groupByCustomer", () => {
  it("agrupa receitas do mesmo cliente", () => {
    const groups = groupByCustomer([
      mk({ id: "a", customer: { id: "c1", name: "Maria" } }),
      mk({ id: "b", customer: { id: "c1", name: "Maria" } }),
      mk({ id: "c", customer: { id: "c2", name: "Ana" } }),
    ]);
    expect(groups).toHaveLength(2);
    const maria = groups.find((g) => g.customerId === "c1")!;
    expect(maria.prescriptions.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("ordena receitas do grupo por issuedAt CRESCENTE (evolução)", () => {
    const groups = groupByCustomer([
      mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z" }),
      mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z" }),
    ]);
    expect(groups[0].prescriptions.map((p) => p.id)).toEqual(["velho", "novo"]);
  });

  it("grau mais recente do grupo = última receita após sort crescente", () => {
    const groups = groupByCustomer([
      mk({ id: "novo", issuedAt: "2026-06-01T00:00:00.000Z", values: { odSph: "-2.00" } }),
      mk({ id: "velho", issuedAt: "2025-06-01T00:00:00.000Z", values: { odSph: "-1.75" } }),
    ]);
    expect(groups[0].latest.id).toBe("novo");
  });

  it("ordena grupos pelo cliente com receita mais recente (desc); empate por nome A→Z", () => {
    const groups = groupByCustomer([
      mk({ id: "ana-velha", customer: { id: "c2", name: "Ana" }, issuedAt: "2025-01-01T00:00:00.000Z" }),
      mk({ id: "maria-nova", customer: { id: "c1", name: "Maria" }, issuedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.customerId)).toEqual(["c1", "c2"]);
  });

  it("ignora receitas sem customer.id (defensivo)", () => {
    const groups = groupByCustomer([mk({ customer: null })]);
    expect(groups).toHaveLength(0);
  });
});
