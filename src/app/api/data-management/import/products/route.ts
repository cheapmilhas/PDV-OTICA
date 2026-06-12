import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { ProductType } from "@prisma/client";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "data-management/import/products" });

interface ProductRow {
  name: string;
  sku: string;
  type: ProductType;
  brandName: string | null;
  supplierName: string | null;
  costPrice: number;
  salePrice: number;
  ncm: string | null;
  stockControlled: boolean;
  stockQty: number;
  stockMin: number;
  active: boolean;
  createdAt: string | null;
  branchId: string;
}

/**
 * Resolve a filial onde gravar o BranchStock do produto importado, garantindo
 * que pertença à empresa (multi-tenant). Aceita o branchId da linha só se for
 * uma filial ATIVA da própria empresa; senão cai na filial principal (mais
 * antiga). Retorna null se a empresa não tiver filial ativa. Cacheia a filial
 * principal por empresa para evitar lookups repetidos no loop de importação.
 */
async function resolveOwnedBranchId(
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

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Apenas administradores podem importar dados." } },
        { status: 403 }
      );
    }

    const companyId = await getCompanyId();
    const body = await req.json();
    const { products } = body as { products: ProductRow[] };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Nenhum produto para importar." } },
        { status: 400 }
      );
    }

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Cache brands and suppliers to avoid repeated lookups
    const brandCache = new Map<string, string>();
    const supplierCache = new Map<string, string>();
    // Cache da filial principal por empresa (fallback quando row.branchId vem vazio).
    const branchIdCache = new Map<string, string>();

    for (const row of products) {
      try {
        // Check for duplicates by SKU
        const existing = await prisma.product.findFirst({
          where: { companyId, sku: row.sku },
          select: { id: true },
        });

        if (existing) {
          duplicates++;
          continue;
        }

        // Resolve brand
        let brandId: string | null = null;
        if (row.brandName) {
          const cachedBrand = brandCache.get(row.brandName);
          if (cachedBrand) {
            brandId = cachedBrand;
          } else {
            let brand = await prisma.brand.findFirst({
              where: { companyId, name: row.brandName },
              select: { id: true },
            });
            if (!brand) {
              brand = await prisma.brand.create({
                data: {
                  companyId,
                  name: row.brandName,
                  code: row.brandName.substring(0, 20).toUpperCase().replace(/\s+/g, "_"),
                },
              });
            }
            brandId = brand.id;
            brandCache.set(row.brandName, brand.id);
          }
        }

        // Resolve supplier
        let supplierId: string | null = null;
        if (row.supplierName) {
          const cachedSupplier = supplierCache.get(row.supplierName);
          if (cachedSupplier) {
            supplierId = cachedSupplier;
          } else {
            let supplier = await prisma.supplier.findFirst({
              where: { companyId, name: row.supplierName },
              select: { id: true },
            });
            if (!supplier) {
              supplier = await prisma.supplier.create({
                data: { companyId, name: row.supplierName },
              });
            }
            supplierId = supplier.id;
            supplierCache.set(row.supplierName, supplier.id);
          }
        }

        // Resolve a filial-alvo do estoque ANTES de criar o produto. row.branchId
        // é validado contra a empresa (multi-tenant: nunca gravar BranchStock em
        // filial de outra empresa); se inválido/ausente, usa a filial principal.
        // Resolvido aqui fora para que, se não houver filial, ainda criemos o
        // produto sem BranchStock (em vez de abortar a linha toda).
        const targetBranchId = row.stockControlled
          ? await resolveOwnedBranchId(row.branchId, companyId, branchIdCache)
          : null;

        // Cria produto + BranchStock na MESMA transação. Atomicidade é o ponto:
        // se a sincronização do BranchStock falhar, o produto NÃO pode ficar
        // gravado sem estoque por filial — isso recriaria o bug "estoque
        // fantasma" (tela mostra estoque, venda falha "Disponível: 0") que esta
        // própria correção existe para evitar. Atingiu os produtos importados
        // da P.S Vision.
        await prisma.$transaction(async (tx) => {
          const createdProduct = await tx.product.create({
            data: {
              companyId,
              name: row.name,
              sku: row.sku,
              type: row.type,
              brandId,
              supplierId,
              costPrice: row.costPrice,
              salePrice: row.salePrice,
              ncm: row.ncm,
              stockControlled: row.stockControlled,
              stockQty: row.stockQty,
              stockMin: row.stockMin,
              active: row.active,
              createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
            },
          });

          if (targetBranchId) {
            await tx.branchStock.upsert({
              where: { branchId_productId: { branchId: targetBranchId, productId: createdProduct.id } },
              create: { branchId: targetBranchId, productId: createdProduct.id, quantity: row.stockQty },
              update: { quantity: row.stockQty },
            });
          }
        });

        imported++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (errorDetails.length < 20) {
          errorDetails.push(`${row.name} (${row.sku}): ${msg}`);
        }
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId,
        userId: session.user.id,
        action: "IMPORT_PRODUCTS",
        entityType: "Product",
        entityId: "bulk",
        newData: {
          imported,
          duplicates,
          errors,
          totalSent: products.length,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ imported, duplicates, errors, errorDetails });
  } catch (error) {
    log.error("Erro ao importar produtos", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Erro ao importar produtos." } },
      { status: 500 }
    );
  }
}
