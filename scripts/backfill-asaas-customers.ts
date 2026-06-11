/**
 * Backfill de customers no Asaas (Fase A) — cria o customer no Asaas de PRODUÇÃO
 * para empresas EXISTENTES que ainda não têm `asaasCustomerId` na subscription.
 *
 * ⚠️ Toca o Asaas de PRODUÇÃO: CRIA customers (cadastro), mas NÃO gera cobrança
 *    e NÃO move dinheiro. Mesmo assim, rode com cuidado.
 *
 * SEGURANÇA:
 *   - DRY-RUN é o padrão (sem `--apply` nada é criado, só simula e loga).
 *   - Exige `--only=<companyId>` (allowlist). Sem isso, não faz nada.
 *   - `--apply` SEM `--only` é bloqueado (evita aplicação em massa).
 *   - Documento (CPF/CNPJ) é mascarado nos logs (só os últimos 4 dígitos).
 *
 * USO:
 *   # dry-run de uma empresa (não cria nada):
 *   ASAAS_API_KEY="$aact_prod_..." npx tsx scripts/backfill-asaas-customers.ts --only=<companyId>
 *
 *   # dry-run de várias empresas:
 *   ASAAS_API_KEY="$aact_prod_..." npx tsx scripts/backfill-asaas-customers.ts --only=id1,id2 --only=id3
 *
 *   # aplicar de verdade (cria no Asaas) — exige --only:
 *   ASAAS_API_KEY="$aact_prod_..." npx tsx scripts/backfill-asaas-customers.ts --only=<companyId> --apply
 */
import { PrismaClient } from "@prisma/client";
import { ensureAsaasCustomer } from "@/services/asaas-customer.service";

const prisma = new PrismaClient();

interface Args {
  onlyIds: Set<string>;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const onlyIds = new Set<string>();
  let apply = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--only=")) {
      const raw = arg.slice("--only=".length);
      for (const id of raw.split(",")) {
        const trimmed = id.trim();
        if (trimmed) onlyIds.add(trimmed);
      }
    }
  }

  return { onlyIds, apply };
}

function maskDoc(doc: string): string {
  if (!doc) return "(ausente)";
  const last4 = doc.slice(-4);
  return `****${last4}`;
}

async function main() {
  const { onlyIds, apply } = parseArgs(process.argv.slice(2));

  if (apply && onlyIds.size === 0) {
    console.error("ERRO: --apply exige --only=<companyId> (evita aplicar em massa)");
    process.exit(1);
  }

  if (onlyIds.size === 0) {
    console.log("Nenhuma empresa selecionada (use --only=<companyId>)");
    return;
  }

  console.log(`Modo: ${apply ? "APPLY (cria no Asaas de PRODUÇÃO)" : "DRY-RUN (apenas simula)"}`);
  console.log(`Empresas selecionadas: ${onlyIds.size}\n`);

  const summary = { criados: 0, reusados: 0, pulados: 0, erros: 0 };

  for (const companyId of onlyIds) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, cnpj: true, email: true, phone: true },
      });

      if (!company) {
        console.log(`PULA ${companyId}: empresa não encontrada`);
        summary.pulados++;
        continue;
      }

      const nome = company.name;

      // mesmo critério do service: sub não-CANCELED mais recente, com fallback
      let sub = await prisma.subscription.findFirst({
        where: { companyId, status: { not: "CANCELED" } },
        orderBy: { createdAt: "desc" },
      });
      if (!sub) {
        sub = await prisma.subscription.findFirst({
          where: { companyId },
          orderBy: { createdAt: "desc" },
        });
      }

      if (!sub) {
        console.log(`PULA ${nome}: empresa sem subscription`);
        summary.pulados++;
        continue;
      }

      const doc = (company.cnpj ?? "").replace(/\D/g, "");
      if (doc.length !== 11 && doc.length !== 14) {
        console.log(`PULA ${nome}: doc inválido/ausente`);
        summary.pulados++;
        continue;
      }

      if (!company.email) {
        console.log(`PULA ${nome}: sem email (Asaas pode rejeitar)`);
        summary.pulados++;
        continue;
      }

      if (sub.asaasCustomerId) {
        console.log(`JÁ TEM customer: ${nome} (${sub.asaasCustomerId})`);
        summary.reusados++;
        continue;
      }

      if (!apply) {
        console.log(`CRIARIA customer p/ ${nome} | doc=${maskDoc(doc)} | email=${company.email}`);
        continue;
      }

      const r = await ensureAsaasCustomer(companyId);
      console.log(`OK ${nome}: customerId=${r.asaasCustomerId} created=${r.created}`);
      if (r.created) {
        summary.criados++;
      } else {
        summary.reusados++;
      }
    } catch (e) {
      console.error(`ERRO ${companyId}: ${e instanceof Error ? e.message : String(e)}`);
      summary.erros++;
    }
  }

  console.log("\nSumário:", JSON.stringify(summary));
}

main()
  .catch((e) => {
    console.error("ERRO FATAL:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
