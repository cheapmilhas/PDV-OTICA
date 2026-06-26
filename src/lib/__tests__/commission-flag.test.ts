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

describe("commission-flag (kill-switch)", () => {
  it("default (env ausente) = new", () => {
    delete process.env.COMMISSION_ENGINE;
    expect(getCommissionEngine()).toBe("new");
    expect(isNewCommissionEngine()).toBe(true);
    expect(isLegacyCommissionEngine()).toBe(false);
  });

  it("COMMISSION_ENGINE=legacy → modo legado (emergência)", () => {
    process.env.COMMISSION_ENGINE = "legacy";
    expect(getCommissionEngine()).toBe("legacy");
    expect(isLegacyCommissionEngine()).toBe(true);
    expect(isNewCommissionEngine()).toBe(false);
  });

  it("COMMISSION_ENGINE=new → modo novo (explícito)", () => {
    process.env.COMMISSION_ENGINE = "new";
    expect(getCommissionEngine()).toBe("new");
    expect(isNewCommissionEngine()).toBe(true);
  });

  it("valor inválido/typo → cai no default new (fail-safe)", () => {
    process.env.COMMISSION_ENGINE = "NEW"; // case-sensitive: não é exatamente "legacy"
    expect(getCommissionEngine()).toBe("new");
    process.env.COMMISSION_ENGINE = "qualquer-coisa";
    expect(getCommissionEngine()).toBe("new");
  });
});
