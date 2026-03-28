export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  badge?: string;
  highlight?: boolean;
  features: string[];
  notIncluded?: string[];
  cta: string;
  ctaVariant: "primary" | "secondary" | "outline";
}

export const plans: PricingPlan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Perfeito para óticas que estão começando",
    monthlyPrice: 149,
    annualPrice: 119,
    features: [
      "PDV e registro de vendas",
      "Cadastro de clientes",
      "Ordem de Serviço (O.S.)",
      "Controle de estoque básico",
      "Caixa e fluxo de caixa",
      "Relatórios básicos",
      "1 usuário",
      "Suporte via chat",
      "Acesso mobile",
    ],
    notIncluded: [
      "Emissão de NF-e / NFC-e",
      "Múltiplas filiais",
      "Integração com laboratório",
      "Relatórios de BI",
    ],
    cta: "Testar Grátis",
    ctaVariant: "secondary",
  },
  {
    id: "profissional",
    name: "Profissional",
    description: "Para óticas que querem crescer com controle total",
    monthlyPrice: 289,
    annualPrice: 229,
    badge: "Mais escolhido",
    highlight: true,
    features: [
      "Tudo do Essencial",
      "Emissão de NF-e e NFC-e",
      "Contas a pagar e receber",
      "Comissões de vendedores",
      "Integração com laboratórios",
      "WhatsApp automático",
      "Campanhas de pós-venda",
      "Relatórios avançados e DRE",
      "5 usuários",
      "Suporte prioritário",
    ],
    notIncluded: ["Múltiplas filiais", "BI personalizado"],
    cta: "Testar Grátis",
    ctaVariant: "primary",
  },
  {
    id: "rede",
    name: "Rede",
    description: "Para redes com múltiplas lojas",
    monthlyPrice: 549,
    annualPrice: 439,
    features: [
      "Tudo do Profissional",
      "Múltiplas filiais (ilimitadas)",
      "Transferência entre filiais",
      "Visão consolidada da rede",
      "Relatórios por filial",
      "Dashboard de BI avançado",
      "Permissões por usuário/filial",
      "Usuários ilimitados",
      "Gerente de conta dedicado",
      "Treinamento presencial",
    ],
    cta: "Falar com Consultor",
    ctaVariant: "outline",
  },
];

export const pricingFaq = [
  {
    question: "Posso trocar de plano depois?",
    answer: "Sim, você pode fazer upgrade ou downgrade a qualquer momento. A diferença é calculada proporcionalmente.",
  },
  {
    question: "O período de teste é realmente grátis?",
    answer: "Sim, 14 dias grátis sem cartão de crédito. Sem compromisso de continuar.",
  },
  {
    question: "Os preços incluem impostos?",
    answer: "Os preços exibidos não incluem impostos. O valor final pode variar conforme sua localidade.",
  },
];
