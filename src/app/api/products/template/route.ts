import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/products/template
 * Retorna um template/modelo de planilha para importação de produtos
 */
export async function GET() {
  try {
    // Dados de exemplo para o template
    const templateData = [
      {
        SKU: "PROD001",
        "Código de Barras": "7891234567890",
        "Código do Fabricante": "FAB123",
        Nome: "Óculos de Sol Exemplo",
        Descrição: "Descrição detalhada do produto",
        Tipo: "Produto",
        Categoria: "Óculos de Sol",
        Marca: "Ray-Ban",
        Fornecedor: "Fornecedor Exemplo Ltda",
        "Preço de Custo": 150.00,
        "Preço de Venda": 299.90,
        "Preço Promocional": 249.90,
        "Margem %": 49.93,
        "Controle de Estoque": "Sim",
        "Quantidade em Estoque": 10,
        "Estoque Mínimo": 2,
        "Estoque Máximo": 50,
        NCM: "90041000",
        CEST: "2800100",
        Ativo: "Sim",
        Destaque: "Não",
        Lançamento: "Sim",
      },
      {
        SKU: "PROD002",
        "Código de Barras": "7891234567891",
        "Código do Fabricante": "FAB124",
        Nome: "Armação de Grau Exemplo",
        Descrição: "Armação de metal premium",
        Tipo: "Produto",
        Categoria: "Armações",
        Marca: "Oakley",
        Fornecedor: "Fornecedor Exemplo Ltda",
        "Preço de Custo": 200.00,
        "Preço de Venda": 399.90,
        "Preço Promocional": "",
        "Margem %": 49.98,
        "Controle de Estoque": "Sim",
        "Quantidade em Estoque": 5,
        "Estoque Mínimo": 1,
        "Estoque Máximo": 20,
        NCM: "90031100",
        CEST: "",
        Ativo: "Sim",
        Destaque: "Sim",
        Lançamento: "Não",
      },
    ];

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(templateData);
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

    // Adicionar uma segunda aba com instruções
    const instructions = [
      { Campo: "SKU", Obrigatório: "Não", Formato: "Texto único", Descrição: "Código interno do produto (será gerado automaticamente se vazio)" },
      { Campo: "Código de Barras", Obrigatório: "Não", Formato: "Texto", Descrição: "Código de barras do produto (EAN-13, EAN-8, etc)" },
      { Campo: "Código do Fabricante", Obrigatório: "Não", Formato: "Texto", Descrição: "Código do fabricante/fornecedor" },
      { Campo: "Nome", Obrigatório: "Sim", Formato: "Texto", Descrição: "Nome do produto" },
      { Campo: "Descrição", Obrigatório: "Não", Formato: "Texto", Descrição: "Descrição detalhada do produto" },
      { Campo: "Tipo", Obrigatório: "Sim", Formato: "Produto ou Serviço", Descrição: "Tipo do item" },
      { Campo: "Categoria", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome da categoria (será criada se não existir)" },
      { Campo: "Marca", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome da marca (será criada se não existir)" },
      { Campo: "Fornecedor", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome do fornecedor (será criado se não existir)" },
      { Campo: "Preço de Custo", Obrigatório: "Sim", Formato: "Número decimal", Descrição: "Preço de custo do produto" },
      { Campo: "Preço de Venda", Obrigatório: "Sim", Formato: "Número decimal", Descrição: "Preço de venda do produto" },
      { Campo: "Preço Promocional", Obrigatório: "Não", Formato: "Número decimal", Descrição: "Preço promocional (se houver)" },
      { Campo: "Margem %", Obrigatório: "Não", Formato: "Número decimal", Descrição: "Margem de lucro em porcentagem" },
      { Campo: "Controle de Estoque", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o produto tem controle de estoque (padrão: Sim)" },
      { Campo: "Quantidade em Estoque", Obrigatório: "Não", Formato: "Número inteiro", Descrição: "Quantidade atual em estoque" },
      { Campo: "Estoque Mínimo", Obrigatório: "Não", Formato: "Número inteiro", Descrição: "Estoque mínimo para alerta" },
      { Campo: "Estoque Máximo", Obrigatório: "Não", Formato: "Número inteiro", Descrição: "Estoque máximo recomendado" },
      { Campo: "NCM", Obrigatório: "Não", Formato: "Texto (8 dígitos)", Descrição: "Nomenclatura Comum do Mercosul" },
      { Campo: "CEST", Obrigatório: "Não", Formato: "Texto (7 dígitos)", Descrição: "Código Especificador da Substituição Tributária" },
      { Campo: "Ativo", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o produto está ativo (padrão: Sim)" },
      { Campo: "Destaque", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o produto é destaque (padrão: Não)" },
      { Campo: "Lançamento", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o produto é lançamento (padrão: Não)" },
    ];

    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    instructionsSheet["!cols"] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 25 },
      { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instruções");

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Retornar arquivo
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Disposition": "attachment; filename=\"template_importacao_produtos.xlsx\"",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar template:", error);
    return NextResponse.json(
      { error: "Erro ao gerar template" },
      { status: 500 }
    );
  }
}
