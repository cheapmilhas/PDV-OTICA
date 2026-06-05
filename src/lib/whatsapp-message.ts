import { replaceMessageVariables } from "@/lib/default-messages";

/**
 * Lógica PURA de montagem das mensagens de WhatsApp e do mapeamento de
 * templates para o payload de salvar. Extraída das telas (vendas/detalhes e
 * configurações) para ser testável de forma determinística — as telas chamam
 * exatamente estas funções, então o teste cobre o caminho real dos botões.
 */

export interface ThankYouSaleInput {
  customerName?: string | null;
  total?: number | null;
  /** Data formatada (dd/MM/yyyy) — a tela já formata com date-fns. */
  dateLabel?: string | null;
  sellerName?: string | null;
  productNames?: Array<string | null | undefined>;
}

export interface ThankYouSettingsInput {
  displayName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
}

/** Resumo dos produtos da venda para o placeholder {produto}. */
export function buildProductSummary(
  productNames?: Array<string | null | undefined>
): string {
  if (!productNames || productNames.length === 0) return "";
  return productNames.filter((n): n is string => Boolean(n)).join(", ");
}

/**
 * Monta a mensagem final de agradecimento substituindo TODOS os placeholders
 * suportados. Garante que campos ausentes viram string vazia (nunca deixam o
 * placeholder literal na mensagem enviada ao cliente).
 */
export function buildThankYouMessage(
  template: string,
  sale: ThankYouSaleInput,
  settings: ThankYouSettingsInput,
  formatValor: (n: number) => string
): string {
  const oticaNome = settings.displayName || "Ótica";
  return replaceMessageVariables(template, {
    cliente: sale.customerName || "Cliente",
    valor: formatValor(Number(sale.total || 0)),
    otica: oticaNome,
    empresa: oticaNome,
    data: sale.dateLabel || "",
    vendedor: sale.sellerName || "Vendedor",
    produto: buildProductSummary(sale.productNames),
    telefone: settings.phone || "",
    whatsapp: settings.whatsapp || "",
    endereco: settings.address || "",
  });
}

export interface MensagensState {
  agradecimento: string;
  orcamento: string;
  lembrete: string;
  aniversario: string;
}

/**
 * Mapeia o estado dos textareas da tela de configurações para os campos
 * persistidos no backend. Antes da correção C2, esses campos NÃO eram enviados
 * no PUT — editar e salvar não persistia nada.
 */
export function mapMessagesToSettingsPayload(mensagens: MensagensState) {
  return {
    messageThankYou: mensagens.agradecimento,
    messageQuote: mensagens.orcamento,
    messageReminder: mensagens.lembrete,
    messageBirthday: mensagens.aniversario,
  };
}
