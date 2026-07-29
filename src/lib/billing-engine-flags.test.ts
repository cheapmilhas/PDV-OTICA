import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isObligationGenerationEnabled,
  isShadowModeEnabled,
  isIssuanceEnabledForCompany,
  isEnforcementEnabledForCompany,
} from "./billing-engine-flags";

const CHAVES = [
  "BILLING_OBLIGATION_ENABLED",
  "BILLING_SHADOW_ENABLED",
  "BILLING_ISSUE_ENABLED",
  "BILLING_ISSUE_COMPANY_IDS",
  "BILLING_ENFORCEMENT_ENABLED",
  "BILLING_ENFORCEMENT_COMPANY_IDS",
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of CHAVES) {
    original[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of CHAVES) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("as quatro flags nascem DESLIGADAS", () => {
  it("sem nenhuma env var, tudo é false", () => {
    expect(isObligationGenerationEnabled()).toBe(false);
    expect(isShadowModeEnabled()).toBe(false);
    expect(isIssuanceEnabledForCompany("co1")).toBe(false);
    expect(isEnforcementEnabledForCompany("co1")).toBe(false);
  });
});

describe("kill-switches simples", () => {
  it('"true" liga a geração de obrigação', () => {
    process.env.BILLING_OBLIGATION_ENABLED = "true";
    expect(isObligationGenerationEnabled()).toBe(true);
  });

  it('"true" liga o modo sombra', () => {
    process.env.BILLING_SHADOW_ENABLED = "true";
    expect(isShadowModeEnabled()).toBe(true);
  });

  // 🔑 A comparação é com a string EXATA "true". O dono vai digitar isso no
  // painel da Vercel, e "TRUE"/"1"/"yes" NÃO ligam nada — falha na direção
  // segura (motor de cobrança desligado), mas sem aviso nenhum. Este teste
  // documenta o comportamento para que a surpresa apareça aqui, e não em
  // produção com o dono achando que ligou o motor.
  it.each(["TRUE", "True", "1", "yes", "sim", " true", "true "])(
    'valor %j NAO liga a flag (só a string exata "true" liga)',
    (valor) => {
      process.env.BILLING_OBLIGATION_ENABLED = valor;
      expect(isObligationGenerationEnabled()).toBe(false);
    },
  );

  it('"false" e string vazia mantêm desligado', () => {
    process.env.BILLING_SHADOW_ENABLED = "false";
    expect(isShadowModeEnabled()).toBe(false);
    process.env.BILLING_SHADOW_ENABLED = "";
    expect(isShadowModeEnabled()).toBe(false);
  });
});

describe("emissão real exige kill-switch E allowlist (etapa 4)", () => {
  it("kill-switch ligado mas allowlist vazia → ninguém é cobrado", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    expect(isIssuanceEnabledForCompany("co1")).toBe(false);
  });

  it("allowlist preenchida mas kill-switch desligado → ninguém é cobrado", () => {
    process.env.BILLING_ISSUE_COMPANY_IDS = "co1,co2";
    expect(isIssuanceEnabledForCompany("co1")).toBe(false);
  });

  it("os dois ligados → só quem está na coorte", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    process.env.BILLING_ISSUE_COMPANY_IDS = "co1,co2";
    expect(isIssuanceEnabledForCompany("co1")).toBe(true);
    expect(isIssuanceEnabledForCompany("co2")).toBe(true);
    expect(isIssuanceEnabledForCompany("co3")).toBe(false);
  });

  it("CSV tolera espaços e itens vazios", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    process.env.BILLING_ISSUE_COMPANY_IDS = " co1 , ,co2,, ";
    expect(isIssuanceEnabledForCompany("co1")).toBe(true);
    expect(isIssuanceEnabledForCompany("co2")).toBe(true);
  });

  it("companyId vazio nunca passa, nem com allowlist frouxa", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    process.env.BILLING_ISSUE_COMPANY_IDS = " , ,";
    expect(isIssuanceEnabledForCompany("")).toBe(false);
  });
});

describe("enforcement é INDEPENDENTE da emissão (etapa 5 ≠ etapa 4)", () => {
  it("ligar emissão NÃO liga restrição", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    process.env.BILLING_ISSUE_COMPANY_IDS = "co1";
    expect(isIssuanceEnabledForCompany("co1")).toBe(true);
    // Uma flag única faria a etapa 5 ser refém da etapa 4 — o acoplamento que
    // o rollout existe para evitar.
    expect(isEnforcementEnabledForCompany("co1")).toBe(false);
  });

  it("ligar restrição NÃO liga emissão", () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    process.env.BILLING_ENFORCEMENT_COMPANY_IDS = "co1";
    expect(isEnforcementEnabledForCompany("co1")).toBe(true);
    expect(isIssuanceEnabledForCompany("co1")).toBe(false);
  });

  it("as coortes são listas separadas", () => {
    process.env.BILLING_ISSUE_ENABLED = "true";
    process.env.BILLING_ISSUE_COMPANY_IDS = "co1,co2";
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    process.env.BILLING_ENFORCEMENT_COMPANY_IDS = "co1";
    expect(isEnforcementEnabledForCompany("co1")).toBe(true);
    expect(isEnforcementEnabledForCompany("co2")).toBe(false);
  });
});
