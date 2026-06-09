import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "./templates";

describe("email templates", () => {
  it("renderiza convite com HTML escapado", () => {
    const email = renderEmailTemplate("invite", {
      name: "<Admin>",
      companyName: "Otica & Cia",
      activationUrl: "https://app.example.com/activate?token=abc",
      expiresAt: "2026-06-10T12:00:00.000Z",
    });

    expect(email.html).toContain("&lt;Admin&gt;");
    expect(email.html).toContain("Otica &amp; Cia");
    expect(email.html).toContain("https://app.example.com/activate?token=abc");
    expect(email.text).toContain("Ative seu acesso");
  });

  it("rejeita template desconhecido", () => {
    expect(() => renderEmailTemplate("unknown", {})).toThrow(/Unsupported email template/);
  });
});
