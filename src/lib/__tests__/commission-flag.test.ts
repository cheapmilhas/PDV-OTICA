import { describe, it, expect, afterEach } from "vitest";
import {
  getCommissionEngine,
  isNewCommissionEngine,
  isLegacyCommissionEngine,
} from "@/lib/commission-flag";

/**
 * Kill-switch COMMISSION_ENGINE — Comissão Fase 2, agora POR ÓTICA (companyId).
 *
 * Resolução: companyId ausente → legacy; companyId na lista
 * COMMISSION_ENGINE_NEW_COMPANIES → new; senão cai no global COMMISSION_ENGINE
 * (legacy por default). FAIL-SAFE: sem config = todos em legacy; lixo na lista
 * nunca liga new; a regra nova só liga por companyId explícito (ou global "new").
 */

const ORIGINAL_ENGINE = process.env.COMMISSION_ENGINE;
const ORIGINAL_LIST = process.env.COMMISSION_ENGINE_NEW_COMPANIES;

function restore(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

afterEach(() => {
  restore("COMMISSION_ENGINE", ORIGINAL_ENGINE);
  restore("COMMISSION_ENGINE_NEW_COMPANIES", ORIGINAL_LIST);
});

describe("commission-flag (kill-switch POR ÓTICA) — FAIL-SAFE default legacy", () => {
  it("sem config nenhuma (env ausentes) → qualquer ótica = legacy", () => {
    delete process.env.COMMISSION_ENGINE;
    delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
    expect(getCommissionEngine("comp_qualquer")).toBe("legacy");
    expect(isLegacyCommissionEngine("comp_qualquer")).toBe(true);
    expect(isNewCommissionEngine("comp_qualquer")).toBe(false);
  });

  it("companyId NA lista → new; FORA da lista → legacy", () => {
    delete process.env.COMMISSION_ENGINE;
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "comp_piloto,comp_outra";
    expect(getCommissionEngine("comp_piloto")).toBe("new");
    expect(isNewCommissionEngine("comp_piloto")).toBe(true);
    expect(getCommissionEngine("comp_fora")).toBe("legacy");
    expect(isNewCommissionEngine("comp_fora")).toBe(false);
  });

  it("lista VAZIA → ninguém em new (todos legacy)", () => {
    delete process.env.COMMISSION_ENGINE;
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "";
    expect(getCommissionEngine("comp_a")).toBe("legacy");
    expect(getCommissionEngine("comp_b")).toBe("legacy");
  });

  it("lista com LIXO/espaços → só os companyIds válidos ligam new; lixo é ignorado", () => {
    delete process.env.COMMISSION_ENGINE;
    // vírgulas soltas, espaços, itens vazios — nada disso pode ligar new indevido.
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = " , ,  comp_piloto  , ,,";
    expect(getCommissionEngine("comp_piloto")).toBe("new"); // trim funciona
    expect(getCommissionEngine("")).toBe("legacy"); // string vazia nunca casa
    expect(getCommissionEngine(" ")).toBe("legacy");
    expect(getCommissionEngine("comp_outra")).toBe("legacy");
  });

  it("companyId AUSENTE/indefinido → legacy (nunca new), mesmo com lista cheia", () => {
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "comp_piloto";
    expect(getCommissionEngine(undefined)).toBe("legacy");
    expect(getCommissionEngine(null)).toBe("legacy");
    expect(getCommissionEngine()).toBe("legacy");
    expect(isNewCommissionEngine(undefined)).toBe(false);
  });

  it("global COMMISSION_ENGINE=new → liga new para óticas FORA da lista (override global explícito)", () => {
    process.env.COMMISSION_ENGINE = "new";
    delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
    expect(getCommissionEngine("comp_qualquer")).toBe("new");
    // mas companyId ausente continua legacy (fail-safe vence o global)
    expect(getCommissionEngine(undefined)).toBe("legacy");
  });

  it("global inválido/typo → legacy para quem não está na lista", () => {
    delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
    for (const v of ["", "NEW", "News", "newx", "qualquer-coisa", " new "]) {
      process.env.COMMISSION_ENGINE = v;
      expect(getCommissionEngine("comp_x"), `'${v}' deveria cair em legacy`).toBe("legacy");
    }
  });

  it("lista tem precedência sobre global legacy: ótica na lista = new mesmo com global legacy", () => {
    process.env.COMMISSION_ENGINE = "legacy";
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "comp_piloto";
    expect(getCommissionEngine("comp_piloto")).toBe("new");
    expect(getCommissionEngine("comp_fora")).toBe("legacy");
  });
});
