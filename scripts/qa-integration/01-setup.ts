/**
 * Cenário 1 — Setup do ambiente de teste.
 *
 * Cria EMPRESA NOVA com prefixo TESTE_QA_<ts> para isolar 100% dos dados clonados.
 * Cria Branch, ADMIN User, 2 Products (FRAME + OPHTHALMIC_LENS) com estoque conhecido.
 *
 * Salva IDs em scripts/qa-integration/.state.json.
 */
import bcrypt from "bcryptjs";
import { getTestPrisma, disconnectTestPrisma, TEST_QA_PREFIX } from "./_prisma";
import { saveState, type TestState } from "./_state";

async function main() {
  const prisma = getTestPrisma();
  const prefix = TEST_QA_PREFIX;

  console.log(`[QA] Prefixo: ${prefix}`);

  // 1. Empresa
  const company = await prisma.company.create({
    data: {
      name: `${prefix}_Otica`,
      tradeName: `${prefix}_Trade`,
      cnpj: null, // unique, deixa null
      email: `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}@qa.test`,
      slug: prefix.toLowerCase().replace(/[^a-z0-9]/g, ""),
      onboardingStep: 99,
      onboardingDoneAt: new Date(),
      accessEnabled: true,
      accessEnabledAt: new Date(),
      maxUsers: 10,
      maxProducts: 1000,
      maxBranches: 5,
    },
  });
  console.log(`[QA] Company: ${company.id} (${company.name})`);

  // 2. Branch
  const branch = await prisma.branch.create({
    data: {
      companyId: company.id,
      name: `${prefix}_Filial_A`,
      code: "QA-A",
      city: "Fortaleza",
      state: "CE",
      active: true,
    },
  });
  console.log(`[QA] Branch: ${branch.id} (${branch.name})`);

  // 3. ADMIN User
  const passwordHash = await bcrypt.hash("TesteQA_2026!", 10);
  const admin = await prisma.user.create({
    data: {
      companyId: company.id,
      name: `${prefix}_Admin`,
      email: `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}@qa.test`,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });
  // Liga admin à branch (UserBranch)
  await prisma.userBranch.create({
    data: { userId: admin.id, branchId: branch.id },
  });
  console.log(`[QA] ADMIN User: ${admin.id} (${admin.email})`);

  // 4. Produtos com estoque conhecido
  const frame = await prisma.product.create({
    data: {
      companyId: company.id,
      type: "FRAME",
      sku: `${prefix}-FRAME-001`,
      name: `${prefix}_Armacao_Ray-Ban_RB001`,
      costPrice: 80,
      salePrice: 200,
      stockControlled: true,
      stockQty: 50,
      stockMin: 5,
      active: true,
    },
  });
  console.log(
    `[QA] Product FRAME: ${frame.id} | stock=${frame.stockQty} | sale=${frame.salePrice}`,
  );

  const lens = await prisma.product.create({
    data: {
      companyId: company.id,
      type: "OPHTHALMIC_LENS",
      sku: `${prefix}-LENS-001`,
      name: `${prefix}_Lente_Visao_Simples_CR39`,
      costPrice: 40,
      salePrice: 150,
      stockControlled: true,
      stockQty: 30,
      stockMin: 3,
      active: true,
    },
  });
  console.log(
    `[QA] Product LENS:  ${lens.id} | stock=${lens.stockQty} | sale=${lens.salePrice}`,
  );

  const state: TestState = {
    prefix,
    startedAt: new Date().toISOString(),
    companyId: company.id,
    branchId: branch.id,
    adminUserId: admin.id,
    frameProductId: frame.id,
    lensProductId: lens.id,
    salesCreated: {},
    results: [],
    bugs: [],
  };
  saveState(state);

  console.log("[QA] Setup OK. Estado salvo em scripts/qa-integration/.state.json");

  await disconnectTestPrisma();
}

main().catch((err) => {
  console.error("[QA-FAIL]", err);
  process.exit(1);
});
