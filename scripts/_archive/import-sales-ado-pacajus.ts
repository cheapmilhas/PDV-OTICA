/**
 * Script de importação de vendas do sistema antigo ADO Pacajus.
 *
 * Lê o arquivo XLSX com 10.516 vendas e 19.623 itens,
 * e importa como vendas históricas no PDV Ótica.
 *
 * Uso:
 *   DRY_RUN:  npx tsx scripts/import-sales-ado-pacajus.ts
 *   REAL:     DRY_RUN=false npx tsx scripts/import-sales-ado-pacajus.ts
 */

import { PrismaClient, PaymentMethod, ProductType } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const CONFIG = {
  COMPANY_ID: "cmlx4fkjt000092bq1n7rm63g",
  BRANCH_ID: "cmlx4fkr0000292bqtebe57r1",
  DEFAULT_USER_ID: "cmlx4fl53000492bqrp6gg2w3", // Admin Sistema (fallback)
  XLSX_PATH: "./relatorio-vendas-2026-03-17-15-29-ado-pacajus.xlsx",
  DRY_RUN: process.env.DRY_RUN !== "false", // default true
  BATCH_SIZE: 50,
  LEGACY_SOURCE: "ADO_PACAJUS",
};

// ============================================================
// HELPERS
// ============================================================

/** Data serial do Excel → Date do JavaScript */
function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(1899, 11, 30);
  return new Date(excelEpoch.getTime() + serial * 86400000);
}

/** Limpa telefone: remove caracteres não numéricos */
function cleanPhone(phone: string): string {
  if (!phone || phone.includes("---")) return "";
  return phone.replace(/\D/g, "");
}

/** Limpa texto "--- Não informado ---" → vazio */
function cleanField(value: string): string {
  if (!value || value.startsWith("---")) return "";
  return value.trim();
}

/** Infere o tipo do produto pelo nome */
function inferProductType(name: string): ProductType {
  const n = name.toLowerCase();
  if (n.includes("armação") || n.includes("armacao") || n.includes("receituário") || n.includes("receituario")) return "FRAME";
  if (n.includes("solar") || n.includes("clip")) return "SUNGLASSES";
  if (n.includes("lente") || n.includes("visão simples") || n.includes("visao simples") ||
      n.includes("progressiv") || n.includes("bifocal") || n.includes("anti reflexo") ||
      n.includes("fotossen") || n.includes("bluecut") || n.includes("transitions") ||
      n.includes("blue") || n.includes("crizal") || n.includes("zeiss") || n.includes("orma") ||
      n.includes("stylis") || n.includes("varilux") || n.includes("airwear") || n.includes("kodak") ||
      n.includes("wide plus") || n.includes("trivex") || n.includes("poly") || n.includes("ultrax")) return "OPHTHALMIC_LENS";
  if (n.includes("conserto") || n.includes("solda") || n.includes("ajuste") || n.includes("montagem") || n.includes("servico") || n.includes("serviço")) return "SERVICE";
  if (n.includes("limpa") || n.includes("flanela") || n.includes("estojo") || n.includes("cordão") || n.includes("cordao") || n.includes("parafuso") || n.includes("case") || n.includes("spray")) return "ACCESSORY";
  if (n.includes("contact") || n.includes("biofinity") || n.includes("acuvue") || n.includes("biotrue")) return "CONTACT_LENS";
  return "ACCESSORY"; // fallback genérico
}

