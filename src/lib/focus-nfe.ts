/**
 * Cliente HTTP tipado para Focus NFe (emissão fiscal).
 *
 * Docs: https://focusnfe.com.br/doc/
 *
 * Env vars:
 *   FOCUS_NFE_TOKEN  — token da API (homologação ou produção)
 *   FOCUS_NFE_ENV    — "homologacao" (default em dev) ou "producao"
 *   FOCUS_NFE_URL    — opcional, override do endpoint
 *
 * Modelo: NFC-e (Nota Fiscal de Consumidor Eletrônica) modelo 65.
 * Operação é assíncrona: emit retorna "processando_autorizacao", webhook avisa autorização.
 */

const HOMOLOGACAO_URL = "https://homologacao.focusnfe.com.br";
const PRODUCAO_URL = "https://api.focusnfe.com.br";

function getConfig() {
  const token = process.env.FOCUS_NFE_TOKEN;
  if (!token) throw new Error("FOCUS_NFE_TOKEN environment variable is required");

  const env = process.env.FOCUS_NFE_ENV || "homologacao";
  const isProd = env === "producao";
  const baseUrl = process.env.FOCUS_NFE_URL || (isProd ? PRODUCAO_URL : HOMOLOGACAO_URL);

  return { token, baseUrl, isProd };
}

/** Status retornado pela Focus NFe. */
export type NfceStatus =
  | "processando_autorizacao"
  | "autorizado"
  | "rejeitado"
  | "cancelado"
  | "denegado"
  | "erro_autorizacao";

export interface NfceItem {
  /** Número do item (sequencial 1..N) */
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  /** CFOP: 5102 padrão para venda no mesmo estado (Simples Nacional) */
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_unitario_tributavel: number;
  unidade_tributavel: string;
  quantidade_tributavel: number;
  codigo_ncm: string;
  /** ICMS — Simples Nacional usa CSOSN; Lucro Real/Presumido usa CST */
  icms_origem: string; // "0" nacional
  icms_situacao_tributaria: string; // CSOSN ex: "102" (Simples sem permissão de crédito)
  /** PIS/COFINS — para Simples geralmente "49" (Outras Operações de Saída) */
  pis_situacao_tributaria?: string;
  cofins_situacao_tributaria?: string;
}

export interface NfcePayment {
  /** 01=dinheiro, 02=cheque, 03=cartão crédito, 04=cartão débito, 17=PIX, 99=outros */
  forma_pagamento: string;
  valor_pagamento: number;
  /** Para cartão: integrador (não-obrigatório no Simples) */
  bandeira_operadora?: string;
}

export interface NfceEmissionInput {
  /** Referência única do emitente — usamos saleId */
  ref: string;
  /** CNPJ do emitente (sem máscara) */
  cnpj_emitente: string;
  /** Data e hora de emissão (ISO com timezone) */
  data_emissao: string;
  /** Natureza da operação */
  natureza_operacao: string;
  /** Indicador de presença: 1 = operação presencial */
  indicador_inscricao_estadual_destinatario?: number;
  /** CPF/CNPJ do consumidor (opcional para NFC-e abaixo de R$ 10mil) */
  cpf_destinatario?: string;
  nome_destinatario?: string;
  /** Itens da nota */
  items: NfceItem[];
  /** Pagamentos */
  formas_pagamento: NfcePayment[];
  /** Valor total dos produtos */
  valor_produtos: number;
  valor_desconto?: number;
  /** Informações adicionais ao consumidor */
  informacoes_adicionais_contribuinte?: string;
}

export interface NfceEmissionResponse {
  status: NfceStatus;
  ref: string;
  /** Mensagem da SEFAZ */
  mensagem_sefaz?: string;
  codigo_status?: number;
  /** Chave de acesso 44 dígitos */
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  /** URL para baixar XML autorizado */
  caminho_xml_nota_fiscal?: string;
  /** URL para baixar DANFE PDF */
  caminho_danfe?: string;
  /** URL para QR Code do DANFE */
  qrcode_url?: string;
}

export interface NfceCancelInput {
  /** Justificativa obrigatória (15-255 chars) */
  justificativa: string;
}

export class FocusNfeError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "FocusNfeError";
  }
}

async function focusFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { token, baseUrl } = getConfig();

  // Focus NFe usa Basic Auth com token como username e senha vazia
  const auth = Buffer.from(`${token}:`).toString("base64");

  const headers: Record<string, string> = {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json",
    "User-Agent": "pdv-otica/1.0",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errMsg =
      (body as { mensagem?: string; mensagem_sefaz?: string })?.mensagem ||
      (body as { mensagem_sefaz?: string })?.mensagem_sefaz ||
      `Focus NFe ${res.status}`;
    throw new FocusNfeError(res.status, body, errMsg);
  }

  return body as T;
}

export const focusNfe = {
  /**
   * Emite uma NFC-e (modelo 65). Operação assíncrona — a Focus NFe valida
   * com a SEFAZ em background e notifica via webhook quando autorizada.
   * A primeira resposta pode ser "processando_autorizacao".
   *
   * O `ref` deve ser único por emitente (geralmente saleId).
   */
  async emit(input: NfceEmissionInput): Promise<NfceEmissionResponse> {
    return focusFetch<NfceEmissionResponse>(`/v2/nfce?ref=${encodeURIComponent(input.ref)}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Consulta status atual de uma NFC-e por ref. */
  async status(ref: string): Promise<NfceEmissionResponse> {
    return focusFetch<NfceEmissionResponse>(`/v2/nfce/${encodeURIComponent(ref)}`);
  },

  /** Cancela NFC-e autorizada (limite 30 minutos após autorização). */
  async cancel(ref: string, input: NfceCancelInput): Promise<NfceEmissionResponse> {
    if (input.justificativa.length < 15 || input.justificativa.length > 255) {
      throw new FocusNfeError(
        400,
        { mensagem: "Justificativa deve ter entre 15 e 255 caracteres" },
        "Justificativa inválida",
      );
    }
    return focusFetch<NfceEmissionResponse>(`/v2/nfce/${encodeURIComponent(ref)}`, {
      method: "DELETE",
      body: JSON.stringify(input),
    });
  },

  /**
   * Mapeia mensagens cripticas da SEFAZ em texto amigável para mostrar ao usuário.
   * Lista incompleta — expande conforme aparecem novos códigos.
   */
  friendlyError(codigo: number | undefined, mensagem: string | undefined): string {
    if (!mensagem) return "Erro desconhecido na SEFAZ. Tente novamente.";
    const errorMap: Record<number, string> = {
      539: "CNPJ do emitente irregular na SEFAZ. Verifique sua situação fiscal.",
      540: "Certificado digital inválido ou vencido. Atualize o A1.",
      215: "Erro nos dados da nota — campos obrigatórios faltando.",
      217: "NFC-e já emitida com mesma chave. Aguarde processamento.",
      234: "CFOP inválido para a operação.",
      404: "Plano fiscal expirado. Verifique sua conta Focus NFe.",
      491: "Cliente requer CPF/CNPJ (acima de R$ 10mil ou solicitado).",
    };
    return codigo && errorMap[codigo] ? errorMap[codigo] : mensagem;
  },
};
