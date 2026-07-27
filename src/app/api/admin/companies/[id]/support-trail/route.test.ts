import { readFileSync } from "fs";
import { join } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    globalAudit: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/vis-support-audit-client", () => ({
  getSupportAuditFromDomus: vi.fn(),
}));

import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getSupportAuditFromDomus } from "@/lib/vis-support-audit-client";

import { GET } from "./route";

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

/**
 * As asserções acima medem o TEXTO do arquivo: provam que um token APARECE e em
 * que ORDEM. Isso pega reordenação e troca de gate, mas NÃO prova que o valor
 * devolvido pelo gate é usado.
 *
 * A regressão que passava batido nas 6 asserções estruturais: manter a chamada
 * `requireCompanyScope(...)` e apagar o `if (!scoped) return 403`, trocando por
 * `void scoped;`. O token continua no arquivo, a ordem continua certa, e a rota
 * serve a trilha INTEIRA de acesso a PHI para qualquer SUPPORT/BILLING
 * autenticado. Numa rota que é o único ponto de autorização do canal, a rede
 * precisa cobrir o EFEITO.
 */
const ADMIN = {
  id: "admin-1",
  email: "op@vis.com",
  name: "Operador",
  role: "ADMIN",
  isAdmin: true,
};

const mockSession = vi.mocked(getAdminSession);
const mockScope = vi.mocked(requireCompanyScope);
const mockCompany = vi.mocked(prisma.company.findUnique);
const mockAuditRows = vi.mocked(prisma.globalAudit.findMany);
const mockDomus = vi.mocked(getSupportAuditFromDomus);

const params = Promise.resolve({ id: "c1" });

function makeRequest() {
  return new Request("http://localhost/api/admin/companies/c1/support-trail");
}

describe("GET support-trail — o gate é ENFORÇADO, não só chamado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Tudo DEPOIS do gate está no caminho feliz de propósito: se o 403 sumir, a
    // rota chega ao Domus e devolve 200 — que é exatamente a falha a detectar.
    mockCompany.mockResolvedValue({
      domusClinicId: "11111111-1111-1111-1111-111111111111",
    } as never);
    mockAuditRows.mockResolvedValue([] as never);
    mockDomus.mockResolvedValue({ kind: "ok", events: [], truncated: false });
  });

  it("papel sem permissão (SUPPORT/BILLING) ou fora do escopo: 403 e o Domus NUNCA é consultado", async () => {
    mockSession.mockResolvedValue(ADMIN as never);
    // requireCompanyScope revalida o papel no banco e devolve null para
    // SUPPORT/BILLING — é a única coisa entre esse papel e a trilha de PHI.
    mockScope.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(403);
    // A asserção que importa: não basta responder erro, nenhum dado do Domus
    // pode ter sido buscado.
    expect(mockDomus).not.toHaveBeenCalled();
  });

  it("sem sessão de admin: 401 e o Domus NUNCA é consultado", async () => {
    mockSession.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(401);
    expect(mockDomus).not.toHaveBeenCalled();
  });

  it("admin com escopo: 200 — prova que o 403 acima veio do gate, não de mock quebrado", async () => {
    // Contraprova. Sem ela, um mock mal montado faria os dois testes acima
    // passarem por acidente (403/401 por qualquer outro motivo).
    mockSession.mockResolvedValue(ADMIN as never);
    mockScope.mockResolvedValue({ id: ADMIN.id, role: "ADMIN" });

    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(200);
    expect(mockDomus).toHaveBeenCalledTimes(1);
  });
});
