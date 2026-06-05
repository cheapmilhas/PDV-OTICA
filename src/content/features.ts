import {
  ShoppingCart,
  FlaskConical,
  Package,
  DollarSign,
  Sparkles,
  Receipt,
  Percent,
  CreditCard,
  Gift,
  Wallet,
  ScanLine,
  ListChecks,
  Clock,
  ShieldCheck,
  History,
  Boxes,
  AlertTriangle,
  Building2,
  Barcode,
  SlidersHorizontal,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
  Landmark,
  Camera,
  Eye,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface FeatureBenefit {
  icon: string; // nome do ícone lucide
  title: string;
  desc: string;
}

export interface FeatureSubItem {
  title: string;
  desc: string;
}

export interface FeatureFaq {
  q: string;
  a: string;
}

export interface FeaturePage {
  slug: string;
  name: string; // nome curto p/ o card do hub
  icon: string; // lucide icon name p/ o card do hub
  eyebrow: string;
  title: string;
  subtitle: string;
  benefits: FeatureBenefit[]; // 3 itens
  subFeatures: FeatureSubItem[]; // 4-6 itens
  faq: FeatureFaq[]; // 2-3 itens
  mockupCaption?: string;
}

/**
 * Mapa de resolução nome→componente lucide. Usado por quem renderiza
 * (hub e FeaturePage) para transformar as strings de ícone em componentes.
 */
export const featureIcons: Record<string, LucideIcon> = {
  ShoppingCart,
  FlaskConical,
  Package,
  DollarSign,
  Sparkles,
  Receipt,
  Percent,
  CreditCard,
  Gift,
  Wallet,
  ScanLine,
  ListChecks,
  Clock,
  ShieldCheck,
  History,
  Boxes,
  AlertTriangle,
  Building2,
  Barcode,
  SlidersHorizontal,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
  Landmark,
  Camera,
  Eye,
  Zap,
};

export const features: Record<string, FeaturePage> = {
  "pdv-para-otica": {
    slug: "pdv-para-otica",
    name: "PDV para óticas",
    icon: "ShoppingCart",
    eyebrow: "PDV e vendas",
    title: "Venda no balcão sem complicação.",
    subtitle:
      "Um ponto de venda pensado para a ótica: registre a venda em segundos, aplique desconto com controle, receba como o cliente preferir e feche o caixa sem dor de cabeça.",
    benefits: [
      {
        icon: "Zap",
        title: "Venda rápida no balcão",
        desc: "Monte a venda em poucos cliques, com busca de produtos e cliente. Menos tempo no caixa, mais tempo atendendo.",
      },
      {
        icon: "ShieldCheck",
        title: "Desconto com limite por vendedor",
        desc: "Cada vendedor tem um teto de desconto. Quem precisa passar do limite pede liberação do gerente — sem ligações nem confusão.",
      },
      {
        icon: "FlaskConical",
        title: "Vendeu lente, a OS já nasce",
        desc: "Quando a venda inclui lente, o sistema cria a ordem de serviço automaticamente. Nada de digitar o pedido duas vezes.",
      },
    ],
    subFeatures: [
      {
        title: "Múltiplos pagamentos",
        desc: "Divida a mesma venda entre dinheiro, cartão, Pix e mais — na proporção que o cliente quiser.",
      },
      {
        title: "Desconto em R$ ou %",
        desc: "Aplique desconto no valor ou em percentual, sempre respeitando o limite de cada vendedor.",
      },
      {
        title: "Cashback",
        desc: "Gere e resgate cashback direto na venda para o cliente voltar mais vezes.",
      },
      {
        title: "Fechamento de caixa",
        desc: "Confira entradas e saídas e feche o caixa do turno com tudo conferido.",
      },
      {
        title: "Recibo da venda",
        desc: "Emita o recibo com os dados da ótica para entregar ou enviar ao cliente.",
      },
      {
        title: "Histórico por venda",
        desc: "Consulte cada venda com itens, pagamentos e quem atendeu, quando precisar.",
      },
    ],
    faq: [
      {
        q: "Dá para dividir o pagamento de uma venda?",
        a: "Sim. Você pode receber a mesma venda em várias formas ao mesmo tempo — dinheiro, cartão, Pix — informando o valor de cada uma.",
      },
      {
        q: "Como funciona o limite de desconto por vendedor?",
        a: "Cada cargo tem um teto de desconto. Se a venda precisa de um desconto maior, o gerente libera com a própria senha, sem o vendedor precisar sair do balcão.",
      },
      {
        q: "Preciso criar a ordem de serviço manualmente quando vendo lente?",
        a: "Não. Ao finalizar uma venda com lente, a OS é gerada automaticamente com os dados da venda, pronta para você dar sequência no laboratório.",
      },
    ],
    mockupCaption: "Tela de venda no balcão",
  },

  "ordem-de-servico-otica": {
    slug: "ordem-de-servico-otica",
    name: "Ordens de serviço",
    icon: "FlaskConical",
    eyebrow: "OS de lentes",
    title: "Acompanhe cada lente, do pedido à entrega.",
    subtitle:
      "Saiba exatamente onde está cada ordem de serviço: do rascunho à entrega, passando pelo laboratório. Prazos e status sempre à vista, garantias amarradas à OS original.",
    benefits: [
      {
        icon: "ListChecks",
        title: "Etapas claras, do início ao fim",
        desc: "Rascunho, aprovada, enviada ao laboratório, em produção, pronta e entregue. Você sempre sabe em que pé está cada óculos.",
      },
      {
        icon: "Clock",
        title: "Prazo e laboratório à vista",
        desc: "Veja o status, o prazo prometido e qual laboratório está com a lente — para nunca mais ser pego de surpresa pelo cliente.",
      },
      {
        icon: "ShieldCheck",
        title: "Garantia ligada à OS original",
        desc: "Garantias e retrabalhos ficam vinculados à ordem de origem com numeração própria (#1234-G1), sem perder o histórico.",
      },
    ],
    subFeatures: [
      {
        title: "Máquina de estados",
        desc: "Cada OS avança por etapas bem definidas, do rascunho até a entrega ao cliente.",
      },
      {
        title: "Status e prazo visíveis",
        desc: "Acompanhe situação, prazo prometido e laboratório em cada ordem.",
      },
      {
        title: "Vínculo com o laboratório",
        desc: "Registre e visualize qual laboratório está responsável por cada lente.",
      },
      {
        title: "Garantia e retrabalho",
        desc: "Abra garantia ou retrabalho ligado à OS original, com numeração #1234-G1.",
      },
      {
        title: "Histórico e timeline",
        desc: "Veja a linha do tempo completa de cada ordem: o que mudou, quando e por quem.",
      },
    ],
    faq: [
      {
        q: "Consigo saber em que etapa está cada óculos?",
        a: "Sim. Cada ordem passa por etapas claras — do rascunho à entrega — e você vê o status, o prazo e o laboratório responsável a qualquer momento.",
      },
      {
        q: "Como funciona a garantia de uma OS?",
        a: "A garantia ou retrabalho fica vinculada à OS original e recebe uma numeração própria, como #1234-G1, mantendo o histórico completo da peça.",
      },
      {
        q: "O Vis envia o pedido eletronicamente para o laboratório?",
        a: "O Vis organiza e acompanha a OS, registrando o laboratório responsável e os prazos. O envio em si segue o seu fluxo atual — aqui você ganha o controle e o histórico de tudo.",
      },
    ],
    mockupCaption: "Acompanhamento de ordens de serviço",
  },

  "controle-de-estoque-otica": {
    slug: "controle-de-estoque-otica",
    name: "Controle de estoque",
    icon: "Package",
    eyebrow: "Estoque",
    title: "Saiba o que tem na loja — em cada filial.",
    subtitle:
      "Armações e lentes sob controle, com alerta de baixa, ajustes e código de barras. Multi-filial para você enxergar o estoque de cada loja sem planilha.",
    benefits: [
      {
        icon: "Boxes",
        title: "Armações e lentes organizadas",
        desc: "Cadastre e controle todo o seu estoque de armações e lentes em um só lugar, sempre atualizado a cada venda.",
      },
      {
        icon: "AlertTriangle",
        title: "Alerta de estoque baixo",
        desc: "Receba o aviso quando um item está acabando, para repor antes de perder venda por falta de produto.",
      },
      {
        icon: "Building2",
        title: "Visão por filial",
        desc: "Veja quanto cada loja tem em estoque e gerencie tudo a partir da mesma conta.",
      },
    ],
    subFeatures: [
      {
        title: "Estoque de armações e lentes",
        desc: "Controle os dois tipos de produto com cadastro próprio e baixa automática na venda.",
      },
      {
        title: "Alerta de baixa",
        desc: "Identifique rapidamente os itens que estão chegando ao fim.",
      },
      {
        title: "Ajustes de estoque",
        desc: "Corrija quantidades quando precisar, mantendo o saldo fiel à realidade da loja.",
      },
      {
        title: "Código de barras",
        desc: "Use código de barras para agilizar a busca e o controle dos produtos.",
      },
      {
        title: "Multi-filial",
        desc: "Acompanhe o estoque separado por loja dentro da mesma conta.",
      },
      {
        title: "Transferências e lotes FIFO",
        desc: "Transfira itens entre filiais e controle lotes em ordem FIFO (disponível nos planos pagos).",
      },
    ],
    faq: [
      {
        q: "Consigo controlar o estoque de mais de uma loja?",
        a: "Sim. O Vis é multi-filial: você acompanha o estoque de cada loja separadamente, tudo na mesma conta.",
      },
      {
        q: "Como sei quando um produto está acabando?",
        a: "O sistema avisa quando um item atinge o nível baixo, para você repor antes de ficar sem produto para vender.",
      },
      {
        q: "Transferência entre filiais e lotes FIFO estão em qual plano?",
        a: "Transferências entre filiais e o controle de lotes em ordem FIFO fazem parte dos planos pagos. O controle de estoque por filiais, alertas e ajustes já está disponível.",
      },
    ],
    mockupCaption: "Controle de estoque por filial",
  },

  "gestao-financeira-otica": {
    slug: "gestao-financeira-otica",
    name: "Gestão financeira",
    icon: "DollarSign",
    eyebrow: "Financeiro",
    title: "Saiba quanto entrou, saiu e sobrou.",
    subtitle:
      "Contas a pagar e a receber, DRE, fluxo de caixa e fechamento de caixa num só lugar. Tire a sua ótica das planilhas e enxergue o resultado de verdade.",
    benefits: [
      {
        icon: "Wallet",
        title: "Contas a pagar e a receber",
        desc: "Saiba o que vence, o que entra e o que sai — sem perder uma conta nem esquecer um recebimento.",
      },
      {
        icon: "TrendingUp",
        title: "Resultado claro com DRE",
        desc: "Veja o desempenho da ótica com DRE e fluxo de caixa, sem precisar montar planilha.",
      },
      {
        icon: "Landmark",
        title: "Conciliação por CSV",
        desc: "Importe o extrato em CSV e concilie os lançamentos para bater o que está no sistema com o que está no banco.",
      },
    ],
    subFeatures: [
      {
        title: "Contas a pagar e a receber",
        desc: "Organize vencimentos e recebimentos com visão do que está em aberto.",
      },
      {
        title: "DRE",
        desc: "Acompanhe receitas, custos e resultado da ótica de forma estruturada.",
      },
      {
        title: "Fluxo de caixa",
        desc: "Enxergue as entradas e saídas ao longo do tempo para planejar melhor.",
      },
      {
        title: "Fechamento de caixa",
        desc: "Feche o caixa do turno conferindo tudo o que passou pelo balcão.",
      },
      {
        title: "Conciliação bancária por CSV",
        desc: "Importe o extrato em CSV e concilie com os lançamentos do sistema.",
      },
      {
        title: "Recebíveis de cartão",
        desc: "Acompanhe os recebíveis de cartão (alguns recursos fazem parte dos planos pagos).",
      },
    ],
    faq: [
      {
        q: "Preciso continuar usando planilha para o financeiro?",
        a: "Não. Contas a pagar e a receber, fluxo de caixa, DRE e fechamento de caixa ficam dentro do Vis, com o resultado calculado para você.",
      },
      {
        q: "Como funciona a conciliação bancária?",
        a: "Você importa o extrato do banco em CSV e o Vis ajuda a casar os lançamentos com o que está registrado no sistema, para bater os valores.",
      },
      {
        q: "Os recebíveis de cartão estão em qual plano?",
        a: "O acompanhamento financeiro está disponível, e alguns recursos de recebíveis de cartão fazem parte dos planos pagos.",
      },
    ],
    mockupCaption: "Painel financeiro da ótica",
  },

  "leitura-de-receita-ia": {
    slug: "leitura-de-receita-ia",
    name: "Leitura de receita por IA",
    icon: "Sparkles",
    eyebrow: "Leitura de receita por IA",
    title: "Fotografe a receita. A IA preenche o resto.",
    subtitle:
      "Chega de digitar grau, eixo e DNP na mão. Tire uma foto da receita e a inteligência artificial extrai os dados automaticamente — um diferencial que só o Vis tem.",
    benefits: [
      {
        icon: "Camera",
        title: "É só fotografar",
        desc: "Tire a foto da receita do cliente e deixe a IA fazer a leitura — sem digitar campo por campo.",
      },
      {
        icon: "Eye",
        title: "Grau, eixo e DNP automáticos",
        desc: "A IA extrai os valores da receita e preenche a OS para você, reduzindo erro de digitação.",
      },
      {
        icon: "Zap",
        title: "Diferencial exclusivo",
        desc: "Atenda mais rápido e com mais segurança com um recurso que poucos sistemas de ótica oferecem.",
      },
    ],
    subFeatures: [
      {
        title: "Leitura por foto (OCR)",
        desc: "Fotografe a receita e a IA reconhece os dados automaticamente.",
      },
      {
        title: "Extração de grau",
        desc: "Os valores de grau são lidos e levados para a ordem de serviço.",
      },
      {
        title: "Extração de eixo",
        desc: "O eixo é identificado na receita e preenchido para você conferir.",
      },
      {
        title: "Extração de DNP",
        desc: "A distância naso-pupilar é capturada junto com os demais dados.",
      },
      {
        title: "Menos erro de digitação",
        desc: "Com a leitura automática, sobra menos espaço para erro ao montar a OS.",
      },
    ],
    faq: [
      {
        q: "Como a leitura de receita por IA funciona?",
        a: "Você fotografa a receita do cliente e a inteligência artificial reconhece e extrai os dados — grau, eixo e DNP — preenchendo a ordem de serviço automaticamente.",
      },
      {
        q: "Ainda consigo conferir os dados antes de salvar?",
        a: "Sim. A IA preenche os campos para agilizar o atendimento, mas você sempre confere e ajusta o que for preciso antes de seguir.",
      },
    ],
    mockupCaption: "Leitura da receita por inteligência artificial",
  },
};

export const featureSlugs = Object.keys(features);

export function getFeature(slug: string): FeaturePage | undefined {
  return features[slug];
}
