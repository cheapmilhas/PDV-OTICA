/**
 * Limpeza de segurança — neutraliza HTML injetado em nomes (XSS armazenado).
 *
 * Contexto: em 2026-07-06 foi encontrada uma empresa com documento HTML
 * malicioso (overlay de clickjacking) gravado em Company.name/tradeName,
 * propagado para Branch.name e CompanySettings.displayName. A correção de
 * ENTRADA já está no código (as rotas de cadastro rejeitam HTML); este script
 * limpa dados JÁ gravados.
 *
 * Uso (na máquina/ambiente com o DATABASE_URL do banco alvo, ex.: PRODUÇÃO):
 *   node scripts/limpar-xss-company-name.mjs           # dry-run: só LISTA
 *   node scripts/limpar-xss-company-name.mjs --apply   # aplica a limpeza
 *
 * O dry-run não altera nada — rode primeiro, confira a lista, depois --apply.
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const PLACEHOLDER = "[cadastro inválido - removido por segurança]";
const hasHtml = (s) => typeof s === "string" && /[<>]/.test(s);

const prisma = new PrismaClient();

try {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, tradeName: true },
  });
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const settings = await prisma.companySettings.findMany({
    select: { id: true, displayName: true },
  });

  const dirtyCompanies = companies.filter((c) => hasHtml(c.name) || hasHtml(c.tradeName));
  const dirtyBranches = branches.filter((b) => hasHtml(b.name));
  const dirtySettings = settings.filter((s) => hasHtml(s.displayName));

  console.log(`Modo: ${APPLY ? "APLICAR" : "DRY-RUN (só listagem)"}`);
  console.log(`Company suspeitas: ${dirtyCompanies.length}`);
  dirtyCompanies.forEach((c) => console.log(`  - ${c.id}`));
  console.log(`Branch suspeitas: ${dirtyBranches.length}`);
  dirtyBranches.forEach((b) => console.log(`  - ${b.id}`));
  console.log(`CompanySettings suspeitas: ${dirtySettings.length}`);
  dirtySettings.forEach((s) => console.log(`  - ${s.id}`));

  if (!APPLY) {
    console.log("\nDry-run: nada foi alterado. Rode com --apply para limpar.");
  } else {
    for (const c of dirtyCompanies) {
      await prisma.company.update({
        where: { id: c.id },
        data: {
          name: hasHtml(c.name) ? PLACEHOLDER : undefined,
          tradeName: hasHtml(c.tradeName) ? PLACEHOLDER : undefined,
        },
      });
    }
    for (const b of dirtyBranches) {
      await prisma.branch.update({ where: { id: b.id }, data: { name: PLACEHOLDER } });
    }
    for (const s of dirtySettings) {
      await prisma.companySettings.update({
        where: { id: s.id },
        data: { displayName: PLACEHOLDER },
      });
    }
    const remaining =
      (await prisma.company.findMany({ select: { name: true, tradeName: true } })).filter(
        (c) => hasHtml(c.name) || hasHtml(c.tradeName)
      ).length +
      (await prisma.branch.findMany({ select: { name: true } })).filter((b) => hasHtml(b.name)).length +
      (await prisma.companySettings.findMany({ select: { displayName: true } })).filter((s) =>
        hasHtml(s.displayName)
      ).length;
    console.log(`\nAplicado. Registros com HTML restantes: ${remaining} (esperado: 0).`);
  }
} finally {
  await prisma.$disconnect();
}
