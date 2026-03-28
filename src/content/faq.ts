export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "Preciso instalar algo no computador?",
    answer:
      "Não. O PDV Ótica é 100% na nuvem. Basta um navegador (Chrome, Firefox, Safari) e internet para acessar de qualquer computador, tablet ou celular.",
  },
  {
    question: "Funciona no celular e tablet?",
    answer:
      "Sim! O sistema é totalmente responsivo e funciona em qualquer dispositivo. Você pode registrar vendas, consultar estoque e acompanhar relatórios pelo celular.",
  },
  {
    question: "Posso migrar meus dados de outro sistema?",
    answer:
      "Com certeza. Nossa equipe de implantação auxilia a importação dos seus dados via planilha, CSV ou diretamente do sistema anterior. A migração é feita sem perda de dados e sem interrupção da sua operação.",
  },
  {
    question: "Como funciona o suporte técnico?",
    answer:
      "O suporte está disponível via WhatsApp, chat e e-mail em horário comercial. Respondemos em menos de 2 horas em dias úteis. Os planos Pro e Rede incluem suporte prioritário com tempo de resposta ainda mais rápido.",
  },
  {
    question: "O sistema emite nota fiscal?",
    answer:
      "Sim. O PDV Ótica emite NF-e (nota fiscal eletrônica) e NFC-e (nota fiscal ao consumidor) com certificado digital integrado. Há suporte a SAT (SP), MFe (CE) e outros módulos fiscais regionais.",
  },
  {
    question: "Funciona para mais de uma loja?",
    answer:
      "Sim. O plano Rede suporta múltiplas filiais com controle de estoque por loja, transferências entre unidades, visão consolidada e relatórios por filial ou rede.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Totalmente. Os dados são armazenados em servidores com criptografia AES-256, backup automático diário e acesso via SSL/TLS. Estamos em conformidade com a LGPD e as melhores práticas de segurança da informação.",
  },
  {
    question: "O que acontece se a internet cair?",
    answer:
      "O sistema possui um modo offline básico que permite registrar vendas e consultar dados locais. Quando a conexão voltar, tudo é sincronizado automaticamente com a nuvem.",
  },
  {
    question: "Tem contrato de fidelidade?",
    answer:
      "Não há fidelidade. Você pode cancelar a qualquer momento, sem multas. No plano anual você tem desconto, mas pode pedir reembolso proporcional nos primeiros 30 dias.",
  },
  {
    question: "Quanto tempo leva para começar a usar?",
    answer:
      "A configuração básica leva em torno de 30 minutos. Com a ajuda da nossa equipe de implantação, sua ótica pode estar em plena operação no PDV Ótica em até 7 dias, incluindo treinamento da equipe.",
  },
];
