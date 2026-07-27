import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

/**
 * GATE DE PAPEL — a propriedade que nenhum criativo do painel adversarial viu.
 *
 * A página de detalhe do cliente usa `requireSupportScope`, que NÃO checa papel
 * (docstring explícita), e `AdminUser.role` tem default SUPPORT com
 * scopeAllCompanies default true. Sem gate PRÓPRIO, a trilha de quem acessou o
 * PHI nasceria visível para SUPPORT e BILLING em todas as empresas.
 *
 * ⚠️ As asserções de ORDEM medem o CORPO do handler, não o arquivo: varrer o
 * arquivo inteiro mediria o bloco de imports (alfabético) e os comentários.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/app/api/admin/companies/[id]/support-trail/route.ts"),
  "utf8",
);

const inicioDoHandler = SRC.indexOf("export async function GET");
if (inicioDoHandler === -1) {
  throw new Error("marcador do handler não encontrado — ajuste o RECORTE, nunca as asserções");
}
const HANDLER = SRC.slice(inicioDoHandler);

describe("GET support-trail — autorização", () => {
  it("usa requireCompanyScope (que CHECA papel), NUNCA requireSupportScope", () => {
    expect(HANDLER).toContain("requireCompanyScope(");
    // requireSupportScope não checa papel — herdá-lo abriria a trilha para
    // SUPPORT/BILLING, que é exatamente o que este gate existe para impedir.
    expect(SRC).not.toContain("requireSupportScope");
  });

  it("exige sessão de admin ANTES de checar escopo", () => {
    const sessao = HANDLER.indexOf("getAdminSession(");
    const escopo = HANDLER.indexOf("requireCompanyScope(");
    expect(sessao).toBeGreaterThan(-1);
    expect(sessao).toBeLessThan(escopo);
  });

  it("autoriza ANTES de falar com o Domus", () => {
    const escopo = HANDLER.indexOf("requireCompanyScope(");
    const domus = HANDLER.indexOf("getSupportAuditFromDomus(");
    expect(escopo).toBeGreaterThan(-1);
    expect(domus).toBeGreaterThan(-1);
    expect(escopo).toBeLessThan(domus);
  });

  it("o clinicId vem do CADASTRO, nunca de input do operador", () => {
    expect(HANDLER).toContain("domusClinicId");
    expect(HANDLER).not.toContain("searchParams");
  });
});

describe("GET support-trail — degradação", () => {
  it("falha do Domus NUNCA vira lista vazia silenciosa", () => {
    // Trilha vazia que na verdade significa "erro de rede" faria o operador
    // concluir que não houve acesso nenhum.
    expect(HANDLER).toContain("unavailable");
  });

  it("não renderiza o `reason` do cliente (é campo de diagnóstico, texto cru)", () => {
    // Desde a Task 4 o reason carrega `falha_de_rede: <err.message>`. É para
    // log, não para a tela — a rota colapsa tudo em `medical: "unavailable"`.
    expect(HANDLER).not.toContain("remoto.reason");
  });
});
