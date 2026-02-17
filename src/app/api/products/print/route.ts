import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all"; // all, low, zero
    const categoryId = searchParams.get("categoryId") || undefined;

    let whereBase: any = { companyId, active: true };
    if (categoryId) whereBase.categoryId = categoryId;

    let products: any[];

    if (filter === "low") {
      // Produtos com estoque baixo (stockQty <= stockMin e stockMin > 0)
      products = await prisma.$queryRaw<any[]>`
        SELECT p.id, p.sku, p.name, p."stockQty", p."stockMin", p."costPrice", p."salePrice",
               c.name as "categoryName"
        FROM "Product" p
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."companyId" = ${companyId}
          AND p.active = true
          AND p."stockControlled" = true
          AND p."stockMin" > 0
          AND p."stockQty" <= p."stockMin"
        ${categoryId ? `AND p."categoryId" = '${categoryId}'` : ""}
        ORDER BY p.name ASC
      `;
    } else if (filter === "zero") {
      products = await prisma.$queryRaw<any[]>`
        SELECT p.id, p.sku, p.name, p."stockQty", p."stockMin", p."costPrice", p."salePrice",
               c.name as "categoryName"
        FROM "Product" p
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."companyId" = ${companyId}
          AND p.active = true
          AND p."stockControlled" = true
          AND p."stockQty" = 0
        ORDER BY p.name ASC
      `;
    } else {
      const rawProducts = await prisma.product.findMany({
        where: whereBase,
        select: {
          id: true,
          sku: true,
          name: true,
          stockQty: true,
          stockMin: true,
          costPrice: true,
          salePrice: true,
          category: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      products = rawProducts.map((p) => ({
        ...p,
        categoryName: p.category?.name || "-",
        costPrice: Number(p.costPrice || 0),
        salePrice: Number(p.salePrice || 0),
      }));
    }

    const [company, companySettings] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: { logoUrl: true, displayName: true },
      }),
    ]);

    const companyName = companySettings?.displayName || company?.name || "Empresa";
    const logoUrl = companySettings?.logoUrl;

    const totalValue = products.reduce(
      (sum: number, p: any) => sum + (Number(p.stockQty) || 0) * (Number(p.costPrice) || 0),
      0
    );

    const filterLabel =
      filter === "low" ? "Estoque Baixo" : filter === "zero" ? "Sem Estoque" : "Todos os Produtos";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Estoque</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 15px; color: #333; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 14px; }
    .logo { max-height: 45px; }
    .header-text h1 { font-size: 16px; margin-bottom: 2px; }
    .header-text p { font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; font-size: 10px; text-transform: uppercase; }
    .number { text-align: right; }
    .low { background: #fff8e1; }
    .zero { background: #fde8e8; }
    .total-row td { font-weight: bold; background: #e8f5e9; }
    .legend { margin-top: 10px; font-size: 10px; display: flex; gap: 16px; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; }
    @media print { body { padding: 5px; } }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ""}
    <div class="header-text">
      <h1>${companyName}</h1>
      <p>Relatório de Estoque — ${filterLabel} — ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Produto</th>
        <th>Categoria</th>
        <th class="number">Estoque</th>
        <th class="number">Mínimo</th>
        <th class="number">Custo Unit.</th>
        <th class="number">Valor Total</th>
      </tr>
    </thead>
    <tbody>
      ${products.map((p: any) => {
        const qty = Number(p.stockQty) || 0;
        const min = Number(p.stockMin) || 0;
        const cost = Number(p.costPrice) || 0;
        const isZero = qty === 0;
        const isLow = !isZero && min > 0 && qty <= min;
        const rowClass = isZero ? "zero" : isLow ? "low" : "";
        const totalVal = qty * cost;
        return `<tr class="${rowClass}">
          <td>${p.sku || "-"}</td>
          <td>${p.name}</td>
          <td>${p.categoryName || p.category?.name || "-"}</td>
          <td class="number">${qty}</td>
          <td class="number">${min || "-"}</td>
          <td class="number">R$ ${cost.toFixed(2).replace(".", ",")}</td>
          <td class="number">R$ ${totalVal.toFixed(2).replace(".", ",")}</td>
        </tr>`;
      }).join("")}
      <tr class="total-row">
        <td colspan="5">TOTAL EM ESTOQUE (${products.length} produtos)</td>
        <td></td>
        <td class="number">R$ ${totalValue.toFixed(2).replace(".", ",")}</td>
      </tr>
    </tbody>
  </table>

  <div class="legend">
    <div class="legend-item"><div class="dot" style="background:#fde8e8"></div> Sem estoque</div>
    <div class="legend-item"><div class="dot" style="background:#fff8e1"></div> Estoque baixo</div>
  </div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
