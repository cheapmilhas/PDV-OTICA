/**
 * Diagnóstico Bug #3 — Exposição de crédito atual.
 *
 * Lista clientes com AccountReceivable em aberto, destacando os inadimplentes
 * que continuaram comprando a prazo.
 *
 * READ-ONLY. Mascara CPF/nome no output (LGPD).
 */

import { loadDiagnosticEnv } from "./_helpers/env";
import { parseCliArgs, printUsage } from "./_helpers/cli";
import { showBanner } from "./_helpers/banner";
import { createLogger } from "./_helpers/logger";

function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "(sem)";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function maskName(name: string | null | undefined): string {
  if (!name) return "(sem nome)";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0) + "***";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.***`;
}

async function main() {
  const env = loadDiagnosticEnv();
  const opts = parseCliArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage("scripts/diagnose-bug3-credit-exposure.ts");
    return;
  }

  const ok = await showBanner({
    scriptName: "diagnose-bug3-credit-exposure.ts",
    description:
      "Lista clientes com AR em aberto e/ou inadimplentes que continuaram comprando.",
    databaseUrl: env.DATABASE_URL,
    options: opts,
    isReadOnly: true,
  });
  if (!ok) return;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const log = createLogger("diagnose-bug3-credit-exposure");

  try {
    log.info(`Iniciando diagnóstico de exposição de crédito.`);

    const companyFilter = opts.companyId ? { companyId: opts.companyId } : {};
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Buscar clientes com AR em aberto
    const customers = await prisma.customer.findMany({
      where: {
        ...companyFilter,
        accountsReceivable: {
          some: {
            status: { in: ["PENDING"] },
          },
        },
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        companyId: true,
        company: { select: { name: true, tradeName: true } },
        accountsReceivable: {
          where: { status: "PENDING" },
          select: { amount: true, dueDate: true },
        },
        sales: {
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: "COMPLETED",
            payments: { some: { method: "STORE_CREDIT" } },
          },
          select: { id: true, total: true, createdAt: true },
        },
      },
    });

    log.info(`Clientes com AR em aberto: ${customers.length}`);

    interface ExposureRow {
      customerId: string;
      maskedName: string;
      maskedCpf: string;
      totalOpen: number;
      totalOverdue: number;
      oldestOverdueDays: number;
      recentStoreCreditCount: number;
      recentStoreCreditValue: number;
      companyName: string;
    }

    const rows: ExposureRow[] = [];
    let totalExposure = 0;
    let totalOverdueExposure = 0;
    let countCustomersOverdue = 0;
    let countCustomersOverdueWithRecentStoreCredit = 0;

    for (const c of customers) {
      const totalOpen = c.accountsReceivable.reduce(
        (sum, ar) => sum + Number(ar.amount),
        0
      );
      const overdue = c.accountsReceivable.filter(
        (ar) => ar.dueDate < now
      );
      const totalOverdue = overdue.reduce(
        (sum, ar) => sum + Number(ar.amount),
        0
      );
      const oldestOverdueDays =
        overdue.length === 0
          ? 0
          : Math.max(
              ...overdue.map((ar) =>
                Math.floor((now.getTime() - ar.dueDate.getTime()) / (24 * 60 * 60 * 1000))
              )
            );

      const recentStoreCreditCount = c.sales.length;
      const recentStoreCreditValue = c.sales.reduce(
        (sum, s) => sum + Number(s.total),
        0
      );

      totalExposure += totalOpen;
      totalOverdueExposure += totalOverdue;

      if (totalOverdue > 0) {
        countCustomersOverdue++;
        if (recentStoreCreditCount > 0) {
          countCustomersOverdueWithRecentStoreCredit++;
        }
      }

      rows.push({
        customerId: c.id,
        maskedName: maskName(c.name),
        maskedCpf: maskCpf(c.cpf),
        totalOpen,
        totalOverdue,
        oldestOverdueDays,
        recentStoreCreditCount,
        recentStoreCreditValue,
        companyName: c.company.tradeName || c.company.name,
      });
    }

    // 2. Sumário
    log.info("=".repeat(72));
    log.info("RESUMO");
    log.info("=".repeat(72));
    log.info(`Clientes com AR em aberto: ${customers.length}`);
    log.info(`Exposição total (AR pendente): R$ ${totalExposure.toFixed(2)}`);
    log.info(`Exposição vencida: R$ ${totalOverdueExposure.toFixed(2)}`);
    log.info(`Clientes inadimplentes: ${countCustomersOverdue}`);
    log.info(
      `Clientes inadimplentes COM compras a prazo nos últimos 30d: ${countCustomersOverdueWithRecentStoreCredit}`
    );
    log.info("");

    // 3. Top 50 por totalOverdue
    const top50 = rows
      .sort((a, b) => b.totalOverdue - a.totalOverdue)
      .slice(0, 50);

    log.info("Top 50 clientes por valor vencido (CPF/nome mascarados):");
    log.info(
      "  Cliente             CPF              R$ aberto    R$ vencido   Dias atraso  Vendas 30d   R$ 30d        Empresa"
    );
    for (const r of top50) {
      const name = r.maskedName.padEnd(20);
      const cpf = r.maskedCpf.padEnd(16);
      const open = r.totalOpen.toFixed(2).padStart(11);
      const overdue = r.totalOverdue.toFixed(2).padStart(11);
      const days = String(r.oldestOverdueDays).padStart(11);
      const recentN = String(r.recentStoreCreditCount).padStart(11);
      const recentV = r.recentStoreCreditValue.toFixed(2).padStart(11);
      log.info(
        `  ${name} ${cpf} ${open}  ${overdue}  ${days}  ${recentN}  ${recentV}   ${r.companyName}`
      );
    }

    log.info("");
    log.info(`Log completo: ${log.filePath}`);

    log.json("RESULT", {
      totalCustomersWithOpen: customers.length,
      totalExposure,
      totalOverdueExposure,
      countCustomersOverdue,
      countCustomersOverdueWithRecentStoreCredit,
      top50,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
