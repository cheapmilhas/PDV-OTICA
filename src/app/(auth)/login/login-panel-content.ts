// Fonte de verdade do painel de novidades do login. O dono edita SÓ este arquivo
// e faz commit+deploy. Linguagem de balcão, não release notes técnicas.

export interface LoginRelease {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Título curto, linguagem de balcão. */
  title: string;
  /** 2-3 bullets, TEXTO PURO (sem links). */
  items: string[];
}

export interface LoginPanelContent {
  /** Idealmente mais recente primeiro; o componente ordena defensivamente por date desc. */
  releases: LoginRelease[];
}

export const loginPanelContent: LoginPanelContent = {
  releases: [
    {
      date: "2026-07-10",
      title: "Estoque por filial mais claro",
      items: [
        "Agora você escolhe em qual filial o produto entra no cadastro.",
        "Transferências entre filiais ficaram mais fáceis de encontrar.",
      ],
    },
  ],
};

/**
 * Slides do carrossel de funcionalidades (painel de login). Ordem: maior "uau"
 * primeiro. Cada slug tem um mini-mockup CSS em login-feature-mockups.tsx e o
 * texto vem daqui (blurb curto, linguagem de balcão).
 */
export interface CarouselSlide {
  slug: string;
  name: string;
  blurb: string;
}

export const loginCarouselSlides: CarouselSlide[] = [
  {
    slug: "leitura-de-receita-ia",
    name: "Leitura de receita por IA",
    blurb: "Fotografe a receita e a IA preenche grau, eixo e DNP direto na ordem de serviço.",
  },
  {
    slug: "ordem-de-servico-otica",
    name: "Ordens de serviço de lente",
    blurb: "Acompanhe cada lente do pedido à entrega, com status, prazo e laboratório sempre à vista.",
  },
  {
    slug: "funil-whatsapp",
    name: "Funil de vendas + WhatsApp",
    blurb: "Leads do WhatsApp entram direto no funil. Atenda, acompanhe e feche mais vendas.",
  },
  {
    slug: "gestao-financeira-otica",
    name: "Gestão financeira completa",
    blurb: "DRE, fluxo de caixa e contas a pagar e receber. Saiba quanto entrou, saiu e sobrou.",
  },
  {
    slug: "controle-de-estoque-otica",
    name: "Estoque por filial",
    blurb: "Armações e lentes sob controle, com alerta de baixa e visão de cada loja.",
  },
  {
    slug: "cashback-otica",
    name: "Cashback e fidelização",
    blurb: "Gere e resgate cashback na venda para o cliente voltar mais vezes.",
  },
  {
    slug: "pdv-para-otica",
    name: "PDV para óticas",
    blurb: "Venda no balcão em segundos. Vendeu lente, a ordem de serviço já nasce automática.",
  },
];
