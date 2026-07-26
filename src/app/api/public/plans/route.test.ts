import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { plan: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { GET } from "./route";

/** Monta a Request com (ou sem) o parâmetro de produto. */
function req(qs = "") {
  return new Request(`http://localhost/api/public/plans${qs}`);
}

function whereOf(call = 0) {
  return (findMany.mock.calls[call][0] as { where: Record<string, unknown> }).where;
}

describe("GET /api/public/plans — separação de produto", () => {
  beforeEach(() => findMany.mockReset());

  it("SEM query → ótica (VIS_APP): planos medical nunca vazam no funil ótico (P0 Fase 0)", async () => {
    // Os 3 consumidores existentes (registro, pricing-section, upgrade) chamam
    // sem query. Se o default mudasse, o P0 voltaria na hora.
    findMany.mockResolvedValue([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(whereOf()).toEqual({ isActive: true, platformProduct: "VIS_APP" });
  });

  it("?product=optical → mesmo filtro do default", async () => {
    findMany.mockResolvedValue([]);
    await GET(req("?product=optical"));
    expect(whereOf()).toEqual({ isActive: true, platformProduct: "VIS_APP" });
  });

  it("ramo ótico NÃO filtra por selfServiceSelectable (esvaziaria a página de preços)", async () => {
    // Armadilha conhecida: em produção os planos óticos têm a flag em false.
    // Acrescentá-la aqui deixaria a página de preços VAZIA.
    findMany.mockResolvedValue([]);
    await GET(req());
    expect(whereOf()).not.toHaveProperty("selfServiceSelectable");
  });

  it("?product=medical → só planos medical VENDÁVEIS", async () => {
    findMany.mockResolvedValue([]);
    await GET(req("?product=medical"));
    expect(whereOf()).toEqual({
      isActive: true,
      status: "ACTIVE",
      platformProduct: "VIS_MEDICAL",
      selfServiceSelectable: true,
    });
  });

  it("medical exclui o 'Interno — Domus' via selfServiceSelectable", async () => {
    // O plano interno (R$0) existe para uso próprio e não pode ser contratado.
    // O filtro tem que casar com o que o register-medical aceita, senão a pessoa
    // escolheria um plano que o cadastro recusa.
    findMany.mockResolvedValue([]);
    await GET(req("?product=medical"));
    expect(whereOf().selfServiceSelectable).toBe(true);
    expect(whereOf().status).toBe("ACTIVE");
  });

  it("produto desconhecido → 400 e NÃO consulta o banco", async () => {
    // Falhar em silêncio (cair no default) esconderia um link errado no site.
    const res = await GET(req("?product=xpto"));
    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("responde a lista com cache curto", async () => {
    findMany.mockResolvedValue([{ id: "p1", name: "Básico" }]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.plans).toHaveLength(1);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
