import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

/**
 * GET /api/products/export
 * Exporta todos os produtos em formato Excel
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();

    // Buscar todos os produtos da empresa
    const products = await prisma.product.findMany({
      where: { companyId },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    // Preparar dados para exportação
    const data = products.map((product) => ({
      SKU: product.sku || "",
      "Código de Barras": product.barcode || "",
      "Código do Fabricante": product.manufacturerCode || "",
      Nome: product.name,
      Descrição: product.description || "",
      Tipo: product.type === "PRODUCT" ? "Produto" : "Serviço",
      Categoria: product.category?.name || "",
      Marca: product.brand?.name || "",
      Fornecedor: product.supplier?.name || "",
      "Preço de Custo": Number(product.costPrice),
      "Preço de Venda": Number(product.salePrice),
      "Preço Promocional": product.promoPrice ? Number(product.promoPrice) : "",
      "Margem %": product.marginPercent ? Number(product.marginPercent) : "",
      "Controle de Estoque": product.stockControlled ? "Sim" : "Não",
      "Quantidade em Estoque": product.stockQty,
      "Estoque Mínimo": product.stockMin || "",
      "Estoque Máximo": product.stockMax || "",
      NCM: product.ncm || "",
      CEST: product.cest || "",
      Ativo: product.active ? "Sim" : "Não",
      Destaque: product.featured ? "Sim" : "Não",
      Lançamento: product.launch ? "Sim" : "Não",
    }));

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos");

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 15 }, // SKU
      { wch: 20 }, // Código de Barras
      { wch: 20 }, // Código do Fabricante
      { wch: 40 }, // Nome
      { wch: 40 }, // Descrição
      { wch: 10 }, // Tipo
      { wch: 20 }, // Categoria
      { wch: 20 }, // Marca
      { wch: 25 }, // Fornecedor
      { wch: 15 }, // Preço de Custo
      { wch: 15 }, // Preço de Venda
      { wch: 18 }, // Preço Promocional
      { wch: 12 }, // Margem %
      { wch: 18 }, // Controle de Estoque
      { wch: 20 }, // Quantidade em Estoque
      { wch: 15 }, // Estoque Mínimo
      { wch: 15 }, // Estoque Máximo
      { wch: 12 }, // NCM
      { wch: 12 }, // CEST
      { wch: 8 },  // Ativo
      { wch: 10 }, // Destaque
      { wch: 12 }, // Lançamento
    ];
    worksheet["!cols"] = colWidths;

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Retornar arquivo
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="produtos_${new Date().toISOString().split("T")[0]}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
