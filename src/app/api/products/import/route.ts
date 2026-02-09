import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

/**
 * POST /api/products/import
 * Importa produtos a partir de arquivo Excel
 */
export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Converter File para Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ler arquivo Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (rawData.length === 0) {
      return NextResponse.json(
        { error: "Planilha vazia" },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      errors: [] as string[],
      created: [] as string[],
      updated: [] as string[],
    };

    // Processar cada linha
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // +2 porque Excel começa em 1 e tem header

      try {
        // Validações básicas
        if (!row["Nome"]) {
          results.errors.push(`Linha ${rowNum}: Nome é obrigatório`);
          continue;
        }

        if (!row["Preço de Venda"]) {
          results.errors.push(`Linha ${rowNum}: Preço de Venda é obrigatório`);
          continue;
        }

        // Determinar tipo
        let type = "PRODUCT";
        if (row["Tipo"]) {
          const tipoLower = row["Tipo"].toLowerCase();
          if (tipoLower.includes("serv") || tipoLower === "servico") {
            type = "SERVICE";
          }
        }

        // Buscar ou criar categoria
        let categoryId = null;
        if (row["Categoria"]) {
          const category = await prisma.category.upsert({
            where: {
              companyId_name: {
                companyId,
                name: row["Categoria"],
              },
            },
            create: {
              companyId,
              name: row["Categoria"],
            },
            update: {},
          });
          categoryId = category.id;
        }

        // Buscar ou criar marca
        let brandId = null;
        if (row["Marca"]) {
          const brand = await prisma.brand.upsert({
            where: {
              companyId_name: {
                companyId,
                name: row["Marca"],
              },
            },
            create: {
              companyId,
              name: row["Marca"],
            },
            update: {},
          });
          brandId = brand.id;
        }

        // Buscar fornecedor
        let supplierId = null;
        if (row["Fornecedor"]) {
          const supplier = await prisma.supplier.findFirst({
            where: {
              companyId,
              name: row["Fornecedor"],
            },
          });
          supplierId = supplier?.id || null;
        }

        // Preparar dados do produto
        const sku = row["SKU"] || `PROD-${Date.now()}-${i}`;
        const costPrice = parseFloat(row["Preço de Custo"] || "0") || 0;
        const salePrice = parseFloat(row["Preço de Venda"]) || 0;
        const promoPrice = row["Preço Promocional"]
          ? parseFloat(row["Preço Promocional"])
          : null;

        const stockControlled = row["Controle de Estoque"]
          ? row["Controle de Estoque"].toLowerCase() === "sim" || row["Controle de Estoque"] === "1"
          : true;

        const stockQty = parseInt(row["Quantidade em Estoque"] || "0") || 0;
        const stockMin = parseInt(row["Estoque Mínimo"] || "0") || 0;
        const stockMax = row["Estoque Máximo"]
          ? parseInt(row["Estoque Máximo"])
          : null;

        const active = row["Ativo"]
          ? row["Ativo"].toLowerCase() === "sim" || row["Ativo"] === "1"
          : true;

        const featured = row["Destaque"]
          ? row["Destaque"].toLowerCase() === "sim" || row["Destaque"] === "1"
          : false;

        const launch = row["Lançamento"]
          ? row["Lançamento"].toLowerCase() === "sim" || row["Lançamento"] === "1"
          : false;

        // Verificar se produto já existe (por SKU ou nome)
        const existingProduct = await prisma.product.findFirst({
          where: {
            companyId,
            OR: [
              { sku },
              { name: row["Nome"] },
            ],
          },
        });

        if (existingProduct) {
          // Atualizar produto existente
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              barcode: row["Código de Barras"] || null,
              manufacturerCode: row["Código do Fabricante"] || null,
              name: row["Nome"],
              description: row["Descrição"] || null,
              type,
              categoryId,
              brandId,
              supplierId,
              costPrice,
              salePrice,
              promoPrice,
              stockControlled,
              stockQty,
              stockMin,
              stockMax,
              ncm: row["NCM"] || null,
              cest: row["CEST"] || null,
              active,
              featured,
              launch,
            },
          });
          results.updated.push(row["Nome"]);
        } else {
          // Criar novo produto
          await prisma.product.create({
            data: {
              companyId,
              sku,
              barcode: row["Código de Barras"] || null,
              manufacturerCode: row["Código do Fabricante"] || null,
              name: row["Nome"],
              description: row["Descrição"] || null,
              type,
              categoryId,
              brandId,
              supplierId,
              costPrice,
              salePrice,
              promoPrice,
              stockControlled,
              stockQty,
              stockMin,
              stockMax,
              ncm: row["NCM"] || null,
              cest: row["CEST"] || null,
              active,
              featured,
              launch,
            },
          });
          results.created.push(row["Nome"]);
        }

        results.success++;
      } catch (error: any) {
        results.errors.push(`Linha ${rowNum}: ${error.message}`);
      }
    }

    return NextResponse.json({
      message: `Importação concluída: ${results.success} produtos processados`,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
