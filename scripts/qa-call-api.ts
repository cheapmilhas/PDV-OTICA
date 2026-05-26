/**
 * Faz POST /api/sales direto com dados válidos da Atacadão dos Óculos.
 * Captura corpo de resposta pra ver erro real.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();
const COMPANY_ID = "cmlx4fkjt000092bq1n7rm63g";

async function main() {
  // Carrega cookie de sessão
  const state = JSON.parse(
    fs.readFileSync("qa-artifacts/2026-05-25/auth-state.json", "utf8"),
  );
  const sessionCookie = state.cookies.find(
    (c: any) => c.name === "next-auth.session-token",
  )?.value;
  if (!sessionCookie) throw new Error("Sem cookie de sessão");

  // Pega 1 produto ativo com estoque > 0
  const product = await prisma.product.findFirst({
    where: { companyId: COMPANY_ID, active: true, stockQty: { gt: 0 } },
    select: { id: true, name: true, salePrice: true, stockQty: true },
  });
  if (!product) throw new Error("Sem produto disponível");
  console.log(`Produto: ${product.name} R$${product.salePrice} (estoque ${product.stockQty})`);

  const branch = await prisma.branch.findFirst({
    where: { companyId: COMPANY_ID, active: true },
    select: { id: true, name: true },
  });
  console.log(`Filial: ${branch?.name}`);

  const body = {
    customerId: null,
    branchId: branch!.id,
    items: [
      {
        productId: product.id,
        qty: 1,
        unitPrice: Number(product.salePrice),
        discount: 0,
      },
    ],
    payments: [
      {
        method: "CASH",
        amount: Number(product.salePrice),
        installments: 1,
      },
    ],
    discount: 0,
    cashbackUsed: 0,
    notes: "[QA SMOKE 2026-05-25] venda direta via curl",
  };

  console.log("\nBody enviado:");
  console.log(JSON.stringify(body, null, 2));

  const res = await fetch("http://localhost:3000/api/sales", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `next-auth.session-token=${sessionCookie}`,
    },
    body: JSON.stringify(body),
  });

  console.log(`\nResposta HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log("Body:");
  console.log(text);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
