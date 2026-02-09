import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/customers/template
 * Retorna um template/modelo de planilha para importação de clientes
 */
export async function GET() {
  try {
    // Dados de exemplo para o template
    const templateData = [
      {
        Nome: "João da Silva",
        CPF: "123.456.789-00",
        RG: "12.345.678-9",
        Telefone: "(11) 98765-4321",
        "Telefone 2": "(11) 3456-7890",
        Email: "joao.silva@email.com",
        "Data de Nascimento": "15/03/1985",
        Gênero: "M",
        Endereço: "Rua das Flores",
        Número: "123",
        Complemento: "Apto 45",
        Bairro: "Centro",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01234-567",
        "Aceita Marketing": "Sim",
        "Fonte de Indicação": "Google",
        Observações: "Cliente VIP",
        Ativo: "Sim",
      },
      {
        Nome: "Maria Santos",
        CPF: "987.654.321-00",
        RG: "",
        Telefone: "(11) 91234-5678",
        "Telefone 2": "",
        Email: "maria.santos@email.com",
        "Data de Nascimento": "22/07/1990",
        Gênero: "F",
        Endereço: "Av. Paulista",
        Número: "1000",
        Complemento: "",
        Bairro: "Bela Vista",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01310-100",
        "Aceita Marketing": "Não",
        "Fonte de Indicação": "Indicação",
        Observações: "",
        Ativo: "Sim",
      },
    ];

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    // Ajustar largura das colunas
    worksheet["!cols"] = [
      { wch: 40 }, // Nome
      { wch: 18 }, // CPF
      { wch: 15 }, // RG
      { wch: 18 }, // Telefone
      { wch: 18 }, // Telefone 2
      { wch: 30 }, // Email
      { wch: 18 }, // Data de Nascimento
      { wch: 10 }, // Gênero
      { wch: 40 }, // Endereço
      { wch: 10 }, // Número
      { wch: 20 }, // Complemento
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 8 },  // Estado
      { wch: 15 }, // CEP
      { wch: 18 }, // Aceita Marketing
      { wch: 20 }, // Fonte de Indicação
      { wch: 40 }, // Observações
      { wch: 8 },  // Ativo
    ];

    // Adicionar aba com instruções
    const instructions = [
      { Campo: "Nome", Obrigatório: "Sim", Formato: "Texto", Descrição: "Nome completo do cliente" },
      { Campo: "CPF", Obrigatório: "Não", Formato: "999.999.999-99", Descrição: "CPF do cliente (com ou sem formatação)" },
      { Campo: "RG", Obrigatório: "Não", Formato: "Texto", Descrição: "RG do cliente" },
      { Campo: "Telefone", Obrigatório: "Não", Formato: "(99) 99999-9999", Descrição: "Telefone principal" },
      { Campo: "Telefone 2", Obrigatório: "Não", Formato: "(99) 99999-9999", Descrição: "Telefone secundário" },
      { Campo: "Email", Obrigatório: "Não", Formato: "email@exemplo.com", Descrição: "Email do cliente" },
      { Campo: "Data de Nascimento", Obrigatório: "Não", Formato: "dd/MM/yyyy", Descrição: "Data de nascimento" },
      { Campo: "Gênero", Obrigatório: "Não", Formato: "M, F ou Outro", Descrição: "Gênero do cliente" },
      { Campo: "Endereço", Obrigatório: "Não", Formato: "Texto", Descrição: "Nome da rua/avenida" },
      { Campo: "Número", Obrigatório: "Não", Formato: "Texto", Descrição: "Número do endereço" },
      { Campo: "Complemento", Obrigatório: "Não", Formato: "Texto", Descrição: "Complemento (apto, sala, etc)" },
      { Campo: "Bairro", Obrigatório: "Não", Formato: "Texto", Descrição: "Bairro" },
      { Campo: "Cidade", Obrigatório: "Não", Formato: "Texto", Descrição: "Cidade" },
      { Campo: "Estado", Obrigatório: "Não", Formato: "UF (2 letras)", Descrição: "Estado (SP, RJ, MG, etc)" },
      { Campo: "CEP", Obrigatório: "Não", Formato: "99999-999", Descrição: "CEP (com ou sem formatação)" },
      { Campo: "Aceita Marketing", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se aceita receber comunicações de marketing" },
      { Campo: "Fonte de Indicação", Obrigatório: "Não", Formato: "Texto", Descrição: "Como conheceu a loja" },
      { Campo: "Observações", Obrigatório: "Não", Formato: "Texto", Descrição: "Observações gerais sobre o cliente" },
      { Campo: "Ativo", Obrigatório: "Não", Formato: "Sim ou Não", Descrição: "Se o cliente está ativo (padrão: Sim)" },
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
        "Content-Disposition": "attachment; filename=\"template_importacao_clientes.xlsx\"",
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