/** Parseia formas de pagamento da string composta */
function parsePaymentMethods(raw: string, totalAmount: number): Array<{ method: PaymentMethod; amount: number; installments: number; cardBrand?: string; acquirer?: string }> {
  if (!raw || raw.startsWith("---")) {
    return [{ method: "CASH", amount: totalAmount, installments: 1 }];
  }

  // Separar por ", " — mas cuidado: "Rede Master Credito 2 A 12X 10x" é 1 método
  // Estratégia: split por ", " e depois reagrupar se parte começa com número solto
  const parts = raw.split(", ").filter(Boolean);

  const methods: Array<{ method: PaymentMethod; installments: number; cardBrand?: string; acquirer?: string }> = [];

  for (const part of parts) {
    const p = part.trim();
    const pLow = p.toLowerCase();

    // Extrair parcelas (último "Nx" da string)
    const installMatch = p.match(/(\d+)x\s*$/i);
    const installments = installMatch ? parseInt(installMatch[1]) : 1;

    let method: PaymentMethod = "OTHER";
    let cardBrand: string | undefined;
    let acquirer: string | undefined;

    if (pLow === "dinheiro") {
      method = "CASH";
    } else if (pLow === "pix") {
      method = "PIX";
    } else if (pLow.includes("transferência") || pLow.includes("transferencia")) {
      method = "PIX"; // Transferência → tratamos como PIX
    } else if (pLow === "saldo a receber" || pLow.startsWith("autorizado")) {
      method = "BALANCE_DUE";
    } else if (pLow.includes("crediario proprio") || pLow.includes("crediário proprio")) {
      method = "STORE_CREDIT";
    } else if (pLow.includes("debito") || pLow.includes("débito")) {
      method = "DEBIT_CARD";
      // Extrair bandeira/adquirente
      if (pLow.includes("rede")) {
        acquirer = "Rede";
        if (pLow.includes("visa")) cardBrand = "Visa";
        else if (pLow.includes("master")) cardBrand = "Mastercard";
        else if (pLow.includes("elo")) cardBrand = "Elo";
        else if (pLow.includes("amex")) cardBrand = "Amex";
        else if (pLow.includes("hiper")) cardBrand = "Hipercard";
        else if (pLow.includes("diners")) cardBrand = "Diners";
      }
    } else if (pLow.includes("credito") || pLow.includes("crédito") ||
               pLow.includes("brasilcard") || pLow.includes("fortbrasil") ||
               pLow.includes("credz") || pLow.includes("blu") ||
               pLow.includes("toncard") || pLow.includes("cartao")) {
      method = "CREDIT_CARD";
      if (pLow.includes("rede")) {
        acquirer = "Rede";
        if (pLow.includes("visa")) cardBrand = "Visa";
        else if (pLow.includes("master")) cardBrand = "Mastercard";
        else if (pLow.includes("elo")) cardBrand = "Elo";
        else if (pLow.includes("amex")) cardBrand = "Amex";
        else if (pLow.includes("hiper")) cardBrand = "Hipercard";
        else if (pLow.includes("diners")) cardBrand = "Diners";
      }
      if (pLow.includes("brasilcard")) { cardBrand = "Brasilcard"; acquirer = "Brasilcard"; }
      if (pLow.includes("fortbrasil")) { cardBrand = "Fortbrasil"; acquirer = "Fortbrasil"; }
      if (pLow.includes("credz")) { cardBrand = "Credz"; acquirer = "Credz"; }
      if (pLow.includes("blu")) { acquirer = "Blu"; }
      if (pLow.includes("toncard")) { cardBrand = "Toncard"; acquirer = "Toncard"; }
    } else if (pLow.includes("sum")) {
      method = "CREDIT_CARD";
      acquirer = "SumUp";
    } else if (pLow.includes("cheque")) {
      method = "CHEQUE";
    } else {
      method = "OTHER";
    }

    // BALANCE_DUE e STORE_CREDIT não têm parcelas — o "Nx" é repetição do método
    const finalInstallments = (method === "BALANCE_DUE" || method === "STORE_CREDIT") ? 1 : installments;

    methods.push({ method, installments: finalInstallments, cardBrand, acquirer });
  }

  if (methods.length === 0) {
    return [{ method: "CASH", amount: totalAmount, installments: 1 }];
  }

  // Dividir valor igualmente entre os métodos
  const amountEach = Math.round((totalAmount / methods.length) * 100) / 100;
  const remainder = Math.round((totalAmount - amountEach * methods.length) * 100) / 100;

  return methods.map((m, i) => ({
    ...m,
    amount: i === 0 ? amountEach + remainder : amountEach,
  }));
}

// ============================================================
// TIPOS
// ============================================================

