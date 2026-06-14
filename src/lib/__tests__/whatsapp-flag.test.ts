import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isWhatsappEnabledForCompany,
  isWhatsappKillSwitchOn,
  getEnabledCompanyIds,
} from "@/lib/whatsapp-flag";

/**
 * A feature de WhatsApp deve nascer DESLIGADA e isolada: só liga quando o
 * kill-switch global está "true" E o companyId está na allowlist.
 */
describe("whatsapp-flag", () => {
  const ORIGINAL = {
    enabled: process.env.WHATSAPP_INTEGRATION_ENABLED,
    ids: process.env.WHATSAPP_ENABLED_COMPANY_IDS,
  };

  beforeEach(() => {
    delete process.env.WHATSAPP_INTEGRATION_ENABLED;
    delete process.env.WHATSAPP_ENABLED_COMPANY_IDS;
  });

  afterEach(() => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = ORIGINAL.enabled;
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = ORIGINAL.ids;
  });

  it("desligada por padrão (sem env)", () => {
    expect(isWhatsappKillSwitchOn()).toBe(false);
    expect(isWhatsappEnabledForCompany("co1")).toBe(false);
  });

  it("kill-switch ligado mas empresa fora da allowlist → desligada", () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = "co2,co3";
    expect(isWhatsappEnabledForCompany("co1")).toBe(false);
  });

  it("empresa na allowlist mas kill-switch desligado → desligada", () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = "co1";
    expect(isWhatsappEnabledForCompany("co1")).toBe(false);
  });

  it("kill-switch ligado E empresa na allowlist → ligada", () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = "co1, co2 , co3";
    expect(isWhatsappEnabledForCompany("co1")).toBe(true);
    expect(isWhatsappEnabledForCompany("co2")).toBe(true);
    expect(isWhatsappEnabledForCompany("co3")).toBe(true);
  });

  it("companyId vazio nunca habilita", () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = "";
    expect(isWhatsappEnabledForCompany("")).toBe(false);
  });

  it("getEnabledCompanyIds normaliza CSV (trim + filtra vazios)", () => {
    process.env.WHATSAPP_ENABLED_COMPANY_IDS = " co1 ,, co2 ,";
    expect(getEnabledCompanyIds()).toEqual(["co1", "co2"]);
  });

  it('kill-switch só aceita exatamente "true"', () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "1";
    expect(isWhatsappKillSwitchOn()).toBe(false);
    process.env.WHATSAPP_INTEGRATION_ENABLED = "TRUE";
    expect(isWhatsappKillSwitchOn()).toBe(false);
    process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    expect(isWhatsappKillSwitchOn()).toBe(true);
  });
});
