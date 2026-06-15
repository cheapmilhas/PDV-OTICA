/**
 * Seed CIRÚRGICO e ADITIVO das permissões do Funil de Leads (leads.*).
 *
 * NÃO apaga nada (ao contrário de seed-permissions.ts / role-permissions.seed.ts,
 * que fazem deleteMany e destroem customizações de clientes em prod).
 *
 * - Upsert por `code` no catálogo Permission (só os leads.*).
 * - Concede aos roles ADMIN/GERENTE/VENDEDOR via @@unique([role, permissionId]),
 *   pulando os que já existem. Idempotente: rodar de novo é no-op.
 *
 * Fonte única: lê os mesmos arquivos que o resto do projeto usa.
 *
 * Rodar: npx tsx prisma/seeds/add-leads-permissions.ts
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS_CATALOG } from "./permissions-catalog";
import { ROLE_PERMISSIONS_MAP } from "./role-permissions-map";

const prisma = new PrismaClient();

const LEADS_PREFIX = "leads.";

async function main() {
  console.log("🎯 Seed aditivo das permissões do Funil (leads.*)\n");

  // 1) Catálogo: upsert só dos leads.*
  const leadsCatalog = PERMISSIONS_CATALOG.filter((p) => p.code.startsWith(LEADS_PREFIX));
  console.log(`Catálogo: ${leadsCatalog.length} permissões leads.* a garantir.`);
  for (const p of leadsCatalog) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: p.description,
        module: p.module,
        category: p.category,
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        module: p.module,
        category: p.category,
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });
    console.log(`  ✓ ${p.code}`);
  }

  // Mapa code -> id (recém-garantido)
  const dbPerms = await prisma.permission.findMany({
    where: { code: { startsWith: LEADS_PREFIX } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(dbPerms.map((p) => [p.code, p.id]));

  // 2) Role grants: só os leads.* de cada role, sem apagar nada
  let granted = 0;
  let skipped = 0;
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const leadsCodes = (codes as string[]).filter((c) => c.startsWith(LEADS_PREFIX));
    for (const code of leadsCodes) {
      const permissionId = idByCode.get(code);
      if (!permissionId) {
        console.warn(`  ⚠️ ${role}: código ${code} não encontrado no catálogo (pulado)`);
        continue;
      }
      const existing = await prisma.rolePermission.findUnique({
        where: { role_permissionId: { role, permissionId } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.rolePermission.create({
        data: { role, permissionId, granted: true },
      });
      granted++;
      console.log(`  + ${role} → ${code}`);
    }
  }

  console.log(`\n✅ Concluído. Grants novos: ${granted}, já existentes: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
