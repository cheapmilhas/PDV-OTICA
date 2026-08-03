import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fecha o buraco de autorização do painel financeiro (2026-07-31).
 *
 * Antes: todas as telas de `/admin/(painel)/financeiro/**` chamavam
 * `requireAdmin()` puro, que só confere que existe sessão. Como
 * `AdminUser.role` tem `@default(SUPPORT)`, o papel DEFAULT lia a receita
 * consolidada da operadora inteira.
 *
 * Estes testes cobrem três camadas, de propósito:
 *  1. a POLÍTICA  (FINANCE_ROLES / isFinanceRole);
 *  2. o GATE      (requireFinanceAccess redireciona de verdade);
 *  3. a ADOÇÃO    (as telas do financeiro realmente chamam o gate).
 *
 * A camada 3 é a que pega a regressão que mais importa: trocar
 * `requireFinanceAccess()` de volta por `requireAdmin()` numa página passaria
 * batido por qualquer teste que só exercitasse o helper isolado.
 */

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (...a: unknown[]) => cookieGet(...a) }),
}));

const jwtVerify = vi.fn();
vi.mock("jose", () => ({ jwtVerify: (...a: unknown[]) => jwtVerify(...a) }));

vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique: vi.fn() } } }));

/**
 * `redirect()` do Next LANÇA em runtime (nunca retorna). O mock precisa lançar
 * também: se ele só registrasse a chamada e retornasse, o código sob teste
 * seguiria adiante e um gate quebrado poderia parecer aprovado.
 */
class RedirectSignal extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}
const redirect = vi.fn((to: string) => {
  throw new RedirectSignal(to);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { FINANCE_ROLES, isFinanceRole } from "./admin-finance-roles";
import { requireFinanceAccess } from "./admin-session";

const ALL_ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "BILLING"] as const;

function signedInAs(role: string) {
  cookieGet.mockReturnValue({ value: "fake.jwt.token" });
  jwtVerify.mockResolvedValue({
    payload: {
      isAdmin: true,
      id: "admin-1",
      email: "a@b.c",
      name: "A",
      role,
      // 🔑 ESCOPO TOTAL de propósito. `scopeAllCompanies` tem @default(true) no
      // schema, então o escopo não barra ninguém sozinho. Se o teste rodasse
      // com escopo restrito, um SUPPORT barrado não provaria nada — poderia
      // estar sendo barrado pelo escopo, e o teste passaria por vacuidade.
      scopeAllCompanies: true,
    },
  });
}

beforeEach(() => {
  cookieGet.mockReset();
  jwtVerify.mockReset();
  redirect.mockClear();
  process.env.ADMIN_JWT_SECRET = "test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FINANCE_ROLES (política)", () => {
  it("NÃO inclui SUPPORT — é o papel @default do schema e o ponto da correção", () => {
    expect(FINANCE_ROLES).not.toContain("SUPPORT");
    expect(isFinanceRole("SUPPORT")).toBe(false);
  });

  it("inclui SUPER_ADMIN (papel semeado da conta do dono — não trancá-lo fora)", () => {
    expect(isFinanceRole("SUPER_ADMIN")).toBe(true);
  });

  it("inclui ADMIN (coerência com as rotas de escrita financeira que já o aceitam)", () => {
    expect(isFinanceRole("ADMIN")).toBe(true);
  });

  it("inclui BILLING (o enum tem esse papel exatamente para o financeiro)", () => {
    expect(isFinanceRole("BILLING")).toBe(true);
  });

  it("papel desconhecido/ausente não passa (falha fechada)", () => {
    expect(isFinanceRole("VENDEDOR")).toBe(false);
    expect(isFinanceRole("")).toBe(false);
    expect(isFinanceRole(null)).toBe(false);
    expect(isFinanceRole(undefined)).toBe(false);
  });

  it("cobre exatamente 3 dos 4 papéis do enum AdminRole", () => {
    // Trava contra alguém "consertar" um teste vermelho jogando SUPPORT na
    // lista: aí este assert quebra junto.
    const permitidos = ALL_ADMIN_ROLES.filter((r) => isFinanceRole(r));
    expect([...permitidos].sort()).toEqual(["ADMIN", "BILLING", "SUPER_ADMIN"]);
  });
});

describe("requireFinanceAccess (gate)", () => {
  it("SUPPORT é BARRADO mesmo com scopeAllCompanies: true", async () => {
    signedInAs("SUPPORT");
    await expect(requireFinanceAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/admin?error=unauthorized");
  });

  it.each(["SUPER_ADMIN", "ADMIN", "BILLING"])("%s passa e recebe o payload", async (role) => {
    signedInAs(role);
    const admin = await requireFinanceAccess();
    expect(admin.role).toBe(role);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sem sessão vai para o login (não para o painel)", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireFinanceAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("JWT inválido não vira acesso (falha fechada)", async () => {
    cookieGet.mockReturnValue({ value: "adulterado" });
    jwtVerify.mockRejectedValue(new Error("invalid signature"));
    await expect(requireFinanceAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("token sem isAdmin não passa, mesmo com papel financeiro no payload", async () => {
    cookieGet.mockReturnValue({ value: "t" });
    jwtVerify.mockResolvedValue({ payload: { isAdmin: false, role: "SUPER_ADMIN" } });
    await expect(requireFinanceAccess()).rejects.toBeInstanceOf(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });
});

/**
 * ADOÇÃO — o teste que pega a regressão real.
 *
 * Um gate perfeito não protege nada se a página não o chamar. Este bloco lê os
 * arquivos de página e exige que NENHUM deles use `requireAdmin()` puro.
 * Ler o fonte (em vez de importar a página) é intencional: Server Components
 * do App Router arrastam prisma, `getProductContext`, etc. — mockar tudo isso
 * dá um teste frágil que quebra por motivo errado. Aqui a asserção é sobre o
 * fato que importa: qual gate a tela invoca.
 */
describe("adoção nas telas de /admin/(painel)/financeiro", () => {
  const PAGINAS = [
    "page.tsx",
    "faturas/page.tsx",
    "faturas/[id]/page.tsx",
    "inadimplencia/page.tsx",
  ];
  const BASE = join(process.cwd(), "src/app/admin/(painel)/financeiro");

  it.each(PAGINAS)("%s usa requireFinanceAccess e não requireAdmin() puro", (rel) => {
    const src = readFileSync(join(BASE, rel), "utf8");
    expect(src).toContain("requireFinanceAccess");
    // `requireAdmin()` com parênteses vazios = a versão SEM checagem de papel.
    // (`requireAdminRole([...])` não casa com este regex, de propósito.)
    expect(src).not.toMatch(/\brequireAdmin\(\s*\)/);
  });

  it("a lista de páginas cobre TODAS as telas do financeiro (nada novo escapa)", () => {
    // Se alguém adicionar uma tela sob financeiro/ sem gate, esta contagem
    // denuncia — senão o it.each acima protege só o que já conhecíamos.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const encontradas = execSync(`find "${BASE}" -name "page.tsx"`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((p) => p.slice(BASE.length + 1))
      .sort();
    expect(encontradas).toEqual([...PAGINAS].sort());
  });
});
