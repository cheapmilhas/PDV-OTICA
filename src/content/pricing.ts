import { FEATURE_REGISTRY, FEATURES } from "@/lib/plan-feature-catalog";

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

// Labels das 13 features gated, na ordem do catálogo. Single source of truth
// para landing, admin e sistema.
const GATED_FEATURE_LABELS = Object.values(FEATURES).map(
  (key) => FEATURE_REGISTRY[key].label,
);

export const plans: PricingPlan[] = [
  {
    id: "essencial",
    name: "Essencial",
    description: "Perfeito para óticas que estão começando",
    monthlyPrice: 149.9, // R$ 149,90 — alinha com plano 'basico' do banco (priceMonthly=14990)
    annualPrice: 119.9,
    features: [
      "PDV e registro de vendas",
      "Cadastro de clientes",
      "Ordem de Serviço (O.S.)",
      "Controle de estoque básico",
      "Caixa",
      "Relatórios básicos",
      "1 usuário",
      "Suporte via chat",
      "Acesso mobile",
    ],
    // 13 funcionalidades exclusivas dos planos pagos (do FEATURE_REGISTRY).
    notIncluded: GATED_FEATURE_LABELS,
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
      // 13 funcionalidades gated incluídas:
      ...GATED_FEATURE_LABELS,
      "5 usuários",
      "Suporte prioritário",
    ],
    notIncluded: ["Múltiplas filiais (ilimitadas)"],
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
