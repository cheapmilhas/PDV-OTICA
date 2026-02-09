import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/suppliers/template
 * Retorna um template/modelo de planilha para importação de fornecedores
 */
export async function GET() {
  try {
    // Dados de exemplo para o template
    const templateData = [
      {
        Nome: "Fornecedor Exemplo Ltda",
        "CNPJ/CPF": "12.345.678/0001-90",
        "Inscrição Estadual": "123.456.789.012",
        Telefone: "(11) 3456-7890",
        Email: "contato@fornecedor.com.br",
        Endereço: "Rua Comercial",
        Número: "500",
        Complemento: "Sala 12",
        Bairro: "Centro",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01234-567",
        "Nome do Contato": "João Silva",
        "Telefone do Contato": "(11) 98765-4321",
        "Email do Contato": "joao@fornecedor.com.br",
        Observações: "Fornecedor principal de armações",
        Ativo: "Sim",
      },
      {
        Nome: "Distribuidora Óptica XPTO",
        "CNPJ/CPF": "98.765.432/0001-10",
        "Inscrição Estadual": "",
        Telefone: "(11) 2345-6789",
        Email: "vendas@opticaxpto.com",
        Endereço: "Av. Industrial",
        Número: "1000",
        Complemento: "",
        Bairro: "Distrito Industrial",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "04567-890",
        "Nome do Contato": "Maria Santos",
        "Telefone do Contato": "(11) 91234-5678",
        "Email do Contato": "maria.santos@opticaxpto.com",
        Observações: "",
        Ativo: "Sim",
      },
    ];

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fornecedores");

    // Ajustar largura das colunas
    worksheet["!cols"] = [
      { wch: 40 }, // Nome
      { wch: 20 }, // CNPJ/CPF
      { wch: 20 }, // Inscrição Estadual
      { wch: 18 }, // Telefone
      { wch: 35 }, // Email
      { wch: 40 }, // Endereço
      { wch: 10 }, // Número
      { wch: 20 }, // Complemento
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 8 },  // Estado
      { wch: 15 }, // CEP
      { wch: 30 }, // Nome do Contato
      { wch: 18 }, // Telefone do Contato
      { wch: 35 }, // Email do Contato
      { wch: 40 }, // Observações
      { wch: 8 },  // Ativo
    ];

    // Adicionar aba com instruções
    const instructions = [
      { Campo: "Nome", Obrigatório: "Sim", Formato: "Texto", Descrição: "Nome ou razão social do fornecedor" },
      { Campo: "CNPJ/CPF", Obrigatório: "Não", Formato: "99.999.999/9999-99 ou 999.999.999-99", Descrição: "CNPJ ou CPF do fornecedor (com ou sem formatação)" },
      { Campo: "Inscrição Estadual", Obrigatório: "Não", Formato: "Texto", Descrição: "Inscrição estadual do fornecedor" },
      { Campo: "Telefone", Obrigatório: "Não", Formato: "(99) 9999-9999 ou (99) 99999-9999", Descrição: "Telefone principal" },
      { Campo: "Email", Obrigatório: "Não", Formato: "email@exemplo.com", Descrição: "Email do fornecedor" },
      { Campo: "Endereço", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome da rua/avenida" },
      { Campo: "Número", Obrigatório: "Não", Formato: "Texto", Descrição: "Número do endereço" },
      { Campo: "Complemento", Obrigatório: "Não", Formato: "Texto", Descrição: "Complemento (sala, andar, etc)" },
      { Campo: "Bairro", Obrigatório: "Não", Formato: "Texto", Descrição: "Bairro" },
      { Campo: "Cidade", Obrigatório: "Não", Formato: "Texto", Descrição: "Cidade" },
      { Campo: "Estado", Obrigatório: "Não", Formato: "UF (2 letras)", Descrição: "Estado (SP, RJ, MG, etc)" },
      { Campo: "CEP", Obrigatório: "Não", Formato: "99999-999", Descrição: "CEP (com ou sem formatação)" },
      { Campo: "Nome do Contato", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome da pessoa de contato" },
      { Campo: "Telefone do Contato", Obrigatório: "Não", Formato: "(99) 99999-9999", Descrição: "Telefone da pessoa de contato" },
      { Campo: "Email do Contato", Obrigatório: "Não", Formato: "email@exemplo.com", Descrição: "Email da pessoa de contato" },
      { Campo: "Observações", Obrigatório: "Não", Formato: "Texto", Descrição: "Observações gerais sobre o fornecedor" },
      { Campo: "Ativo", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o fornecedor está ativo (padrão: Sim)" },
    ];

    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    instructionsSheet["!cols"] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 35 },
      { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instruções");

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Retornar arquivo
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Disposition": "attachment; filename=\"template_importacao_fornecedores.xlsx\"",
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
