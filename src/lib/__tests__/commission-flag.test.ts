import { describe, it, expect, afterEach } from "vitest";
import {
  getCommissionEngine,
  isNewCommissionEngine,
  isLegacyCommissionEngine,
} from "@/lib/commission-flag";

/**
 * Kill-switch COMMISSION_ENGINE — Comissão Fase 2.
 *
 * Default (env não setada) = "new" (regra nova é a oficial). "legacy" só quando
 * explicitamente setado — é o botão de emergência que reverte sem deploy.
 */

const ORIGINAL = process.env.COMMISSION_ENGINE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COMMISSION_ENGINE;
  else process.env.COMMISSION_ENGINE = ORIGINAL;
});

describe("commission-flag (kill-switch) — FAIL-SAFE default legacy", () => {
  it("default (env ausente) = legacy (fail-safe)", () => {
    delete process.env.COMMISSION_ENGINE;
    expect(getCommissionEngine()).toBe("legacy");
    expect(isLegacyCommissionEngine()).toBe(true);
    expect(isNewCommissionEngine()).toBe(false);
  });

  it("COMMISSION_ENGINE=legacy → modo legado", () => {
    process.env.COMMISSION_ENGINE = "legacy";
    expect(getCommissionEngine()).toBe("legacy");
    expect(isLegacyCommissionEngine()).toBe(true);
    expect(isNewCommissionEngine()).toBe(false);
  });

  it("COMMISSION_ENGINE=new (exato) → modo novo (único jeito de ligar)", () => {
    process.env.COMMISSION_ENGINE = "new";
    expect(getCommissionEngine()).toBe("new");
    expect(isNewCommissionEngine()).toBe(true);
    expect(isLegacyCommissionEngine()).toBe(false);
  });

  it("valor inválido/typo/vazio → cai em legacy (fail-safe)", () => {
    for (const v of ["", "NEW", "News", "newx", "qualquer-coisa", " new "]) {
      process.env.COMMISSION_ENGINE = v;
      expect(getCommissionEngine(), `'${v}' deveria cair em legacy`).toBe("legacy");
    }
  });
});
