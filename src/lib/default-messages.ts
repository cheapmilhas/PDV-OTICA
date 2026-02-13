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
 * {saldo}    - Saldo de cashback (R$ 50,00)
 * {ganho}    - Cashback ganho (R$ 25,00)
 * {dias}     - Dias até expirar
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
 * Mensagens de Cashback
 */
export const CASHBACK_MESSAGES = {
  // Mensagem ao ganhar cashback
  earned: `Olá {cliente}! 🎉

Você ganhou *{ganho}* de cashback na sua compra de *{valor}* na *{otica}*!

💰 Seu saldo atual: *{saldo}*

Use seu cashback na próxima compra! 😊
*{otica}*`,

  // Mensagem de cashback de aniversário
  birthdayBonus: `Olá {cliente}! 🎂🎉

Parabéns! Você ganhou *{ganho}* de cashback especial de aniversário na sua compra de *{valor}* na *{otica}*!

💰 Seu saldo atual: *{saldo}*

Aproveite seu mês especial! 🎁
*{otica}*`,

  // Mensagem de cashback expirando
  expiring: `Olá {cliente}! ⚠️

Seu cashback de *{valor}* na *{otica}* vai expirar em *{dias} dias*!

💰 Saldo atual: *{saldo}*

Não perca! Venha fazer suas compras antes que expire! 😊
*{otica}*`,

  // Mensagem de cashback usado
  used: `Olá {cliente}! ✅

Você usou *{valor}* de cashback na sua compra!

💰 Saldo restante: *{saldo}*

Obrigado pela preferência! 😊
*{otica}*`,

  // Mensagem de bônus manual
  bonus: `Olá {cliente}! 🎁

Você ganhou um bônus de *{ganho}* de cashback na *{otica}*!

💰 Seu saldo atual: *{saldo}*

Aproveite na sua próxima compra! 😊
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
    saldo?: string;
    ganho?: string;
    dias?: string;
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
  if (variables.saldo) result = result.replace(/{saldo}/g, variables.saldo);
  if (variables.ganho) result = result.replace(/{ganho}/g, variables.ganho);
  if (variables.dias) result = result.replace(/{dias}/g, variables.dias);

  return result;
}

/**
 * Substitui variáveis nas mensagens de cashback
 */
export function replaceCashbackVariables(
  message: string,
  variables: {
    cliente?: string;
    valor?: string;
    otica?: string;
    saldo?: string;
    ganho?: string;
    dias?: string;
  }
): string {
  return replaceMessageVariables(message, variables);
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
