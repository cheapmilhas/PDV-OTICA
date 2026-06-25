import { prisma } from "@/lib/prisma";
import { Prisma, ProductType } from "@prisma/client";

/**
 * Lógica compartilhada de importação de produtos, reusada pelos DOIS importadores
 * (a tela de produtos `/api/products/import` e `/api/data-management/import/products`).
 *
 * Razão de existir: a importação da tela NÃO criava `BranchStock` e NÃO validava
 * entrada — o produto importado nascia "Disponível: 0" (estoque fantasma) e
 * aceitava preço/estoque inválido em silêncio. Aqui centralizamos:
 *  - resolução multi-tenant da filial de estoque (resolveOwnedBranchId)
 *  - criação ATÔMICA de Product + BranchStock (createProductWithStock)
 *  - validação numérica da linha (validateImportNumbers)
 * para que ambos os caminhos fiquem corretos e iguais.
 */

/**
 * Resolve a filial onde gravar o BranchStock, garantindo multi-tenant: aceita o
 * branchId informado só se for filial ATIVA da própria empresa; senão usa a
 * filial principal (mais antiga). Retorna null se a empresa não tiver filial
 * ativa. Cacheia a filial principal por empresa para evitar lookups repetidos.
 */
export async function resolveOwnedBranchId(
  rowBranchId: string | null | undefined,
  companyId: string,
  mainBranchCache: Map<string, string>
): Promise<string | null> {
  if (rowBranchId) {
    const owned = await prisma.branch.findFirst({
      where: { id: rowBranchId, companyId, active: true },
      select: { id: true },
    });
    if (owned) return owned.id;
    // branchId inválido/de outra empresa: ignora e usa a filial principal.
  }

  const cached = mainBranchCache.get(companyId);
  if (cached) return cached;

  const main = await prisma.branch.findFirst({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (main) mainBranchCache.set(companyId, main.id);
  return main?.id ?? null;
}

export interface ProductImportData {
  companyId: string;
  sku: string;
  name: string;
  type: ProductType;
  barcode?: string | null;
  manufacturerCode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
  costPrice: number;
  salePrice: number;
  promoPrice?: number | null;
  stockControlled: boolean;
  stockQty: number;
  stockMin: number;
  stockMax?: number | null;
  ncm?: string | null;
  cest?: string | null;
  active: boolean;
  featured?: boolean;
  launch?: boolean;
  createdAt?: Date;
  /** Filial preferida do estoque (da planilha). Validada contra a empresa. */
  branchId?: string | null;
}

/**
 * Cria um produto novo + a linha BranchStock da filial, na MESMA transação.
 * Atomicidade é o ponto: se a sincronização do BranchStock falhar, o produto NÃO
 * pode ficar gravado sem estoque por filial — isso recriaria o "estoque
 * fantasma" (tela mostra estoque, venda falha "Disponível: 0").
 *
 * Só grava BranchStock se o produto controla estoque E há filial resolvível.
 */
export async function createProductWithStock(
  data: ProductImportData,
  mainBranchCache: Map<string, string>
): Promise<{ id: string }> {
  const targetBranchId = data.stockControlled
    ? await resolveOwnedBranchId(data.branchId, data.companyId, mainBranchCache)
    : null;

  return prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        companyId: data.companyId,
        sku: data.sku,
        name: data.name,
        type: data.type,
        barcode: data.barcode ?? null,
        manufacturerCode: data.manufacturerCode ?? null,
        description: data.description ?? null,
        categoryId: data.categoryId ?? null,
        brandId: data.brandId ?? null,
        supplierId: data.supplierId ?? null,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        promoPrice: data.promoPrice ?? null,
        stockControlled: data.stockControlled,
        stockQty: data.stockQty,
        stockMin: data.stockMin,
        stockMax: data.stockMax ?? null,
        ncm: data.ncm ?? null,
        cest: data.cest ?? null,
        active: data.active,
        featured: data.featured ?? false,
        launch: data.launch ?? false,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      select: { id: true },
    });

    if (targetBranchId) {
      await tx.branchStock.upsert({
        where: { branchId_productId: { branchId: targetBranchId, productId: created.id } },
        create: { branchId: targetBranchId, productId: created.id, quantity: data.stockQty },
        update: { quantity: data.stockQty },
      });
    }

    return created;
  });
}

/**
 * Atualiza um produto existente e RESSINCRONIZA o BranchStock da filial. Sem
 * isso, reimportar um produto antigo (criado sem BranchStock) nunca conserta o
 * estoque fantasma. Atômico, mesma razão do create.
 */
export async function updateProductWithStock(
  productId: string,
  data: ProductImportData,
  mainBranchCache: Map<string, string>
): Promise<void> {
  const targetBranchId = data.stockControlled
    ? await resolveOwnedBranchId(data.branchId, data.companyId, mainBranchCache)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        barcode: data.barcode ?? null,
        manufacturerCode: data.manufacturerCode ?? null,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        categoryId: data.categoryId ?? null,
        brandId: data.brandId ?? null,
        supplierId: data.supplierId ?? null,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        promoPrice: data.promoPrice ?? null,
        stockControlled: data.stockControlled,
        stockQty: data.stockQty,
        stockMin: data.stockMin,
        stockMax: data.stockMax ?? null,
        ncm: data.ncm ?? null,
        cest: data.cest ?? null,
        active: data.active,
        featured: data.featured ?? false,
        launch: data.launch ?? false,
      },
    });

    if (targetBranchId) {
      await tx.branchStock.upsert({
        where: { branchId_productId: { branchId: targetBranchId, productId } },
        create: { branchId: targetBranchId, productId, quantity: data.stockQty },
        update: { quantity: data.stockQty },
      });
    }
  });
}

