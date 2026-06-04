export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "Vou conseguir trazer os dados que já tenho (clientes, produtos)?",
    answer:
      "Sim. Você pode importar seus cadastros, e nossa equipe ajuda na migração para você não começar do zero — sem interrupção da sua operação.",
  },
  {
    question: "É difícil de usar? Minha equipe vai aprender?",
    answer:
      "O Vis foi feito para quem não é de tecnologia. A maioria aprende o básico no mesmo dia. E você tem suporte sempre que precisar.",
  },
  {
    question: "Fico preso a algum contrato?",
    answer:
      "Não. Sem fidelidade e sem multa. Você paga por mês e cancela quando quiser.",
  },
  {
    question: "Preciso instalar algo no computador?",
    answer:
      "Não. O Vis é 100% na nuvem. Basta um navegador (Chrome, Firefox, Safari) e internet para acessar de qualquer computador, tablet ou celular.",
  },
  {
    question: "Funciona no celular e no tablet?",
    answer:
      "Sim. O sistema funciona em qualquer dispositivo com internet. Você pode registrar vendas, consultar estoque e acompanhar a ótica pelo celular.",
  },
  {
    question: "Como funciona o suporte?",
    answer:
      "Suporte humano por WhatsApp. Você fala com gente de verdade, sem ficar preso em robô, em horário comercial.",
  },
  {
    question: "Serve para mais de uma loja?",
    answer:
      "Sim. O Vis é multi-loja e multi-CNPJ: você gerencia todas as unidades na mesma conta e compara o desempenho de cada uma.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Sim. Os dados ficam na nuvem com conexão criptografada e backup automático, em conformidade com a LGPD. Você é dono dos seus dados e pode exportá-los quando quiser.",
  },
];