interface ParsedSale {
  legacyNumber: number;
  date: Date;
  employeeName: string;
  customerName: string;
  customerDoc: string;
  customerAddress: string;
  customerPhone: string;
  customerEmail: string;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentRaw: string;
  notes: string;
  items: ParsedItem[];
}

interface ParsedItem {
  reference: string;
  description: string;
  quantity: number;
  originalPrice: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
}

// ============================================================
// PARSE DA PLANILHA
// ============================================================

function parseXLSX(filePath: string): ParsedSale[] {
  console.log(`Lendo arquivo: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
  console.log(`Total de linhas: ${rows.length}`);

  const sales: ParsedSale[] = [];
  let currentSale: ParsedSale | null = null;

  for (const row of rows) {
    const saleNumber = row["Nº Venda"];

    if (saleNumber !== "" && saleNumber !== undefined && saleNumber !== null) {
      // Linha de cabeçalho — salvar venda anterior e iniciar nova
      if (currentSale && currentSale.items.length > 0) {
        sales.push(currentSale);
      }

      const dateSerial = row["Data da venda"];
      const date = typeof dateSerial === "number" ? excelSerialToDate(dateSerial) : new Date();

      currentSale = {
        legacyNumber: typeof saleNumber === "number" ? saleNumber : parseInt(saleNumber),
        date,
        employeeName: String(row["Funcionário"] || "").trim(),
        customerName: String(row["Cliente"] || "").trim(),
        customerDoc: cleanField(String(row["Documento"] || "")),
        customerAddress: cleanField(String(row["Endereço"] || "")),
        customerPhone: cleanPhone(String(row["Telefone"] || "")),
        customerEmail: cleanField(String(row["E-mail"] || "")),
        totalAmount: parseFloat(row["Valor Total"]) || 0,
        discountAmount: parseFloat(row["Desconto/Acréscimo informado na Venda"]) || 0,
        netAmount: parseFloat(row["Valor Líquido"]) || 0,
        paymentRaw: String(row["Forma de pagamento"] || ""),
        notes: cleanField(String(row["Observação da venda"] || "")),
        items: [],
      };
    } else {
      // Linha de item
      const desc = String(row["Item - Descrição"] || "").trim();
      const ref = String(row["Item - Referência"] || "").trim();

      if ((desc || ref) && currentSale) {
        const originalPrice = parseFloat(row["Item - Valor Original"]) || 0;
        const unitPrice = parseFloat(row["Item - Valor Unitário"]) || originalPrice;
        const lineTotal = parseFloat(row["Item - Valor Total Líquido"]) || unitPrice;
        const discount = Math.max(0, originalPrice - unitPrice);

        currentSale.items.push({
          reference: ref,
          description: desc || `Produto ${ref}`,
          quantity: parseInt(row["Item - Quantidade"]) || 1,
          originalPrice,
          unitPrice,
          lineTotal,
          discount,
        });
      }
    }
  }

  // Última venda
  if (currentSale && currentSale.items.length > 0) {
    sales.push(currentSale);
  }

  console.log(`Vendas parseadas: ${sales.length}`);
  console.log(`Itens totais: ${sales.reduce((sum, s) => sum + s.items.length, 0)}`);
  return sales;
}

// ============================================================
// IMPORTAÇÃO
// ============================================================

async function importSales() {
  console.log("\n========================================");
  console.log("  IMPORTAÇÃO DE VENDAS — ADO PACAJUS");
  console.log(`  Modo: ${CONFIG.DRY_RUN ? "DRY RUN (simulação)" : "REAL (gravando no banco)"}`);
  console.log("========================================\n");

  // 1. Parsear planilha
  const sales = parseXLSX(CONFIG.XLSX_PATH);

  // 2. Carregar mapa de funcionários
  const users = await prisma.user.findMany({
    where: { companyId: CONFIG.COMPANY_ID },
    select: { id: true, name: true },
  });
  const userMap = new Map<string, string>();
  for (const u of users) {
    userMap.set(u.name.toLowerCase(), u.id);
    // Também por primeiro nome
    const firstName = u.name.split(" ")[0].toLowerCase();
    if (!userMap.has(firstName)) userMap.set(firstName, u.id);
  }
  console.log(`Funcionários mapeados: ${userMap.size} entradas`);

  // 3. Cache de clientes e produtos
  const customerCache = new Map<string, string>(); // nome+tel → id
  const productCache = new Map<string, string>();   // referencia → id

  // Pre-carregar clientes existentes
  const existingCustomers = await prisma.customer.findMany({
    where: { companyId: CONFIG.COMPANY_ID },
    select: { id: true, name: true, phone: true },
  });
  for (const c of existingCustomers) {
    customerCache.set(c.name.toLowerCase(), c.id);
    if (c.phone) customerCache.set(`phone:${cleanPhone(c.phone)}`, c.id);
  }
  console.log(`Clientes pré-carregados: ${existingCustomers.length}`);

  // Pre-carregar TODOS os produtos (incluindo os já importados via ADO-)
  const existingProducts = await prisma.product.findMany({
    where: { companyId: CONFIG.COMPANY_ID },
    select: { id: true, name: true, sku: true },
  });
  for (const p of existingProducts) {
    productCache.set(p.sku.toLowerCase(), p.id);
    productCache.set(p.name.toLowerCase(), p.id);
  }
  console.log(`Produtos pré-carregados: ${existingProducts.length} (incluindo ADO-)`);

  // 4. Contadores
  let imported = 0, skipped = 0, errors = 0;
  let customersCreated = 0, customersFound = 0;
  let productsCreated = 0, productsFound = 0;
  let paymentsCreated = 0;
  const unmatchedEmployees = new Set<string>();
  const errorList: string[] = [];

  // 5. Processar vendas
  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const legacyId = `ADO_PACAJUS_${sale.legacyNumber}`;

    // Progresso
    if ((i + 1) % 500 === 0 || i === 0) {
      console.log(`[${i + 1}/${sales.length}] Processando venda #${sale.legacyNumber}...`);
    }

    try {
      // Verificar duplicata
      if (!CONFIG.DRY_RUN) {
        const existing = await prisma.sale.findUnique({ where: { legacyId } });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Resolver funcionário
      const empLower = sale.employeeName.toLowerCase();
      let userId = userMap.get(empLower) || userMap.get(empLower.split(" ")[0]);
      if (!userId) {
        userId = CONFIG.DEFAULT_USER_ID;
        unmatchedEmployees.add(sale.employeeName);
      }

      // Resolver cliente
      let customerId: string | null = null;
      if (sale.customerName && !sale.customerName.startsWith("---")) {
        const cacheKey = sale.customerName.toLowerCase();
        customerId = customerCache.get(cacheKey) || null;

        if (!customerId && sale.customerPhone) {
          customerId = customerCache.get(`phone:${sale.customerPhone}`) || null;
        }

        if (!customerId && !CONFIG.DRY_RUN) {
          // Criar cliente
          const newCustomer = await prisma.customer.create({
            data: {
              companyId: CONFIG.COMPANY_ID,
              name: sale.customerName,
              phone: sale.customerPhone || null,
              cpf: sale.customerDoc || null,
              address: sale.customerAddress || null,
              email: sale.customerEmail || null,
              externalId: `ADO_CLIENTE_${cacheKey.replace(/\s+/g, "_").substring(0, 50)}`,
            },
          });
          customerId = newCustomer.id;
          customerCache.set(cacheKey, customerId);
          if (sale.customerPhone) customerCache.set(`phone:${sale.customerPhone}`, customerId);
          customersCreated++;
        } else if (customerId) {
          customersFound++;
        }
      }

      // Resolver itens
      const itemsData: Array<{
        productId: string | null;
        description: string;
        qty: number;
        unitPrice: number;
        discount: number;
        lineTotal: number;
      }> = [];

      for (const item of sale.items) {
        let productId: string | null = null;
        const refKey = item.reference ? `ado-${item.reference}`.toLowerCase() : "";
        const nameKey = item.description.toLowerCase();

        productId = (refKey ? productCache.get(refKey) : null) || productCache.get(nameKey) || null;

        if (!productId && !CONFIG.DRY_RUN) {
          const sku = item.reference ? `ADO-${item.reference}` : `ADO-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const newProduct = await prisma.product.create({
            data: {
              companyId: CONFIG.COMPANY_ID,
              name: item.description,
              sku,
              salePrice: item.unitPrice,
              costPrice: 0,
              stockQty: 0,
              stockMin: 0,
              type: inferProductType(item.description),
              active: true,
              stockControlled: false, // Produto histórico, sem controle de estoque
            },
          });
          productId = newProduct.id;
          if (refKey) productCache.set(refKey, productId);
          productCache.set(nameKey, productId);
          productsCreated++;
        } else if (productId) {
          productsFound++;
        }

        itemsData.push({
          productId,
          description: item.description,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount * item.quantity,
          lineTotal: item.lineTotal,
        });
      }

      // Parsear pagamentos
      const payments = parsePaymentMethods(sale.paymentRaw, sale.netAmount);

      // Criar venda
      if (!CONFIG.DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          const newSale = await tx.sale.create({
            data: {
              companyId: CONFIG.COMPANY_ID,
              branchId: CONFIG.BRANCH_ID,
              customerId,
              sellerUserId: userId!,
              status: "COMPLETED",
              subtotal: sale.totalAmount,
              discountTotal: sale.discountAmount,
              total: sale.netAmount,
              completedAt: sale.date,
              createdAt: sale.date,
              legacyId,
              legacySource: CONFIG.LEGACY_SOURCE,
            },
          });

          // Itens
          for (const item of itemsData) {
            await tx.saleItem.create({
              data: {
                saleId: newSale.id,
                productId: item.productId,
                description: item.description,
                qty: item.qty,
                unitPrice: item.unitPrice,
                discount: item.discount,
                lineTotal: item.lineTotal,
                costPrice: 0,
                stockControlled: false,
              },
            });
          }

          // Pagamentos
          for (const pay of payments) {
            await tx.salePayment.create({
              data: {
                saleId: newSale.id,
                method: pay.method,
                amount: pay.amount,
                installments: pay.installments,
                status: "RECEIVED",
                receivedAt: sale.date,
                cardBrand: pay.cardBrand,
                acquirer: pay.acquirer,
              },
            });
            paymentsCreated++;
          }
        });
      } else {
        paymentsCreated += payments.length;
      }

      imported++;
    } catch (err: any) {
      errors++;
      const msg = `Venda #${sale.legacyNumber}: ${err.message?.substring(0, 100)}`;
      errorList.push(msg);
      if (errors <= 10) console.error(`  ERRO: ${msg}`);
    }
  }

  // 6. Relatório
  console.log("\n============================================");
  console.log("  RELATÓRIO DE IMPORTAÇÃO — ADO PACAJUS");
  console.log(`  Modo: ${CONFIG.DRY_RUN ? "DRY RUN" : "REAL"}`);
  console.log("============================================");
  console.log(`Total de vendas na planilha: ${sales.length}`);
  console.log(`Vendas importadas: ${imported}`);
  console.log(`Vendas já existentes (puladas): ${skipped}`);
  console.log(`Vendas com erro: ${errors}`);
  console.log("");
  console.log(`Clientes encontrados: ${customersFound}`);
  console.log(`Clientes criados: ${CONFIG.DRY_RUN ? "(simulado)" : customersCreated}`);
  console.log("");
  console.log(`Produtos encontrados: ${productsFound}`);
  console.log(`Produtos criados: ${CONFIG.DRY_RUN ? "(simulado)" : productsCreated}`);
  console.log("");
  console.log(`Pagamentos criados: ${paymentsCreated}`);
  console.log("");
  if (unmatchedEmployees.size > 0) {
    console.log(`Funcionários não mapeados (usando fallback):`);
    [...unmatchedEmployees].forEach(e => console.log(`  - ${e}`));
  }
  if (errorList.length > 0) {
    console.log(`\nErros (primeiros 20):`);
    errorList.slice(0, 20).forEach(e => console.log(`  - ${e}`));
  }
  console.log("============================================");
}

// ============================================================
// EXECUÇÃO
// ============================================================

importSales()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