// ───────────────────────── Validação de entrada (C3) ─────────────────────────

export interface ParsedNumbers {
  costPrice: number;
  salePrice: number;
  promoPrice: number | null;
  stockQty: number;
  stockMin: number;
  stockMax: number | null;
}

export interface ImportFieldError {
  field: string;
  message: string;
}

/**
 * Converte um valor de célula em número, aceitando formato BR ("1.234,50"),
 * número nativo do XLSX, ou string simples. Retorna null se não for número
 * válido (em vez de virar 0 silenciosamente, que mascarava lixo na planilha).
 */
export function parseNumericCell(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim();
  if (s === "") return null;
  // Formato BR: remove separador de milhar "." e troca decimal "," por "."
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida e parseia os campos numéricos de UMA linha da planilha. Rejeita (não
 * aceita calado): preço de venda ausente/≤0, custo negativo, estoque
 * negativo/fracionário, e texto inválido onde se espera número. Retorna os
 * valores parseados OU a lista de erros de campo (cada um com field+message).
 *
 * Espelha as regras do createProductSchema (salePrice>0, stockQty inteiro≥0,
 * costPrice≥0) — fonte única de regra numérica do cadastro.
 */
export function validateImportNumbers(raw: {
  precoVenda: unknown;
  precoCusto: unknown;
  precoPromocional?: unknown;
  estoqueAtual: unknown;
  estoqueMin: unknown;
  estoqueMax?: unknown;
}): { ok: true; values: ParsedNumbers } | { ok: false; errors: ImportFieldError[] } {
  const errors: ImportFieldError[] = [];

  // Preço de venda — obrigatório e > 0
  const salePrice = parseNumericCell(raw.precoVenda);
  if (salePrice === null) {
    errors.push({ field: "Preço de Venda", message: "valor inválido ou ausente (precisa ser um número)" });
  } else if (salePrice <= 0) {
    errors.push({ field: "Preço de Venda", message: `deve ser maior que zero (recebido: ${salePrice})` });
  }

  // Custo — opcional, default 0, não-negativo
  let costPrice = 0;
  if (raw.precoCusto !== null && raw.precoCusto !== undefined && String(raw.precoCusto).trim() !== "") {
    const c = parseNumericCell(raw.precoCusto);
    if (c === null) errors.push({ field: "Preço de Custo", message: "valor inválido (precisa ser um número)" });
    else if (c < 0) errors.push({ field: "Preço de Custo", message: `não pode ser negativo (recebido: ${c})` });
    else costPrice = c;
  }

  // Preço promocional — opcional, > 0 quando informado
  let promoPrice: number | null = null;
  if (raw.precoPromocional !== null && raw.precoPromocional !== undefined && String(raw.precoPromocional).trim() !== "") {
    const p = parseNumericCell(raw.precoPromocional);
    if (p === null) errors.push({ field: "Preço Promocional", message: "valor inválido (precisa ser um número)" });
    else if (p <= 0) errors.push({ field: "Preço Promocional", message: `deve ser maior que zero (recebido: ${p})` });
    else promoPrice = p;
  }

  // Estoque atual — inteiro ≥ 0
  let stockQty = 0;
  if (raw.estoqueAtual !== null && raw.estoqueAtual !== undefined && String(raw.estoqueAtual).trim() !== "") {
    const q = parseNumericCell(raw.estoqueAtual);
    if (q === null) errors.push({ field: "Quantidade em Estoque", message: "valor inválido (precisa ser um número)" });
    else if (q < 0) errors.push({ field: "Quantidade em Estoque", message: `não pode ser negativo (recebido: ${q})` });
    else if (!Number.isInteger(q)) errors.push({ field: "Quantidade em Estoque", message: `deve ser inteiro (recebido: ${q})` });
    else stockQty = q;
  }

  // Estoque mínimo — inteiro ≥ 0
  let stockMin = 0;
  if (raw.estoqueMin !== null && raw.estoqueMin !== undefined && String(raw.estoqueMin).trim() !== "") {
    const m = parseNumericCell(raw.estoqueMin);
    if (m === null) errors.push({ field: "Estoque Mínimo", message: "valor inválido (precisa ser um número)" });
    else if (m < 0) errors.push({ field: "Estoque Mínimo", message: `não pode ser negativo (recebido: ${m})` });
    else if (!Number.isInteger(m)) errors.push({ field: "Estoque Mínimo", message: `deve ser inteiro (recebido: ${m})` });
    else stockMin = m;
  }

  // Estoque máximo — opcional, inteiro ≥ 0
  let stockMax: number | null = null;
  if (raw.estoqueMax !== null && raw.estoqueMax !== undefined && String(raw.estoqueMax).trim() !== "") {
    const mx = parseNumericCell(raw.estoqueMax);
    if (mx === null) errors.push({ field: "Estoque Máximo", message: "valor inválido (precisa ser um número)" });
    else if (mx < 0) errors.push({ field: "Estoque Máximo", message: `não pode ser negativo (recebido: ${mx})` });
    else if (!Number.isInteger(mx)) errors.push({ field: "Estoque Máximo", message: `deve ser inteiro (recebido: ${mx})` });
    else stockMax = mx;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, values: { costPrice, salePrice: salePrice as number, promoPrice, stockQty, stockMin, stockMax } };
}
