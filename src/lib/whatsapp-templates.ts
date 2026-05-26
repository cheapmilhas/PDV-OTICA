/**
 * Templates de mensagem WhatsApp.
 *
 * Mantém a copy editável num só lugar. Cada template recebe variáveis tipadas
 * e retorna string pronta para enviar via sendWhatsAppText().
 */

export interface CompanyInfo {
  name: string;
  phone?: string | null;
}

export const whatsappTemplates = {
  osReadyForPickup: (vars: {
    customerName: string;
    company: CompanyInfo;
    osNumber: string;
  }) =>
    `Olá ${vars.customerName}! 👓\n\n` +
    `Sua OS *${vars.osNumber}* está pronta para retirada na ${vars.company.name}.\n\n` +
    `Estamos te esperando!` +
    (vars.company.phone ? `\n\nDúvidas? ${vars.company.phone}` : ""),

  prescriptionExpiringSoon: (vars: {
    customerName: string;
    company: CompanyInfo;
    daysLeft: number;
  }) =>
    `Olá ${vars.customerName}! 👀\n\n` +
    `Sua receita oftalmológica vence em *${vars.daysLeft} dias*. ` +
    `Agende um novo exame para garantir a melhor visão.\n\n` +
    `${vars.company.name}` +
    (vars.company.phone ? ` — ${vars.company.phone}` : ""),

  installmentDueTomorrow: (vars: {
    customerName: string;
    amount: string; // já formatado "R$ 199,99"
    dueDate: string; // dd/MM/yyyy
    company: CompanyInfo;
    installment: string; // "2/6"
  }) =>
    `Olá ${vars.customerName}!\n\n` +
    `Lembrete: sua parcela *${vars.installment}* no valor de *${vars.amount}* vence amanhã (${vars.dueDate}).\n\n` +
    `${vars.company.name}` +
    (vars.company.phone ? `\nContato: ${vars.company.phone}` : ""),

  saleReceipt: (vars: {
    customerName: string;
    company: CompanyInfo;
    total: string;
    receiptUrl: string;
  }) =>
    `Olá ${vars.customerName}! 🎉\n\n` +
    `Obrigado pela compra na ${vars.company.name} (total ${vars.total}).\n\n` +
    `Veja seu comprovante: ${vars.receiptUrl}`,

  birthdayGreeting: (vars: { customerName: string; company: CompanyInfo; discountCode?: string }) =>
    `Feliz aniversário, ${vars.customerName}! 🎂🎉\n\n` +
    `A ${vars.company.name} te deseja um dia incrível!` +
    (vars.discountCode
      ? `\n\nComo presente, use o código *${vars.discountCode}* na sua próxima compra. 🎁`
      : ""),
};
