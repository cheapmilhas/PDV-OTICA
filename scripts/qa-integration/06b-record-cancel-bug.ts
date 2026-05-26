import "./_env-shim";
import { recordBug, recordResult } from "./_state";
import { prisma } from "@/lib/prisma";

async function main() {
  recordBug(
    "saleService.cancel quebra em PRODUÇÃO por drift schema (branchStock.upsert)",
    "CRITICO",
    "src/services/sale.service.ts:529 chama tx.branchStock.upsert para devolver estoque. O Prisma client gera INSERT/UPDATE incluindo cost_price/sale_price/promo_price/margin_percent que não existem no DB → falha 100% das tentativas de cancelar venda. Em prod, vendedor / admin vê 'erro genérico do Prisma' e a venda PERMANECE COMPLETED mesmo após clicar Cancelar.",
    [
      "src/services/sale.service.ts:529 (tx.branchStock.upsert)",
      "Mesmo root cause do schema drift de BranchStock (cost_price column missing)",
    ],
  );

  recordResult(
    "6.1 cancel venda PIX",
    "venda CANCELED + estorno completo",
    "EXCEPTION schema drift (mesma falha do cenário 3)",
    false,
    "Bloqueado pelo schema drift do BranchStock — root cause já documentado",
  );

  await prisma.$disconnect();
}

main();
