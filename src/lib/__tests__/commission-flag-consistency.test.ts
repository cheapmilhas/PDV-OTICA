import { describe, it, expect, afterEach } from "vitest";
import {
  getCommissionEngine,
  isNewCommissionEngine,
  isLegacyCommissionEngine,
} from "@/lib/commission-flag";

/**
 * CONSISTÊNCIA do kill-switch por ótica.
 *
 * O gravador de venda (sale.service / quote.service) decide por
 * `isLegacyCommissionEngine(companyId)`; as telas (Metas, Relatórios) e as rotas
 * de comissão decidem por `isNewCommissionEngine(companyId)`. Como ambos derivam
 * da MESMA função central `getCommissionEngine(companyId)`, não pode existir um
 * estado em que, para a MESMA ótica, a tela diga "new" e o gravador diga "legacy"
 * (ou vice-versa). Este teste blinda essa invariante.
 */

const ORIGINAL_ENGINE = process.env.COMMISSION_ENGINE;
const ORIGINAL_LIST = process.env.COMMISSION_ENGINE_NEW_COMPANIES;

afterEach(() => {
  if (ORIGINAL_ENGINE === undefined) delete process.env.COMMISSION_ENGINE;
  else process.env.COMMISSION_ENGINE = ORIGINAL_ENGINE;
  if (ORIGINAL_LIST === undefined) delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
  else process.env.COMMISSION_ENGINE_NEW_COMPANIES = ORIGINAL_LIST;
});

// Cenários (env) × óticas testadas — varre lista, global, lixo, ausências.
const SCENARIOS: Array<{ name: string; engine?: string; list?: string }> = [
  { name: "sem config", engine: undefined, list: undefined },
  { name: "lista com piloto", engine: undefined, list: "comp_piloto,comp_b" },
  { name: "lista vazia", engine: undefined, list: "" },
  { name: "lista com lixo", engine: undefined, list: " , , comp_piloto , ,," },
  { name: "global new", engine: "new", list: undefined },
  { name: "global legacy + lista piloto", engine: "legacy", list: "comp_piloto" },
  { name: "global typo + lista piloto", engine: "newx", list: "comp_piloto" },
];

const COMPANIES = ["comp_piloto", "comp_b", "comp_fora", "", " "];

describe("kill-switch — gravador e telas/rotas decidem IGUAL para a mesma ótica", () => {
  for (const sc of SCENARIOS) {
    it(`cenário "${sc.name}": new ⇔ !legacy para toda ótica`, () => {
      if (sc.engine === undefined) delete process.env.COMMISSION_ENGINE;
      else process.env.COMMISSION_ENGINE = sc.engine;
      if (sc.list === undefined) delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
      else process.env.COMMISSION_ENGINE_NEW_COMPANIES = sc.list;

      for (const companyId of COMPANIES) {
        const isNew = isNewCommissionEngine(companyId);
        const isLegacy = isLegacyCommissionEngine(companyId);
        const engine = getCommissionEngine(companyId);

        // Telas/rotas (new) e gravador (legacy) são complementos exatos:
        // exatamente um dos dois é verdadeiro para a mesma ótica.
        expect(isNew).toBe(!isLegacy);
        // E ambos batem com a decisão central única.
        expect(isNew).toBe(engine === "new");
        expect(isLegacy).toBe(engine === "legacy");
      }
    });
  }

  it("invariante direta: a piloto na lista → gravador NÃO grava legado e tela esconde comissão (mesma ótica)", () => {
    delete process.env.COMMISSION_ENGINE;
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "comp_piloto";

    // Gravador: usa isLegacyCommissionEngine → false ⇒ não grava Commission velha.
    expect(isLegacyCommissionEngine("comp_piloto")).toBe(false);
    // Tela/rota: usa isNewCommissionEngine → true ⇒ esconde/recusa comissão legada.
    expect(isNewCommissionEngine("comp_piloto")).toBe(true);

    // Uma ótica fora da lista: o oposto, também coerente entre os dois lados.
    expect(isLegacyCommissionEngine("comp_fora")).toBe(true);
    expect(isNewCommissionEngine("comp_fora")).toBe(false);
  });
});
