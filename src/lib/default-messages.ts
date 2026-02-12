/**
 * Mensagens padrão para comunicação com clientes
 *
 * Variáveis disponíveis:
 * {cliente}  - Nome do cliente
 * {valor}    - Valor total formatado (R$ 1.500,00)
 * {otica}    - Nome da ótica
 * {data}     - Data da transação (12/02/2026)
 * {vendedor} - Nome do vendedor
 * {itens}    - Lista resumida dos itens
 * {validade} - Data de validade (para orçamentos)
 */

export const DEFAULT_MESSAGES = {
  // Mensagem de agradecimento pós-venda
  thankYou: `Olá {cliente}! 👋

Agradecemos pela sua compra na *{otica}*! 🎉

💰 Valor: *{valor}*
📅 Data: {data}
👤 Atendido por: {vendedor}

Sua satisfação é muito importante para nós! Qualquer dúvida sobre seus óculos ou precisando de ajustes, estamos à disposição.

Obrigado pela preferência! 😊
*{otica}*`,

  // Mensagem de envio de orçamento
  quote: `Olá {cliente}! 👋

Segue o orçamento da *{otica}* no valor de *{valor}*.

📄 O PDF está sendo enviado em seguida...
📅 Válido até: {validade}

Qualquer dúvida, estamos à disposição! 😊
*{otica}*`,

  // Mensagem de lembrete de retorno
  reminder: `Olá {cliente}! 👋

Passando para lembrar que seu orçamento na *{otica}* ainda está válido!

💰 Valor: *{valor}*
📅 Válido até: {validade}

Podemos ajudar com alguma dúvida? Estamos à disposição! 😊
*{otica}*`,

  // Mensagem de aniversário
  birthday: `Olá {cliente}! 🎂

A equipe da *{otica}* deseja um Feliz Aniversário! 🎉

Que este novo ciclo seja repleto de saúde, alegria e muitas realizações!

Aguardamos sua visita! 🎁

Um grande abraço,
*{otica}*`,
};

/**
 * Substitui variáveis na mensagem
 */
export function replaceMessageVariables(
  message: string,
  variables: {
    cliente?: string;
    valor?: string;
    otica?: string;
    data?: string;
    vendedor?: string;
    itens?: string;
    validade?: string;
  }
): string {
  let result = message;

  if (variables.cliente) result = result.replace(/{cliente}/g, variables.cliente);
  if (variables.valor) result = result.replace(/{valor}/g, variables.valor);
  if (variables.otica) result = result.replace(/{otica}/g, variables.otica);
  if (variables.data) result = result.replace(/{data}/g, variables.data);
  if (variables.vendedor) result = result.replace(/{vendedor}/g, variables.vendedor);
  if (variables.itens) result = result.replace(/{itens}/g, variables.itens);
  if (variables.validade) result = result.replace(/{validade}/g, variables.validade);

  return result;
}

/**
 * Abre WhatsApp com mensagem
 */
export function openWhatsAppWithMessage(phone: string, message: string) {
  // Limpar número
  const cleanPhone = phone.replace(/\D/g, "");
  const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  // Codificar mensagem
  const encodedMessage = encodeURIComponent(message);

  // Abrir WhatsApp
  window.open(`https://wa.me/${phoneWithCountry}?text=${encodedMessage}`, "_blank");
}
