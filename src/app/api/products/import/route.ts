import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { ProductType } from "@prisma/client";
import * as XLSX from "xlsx";

/**
 * POST /api/products/import
 * Importa produtos a partir de arquivo Excel
 */
export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    await requirePermission("products.create");
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
        // Suporte a múltiplos formatos de coluna (sistema padrão + sistema antigo Ado)
        const nome = row["Nome"] || row["Descrição"] || row["Nome / Razão Social"];
        const precoVenda = row["Preço de Venda"] || row["Preço de venda"];
        const precoCusto = row["Preço de Custo"] || row["Preço de custo"] || "0";
        const skuRaw = row["SKU"] || row["Referência"] || row["Codigo"];
        const grupoRaw = row["Categoria"] || row["Grupo"] || row["Subgrupo"];
        const marcaRaw = row["Marca"] || row["Grife"];
        const fornecedorRaw = row["Fornecedor"];
        const tipoRaw = row["Tipo"] || grupoRaw;
        const estoqueAtual = row["Quantidade em Estoque"] || row["Estoque Atual"] || "0";
        const estoqueMin = row["Estoque Mínimo"] || row["Estoque Minimo"] || "0";
        const estoqueMax = row["Estoque Máximo"] || row["Estoque Maximo"];
        const controleEstoque = row["Controle de Estoque"] || row["Controlar Estoque"];
        const ativoRaw = row["Ativo"];
        const ncmRaw = row["NCM"] || row["Ncm"];
        const cestRaw = row["CEST"] || row["Cest"];

        // Validações básicas
        if (!nome) {
          results.errors.push(`Linha ${rowNum}: Nome é obrigatório`);
          continue;
        }

        if (!precoVenda) {
          results.errors.push(`Linha ${rowNum}: Preço de Venda é obrigatório`);
          continue;
        }

        // Determinar tipo (FRAME, CONTACT_LENS, OPHTHALMIC_LENS)
        let type: ProductType = ProductType.FRAME; // Default
        if (tipoRaw) {
          const tipoLower = String(tipoRaw).toLowerCase();
          if (tipoLower.includes("lente de contato") || tipoLower === "contact_lens") {
            type = ProductType.CONTACT_LENS;
          } else if (tipoLower.includes("lente") || tipoLower.includes("oft") || tipoLower === "ophthalmic_lens") {
            type = ProductType.OPHTHALMIC_LENS;
          } else if (tipoLower.includes("acess")) {
            type = ProductType.ACCESSORY;
          } else if (tipoLower.includes("solar")) {
            type = ProductType.SUNGLASSES;
          } else if (tipoLower.includes("serviço") || tipoLower.includes("servico")) {
            type = ProductType.SERVICE;
          }
        }

        // Buscar ou criar categoria
        let categoryId = null;
        if (grupoRaw) {
          const category = await prisma.category.upsert({
            where: {
              companyId_name: {
                companyId,
                name: String(grupoRaw),
              },
            },
            create: {
              companyId,
              name: String(grupoRaw),
            },
            update: {},
          });
          categoryId = category.id;
        }

        // Buscar ou criar marca
        let brandId = null;
        if (marcaRaw) {
          const brandName = String(marcaRaw);
          const brandCode = brandName.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
          const brand = await prisma.brand.upsert({
            where: {
              companyId_code: {
                companyId,
                code: brandCode,
              },
            },
            create: {
              companyId,
              code: brandCode,
              name: brandName,
            },
            update: {},
          });
          brandId = brand.id;
        }

        // Buscar ou criar fornecedor
        let supplierId = null;
        if (fornecedorRaw) {
          const supplierName = String(fornecedorRaw);
          let supplier = await prisma.supplier.findFirst({
            where: { companyId, name: supplierName },
          });
          if (!supplier) {
            supplier = await prisma.supplier.create({
              data: { companyId, name: supplierName },
            });
          }
          supplierId = supplier.id;
        }

        // Preparar dados do produto
        const sku = String(skuRaw || "").trim() || `PROD-${Date.now()}-${i}`;
        const costPrice = parseFloat(String(precoCusto)) || 0;
        const salePrice = parseFloat(String(precoVenda)) || 0;
        const promoPrice = row["Preço Promocional"]
          ? parseFloat(row["Preço Promocional"])
          : null;

        // Tipos que NÃO controlam estoque por padrão
        const noStockTypes: string[] = ["OPHTHALMIC_LENS", "CONTACT_LENS", "SERVICE", "LENS_SERVICE"];
        const stockControlled = noStockTypes.includes(type)
          ? false
          : controleEstoque
            ? String(controleEstoque).toLowerCase() === "sim" || controleEstoque === "1" || controleEstoque === true
            : true;

        const stockQty = parseInt(String(estoqueAtual)) || 0;
        const stockMin = parseInt(String(estoqueMin)) || 0;
        const stockMax = estoqueMax ? parseInt(String(estoqueMax)) : null;

        const active = ativoRaw
          ? String(ativoRaw).toLowerCase() === "sim" || ativoRaw === "1" || ativoRaw === true
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
              { name: nome },
            ],
          },
        });

        if (existingProduct) {
          // Atualizar produto existente
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              barcode: row["Código de Barras"] || row["Código GTIN"] || null,
              manufacturerCode: row["Código do Fabricante"] || row["Código Importação"] || null,
              name: nome,
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
              ncm: ncmRaw ? String(ncmRaw) : null,
              cest: cestRaw ? String(cestRaw) : null,
              active,
              featured,
              launch,
            },
          });
          results.updated.push(nome);
        } else {
          // Criar novo produto
          await prisma.product.create({
            data: {
              companyId,
              sku,
              barcode: row["Código de Barras"] || row["Código GTIN"] || null,
              manufacturerCode: row["Código do Fabricante"] || row["Código Importação"] || null,
              name: nome,
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
              ncm: ncmRaw ? String(ncmRaw) : null,
              cest: cestRaw ? String(cestRaw) : null,
              active,
              featured,
              launch,
            },
          });
          results.created.push(nome);
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
