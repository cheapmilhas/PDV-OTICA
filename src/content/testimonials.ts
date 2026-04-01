export interface Testimonial {
  name: string;
  role: string;
  store: string;
  city: string;
  text: string;
  rating: number;
  avatar?: string;
}

export const testimonials: Testimonial[] = [
  {
    name: "Márcia Oliveira",
    role: "Proprietária",
    store: "Ótica Visão Clara",
    city: "Fortaleza, CE",
    text: "Antes do PDV Ótica eu controlava tudo em planilha e perdia muito tempo. Hoje abro o caixa, registro a venda, emito a nota e o cliente já sai com o recibo no WhatsApp. Economizei mais de 3 horas por dia. Mudou tudo na minha ótica.",
    rating: 5,
  },
  {
    name: "Roberto Farias",
    role: "Gerente",
    store: "Óptica Premium",
    city: "Recife, PE",
    text: "Tenho 3 lojas e o controle era um caos. Com o PDV Ótica consigo ver o estoque de todas as filiais em tempo real, transferir produtos entre lojas e ver o DRE consolidado. Reduzi a inadimplência em 40% nos primeiros dois meses.",
    rating: 5,
  },
  {
    name: "Juliana Costa",
    role: "Proprietária",
    store: "Ótica Moderna",
    city: "Natal, RN",
    text: "Migrei do sistema antigo achando que ia perder tudo. A equipe importou todos os clientes, histórico de receitas e estoque em 2 dias. Não perdi um dado sequer. Em 30 dias já recuperei o investimento de 6 meses.",
    rating: 5,
  },
  {
    name: "Carlos Mendonça",
    role: "Proprietário",
    store: "Ótica CentroCar",
    city: "São Luís, MA",
    text: "O pós-venda automático do WhatsApp trouxe 23% dos clientes de volta nos últimos 3 meses. Antes eu nem sabia que eles existiam. Nunca mais vou usar planilha.",
    rating: 5,
  },
  {
    name: "Fernanda Leal",
    role: "Gerente Comercial",
    store: "Visão Total Óticas",
    city: "Teresina, PI",
    text: "Implantamos em 4 lojas ao mesmo tempo. Em uma semana todos os vendedores estavam operando sem treinamento presencial. A interface é tão intuitiva que a gente aprende usando.",
    rating: 5,
  },
];
