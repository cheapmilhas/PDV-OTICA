import { describe, it, expect } from "vitest";
import { isSafePdfLogo, companyHeaderHtml } from "./pdf-header";

describe("isSafePdfLogo (guard do jsPDF)", () => {
  it("aceita data:image/png", () => {
    expect(isSafePdfLogo("data:image/png;base64,AAAA")).toBe(true);
  });
  it("aceita data:image/jpeg e jpg", () => {
    expect(isSafePdfLogo("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isSafePdfLogo("data:image/jpg;base64,AAAA")).toBe(true);
  });
  it("REJEITA webp (derrubaria o jsPDF)", () => {
    expect(isSafePdfLogo("data:image/webp;base64,AAAA")).toBe(false);
  });
  it("rejeita null/undefined/url externa", () => {
    expect(isSafePdfLogo(null)).toBe(false);
    expect(isSafePdfLogo(undefined)).toBe(false);
    expect(isSafePdfLogo("https://x/logo.png")).toBe(false);
  });
});

describe("companyHeaderHtml", () => {
  it("usa <img> para data-URL de imagem (inclusive webp, que o navegador renderiza)", () => {
    const html = companyHeaderHtml({
      companyName: "Óticas Ultra",
      logoUrl: "data:image/webp;base64,AAAA",
    });
    expect(html).toContain("<img");
    expect(html).toContain("Óticas Ultra");
  });
  it("cai no nome em texto quando não há logo", () => {
    const html = companyHeaderHtml({ companyName: "Óticas Ultra" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Óticas Ultra");
  });
  it("escapa HTML do nome (anti-injeção)", () => {
    const html = companyHeaderHtml({ companyName: '<script>x</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
