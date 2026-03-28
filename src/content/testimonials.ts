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
    text: "Antes do PDV Ótica eu controlava tudo em planilha e perdia muito tempo. Hoje abro o caixa, registro a venda, emito a nota e o cliente já sai com o recibo no WhatsApp. Mudou tudo na minha ótica.",
    rating: 5,
  },
  {
    name: "Roberto Farias",
    role: "Gerente",
    store: "Óptica Premium",
    city: "Recife, PE",
    text: "Tenho 3 lojas e o controle era um caos. Com o PDV Ótica consigo ver o estoque de todas as filiais em tempo real, transferir produtos entre lojas e ver o DRE consolidado. Economizo horas todo mês.",
    rating: 5,
  },
  {
    name: "Juliana Costa",
    role: "Proprietária",
    store: "Ótica Moderna",
    city: "Natal, RN",
    text: "Migrei do sistema antigo achando que ia perder tudo. A equipe importou todos os clientes, histórico de receitas e estoque em 2 dias. Não perdi um dado sequer. Recomendo demais!",
    rating: 5,
  },
];
