import type { ReactNode } from "react";

export interface BlogPost {
  slug: string;
  title: string;
  description: string; // meta description (~155 char)
  keyword: string;
  date: string; // ISO "2026-06-04"
  author: string; // "Equipe Vis"
  readingMinutes: number;
  category: string; // "Gestão" | "Operação" | "Vendas" | "Financeiro"
  excerpt: string; // 1-2 frases p/ card
  body: ReactNode; // JSX renderizado dentro de .prose-vis
  related: string[]; // slugs de posts relacionados
  featureLinks: { label: string; href: string }[]; // links internos
}

export const blogPosts: BlogPost[] = [
  {
    slug: "como-gerir-uma-otica",
    title: "Como Gerir uma Ótica: Guia Completo (2026)",
    description:
      "Como gerir uma ótica de ponta a ponta: vendas no balcão, estoque de armações e lentes, OS, finanças e fidelização. Guia prático para donos em 2026.",
    keyword: "como gerir uma ótica",
    date: "2026-06-04",
    author: "Equipe Vis",
    readingMinutes: 8,
    category: "Gestão",
    excerpt:
      "Do atendimento no balcão ao fechamento do mês: um guia honesto de tudo o que o dono de ótica precisa ter sob controle.",
    related: ["gestao-financeira-otica-guia", "controle-de-os-de-lentes"],
    featureLinks: [
      { label: "Ver todas as funcionalidades", href: "/funcionalidades" },
      { label: "Controle de estoque", href: "/funcionalidades/controle-de-estoque-otica" },
      { label: "Gestão financeira", href: "/funcionalidades/gestao-financeira-otica" },
      { label: "Vis vs planilha", href: "/vis-vs-planilha" },
    ],
    body: (
      <>
        <p>
          Gerir uma ótica é equilibrar duas coisas ao mesmo tempo: um balcão que precisa atender bem
          e vender, e uma operação técnica de lentes que não admite erro. Quando uma dessas pontas
          falha, o cliente sente — seja na demora do óculos ou na lente com grau errado. Este guia
          reúne, de forma prática, o que um dono precisa manter sob controle no dia a dia.
        </p>

        <h2>1. Atendimento e vendas no balcão</h2>
        <p>
          A venda da ótica começa na conversa: entender a necessidade, mostrar opções de armação,
          explicar tratamentos de lente e fechar o pedido sem fazer o cliente esperar. O ponto fraco
          mais comum é o registro: anotar venda em caderno ou bloco perde informação e atrasa o
          caixa.
        </p>
        <p>
          Um ponto de venda organizado registra a venda, aplica desconto, vincula o cliente e já
          deixa tudo pronto para o financeiro e o estoque. Quanto menos retrabalho no balcão, mais
          tempo a equipe tem para vender de verdade.
        </p>

        <h2>2. Controle de estoque de armações e lentes</h2>
        <p>
          Estoque parado é dinheiro parado; estoque furado é venda perdida. A ótica vive com dezenas
          (às vezes centenas) de armações, e precisa saber o que tem, o que está encalhado e o que
          precisa repor. Lentes de grade também entram nessa conta.
        </p>
        <ul>
          <li>Entrada e saída registradas a cada compra e venda.</li>
          <li>Alerta de estoque baixo para repor antes de faltar.</li>
          <li>Visão por filial, quando a ótica tem mais de uma loja.</li>
        </ul>
        <p>
          Se quiser ver como isso funciona na prática, vale conhecer o{" "}
          <a href="/funcionalidades/controle-de-estoque-otica">controle de estoque para ótica</a>,
          com alerta de baixa e visão multi-loja.
        </p>

        <h2>3. Ordem de serviço de lentes</h2>
        <p>
          A OS é o coração técnico da ótica. É nela que ficam os valores de grau, eixo e distância
          pupilar, o laboratório escolhido, o prazo prometido e o status atual do pedido. Sem um
          fluxo claro, é fácil perder a lente no caminho ou prometer um prazo que não se cumpre.
        </p>
        <h3>O que uma boa OS organiza</h3>
        <ul>
          <li>Os dados da receita, para não digitar grau errado.</li>
          <li>O estado do pedido: em produção, no laboratório, pronto, entregue.</li>
          <li>O prazo prometido, para você cobrar o laboratório e avisar o cliente.</li>
        </ul>

        <h2>4. Finanças: contas, fluxo de caixa e DRE</h2>
        <p>
          Vender bem não significa lucrar. Muita ótica fatura alto e fecha o mês no vermelho porque
          não acompanha contas a pagar, prazo de recebimento e custo real das lentes. O mínimo é ter
          fluxo de caixa, fechamento diário e uma visão de resultado (DRE) para saber se o mês fechou
          no azul.
        </p>
        <p>
          Separe sempre as finanças pessoais das da ótica e registre cada entrada e saída. É o que
          transforma "achismo" em decisão.
        </p>

        <h2>5. Fidelização: cashback e pós-venda</h2>
        <p>
          O cliente da ótica volta — para a segunda armação, para a troca de lente, para o exame
          seguinte. Quem não cultiva esse relacionamento perde recompra fácil. Cashback bem usado e
          um pós-venda simples (lembrar do cliente na hora certa) aumentam o retorno sem precisar de
          desconto agressivo.
        </p>

        <h2>6. Planilha ou sistema?</h2>
        <p>
          No começo, a planilha resolve. Mas ela não conversa com o estoque, não controla a OS, não
          fecha o caixa e não avisa nada. Quando a ótica cresce, o custo de manter tudo no Excel
          aparece em erro, retrabalho e informação perdida.
        </p>
        <p>
          Se você está nesse ponto de decisão, veja a comparação direta entre{" "}
          <a href="/vis-vs-planilha">usar o Vis ou continuar na planilha</a> antes de escolher. E
          para entender o conjunto completo de recursos, confira{" "}
          <a href="/funcionalidades">todas as funcionalidades</a> pensadas para óticas.
        </p>

        <h2>Resumindo</h2>
        <p>
          Gerir bem uma ótica é manter balcão, estoque, OS, finanças e relacionamento andando juntos.
          Cada peça que fica solta vira retrabalho. Centralizar tudo num lugar só não é luxo — é o
          que dá ao dono tempo e clareza para crescer.
        </p>
      </>
    ),
  },

  {
    slug: "controle-de-os-de-lentes",
    title: "Controle de OS de Lentes: do Pedido à Entrega sem Atrasos",
    description:
      "Controle de OS de lentes na prática: etapas, estados, erros comuns de grau e eixo, como evitar atrasos e tratar garantia e retrabalho na sua ótica.",
    keyword: "controle de OS de lentes",
    date: "2026-06-03",
    author: "Equipe Vis",
    readingMinutes: 7,
    category: "Operação",
    excerpt:
      "A OS é onde a ótica mais perde tempo e cliente. Veja como organizar o fluxo da lente do pedido à entrega, sem atrasos.",
    related: ["como-gerir-uma-otica", "como-aumentar-vendas-otica"],
    featureLinks: [
      { label: "Ordem de serviço de lentes", href: "/funcionalidades/ordem-de-servico-otica" },
      { label: "Leitura de receita por IA", href: "/funcionalidades/leitura-de-receita-ia" },
    ],
    body: (
      <>
        <p>
          A ordem de serviço é onde a ótica mais se complica. É um pedido que sai da loja, passa pelo
          laboratório e volta para ser entregue — e em cada etapa há chance de atraso ou erro. Um bom
          controle de OS de lentes não é burocracia: é o que garante que o cliente receba o óculos
          certo, no prazo prometido.
        </p>

        <h2>O que é uma OS de lentes</h2>
        <p>
          A OS é o documento que reúne tudo de um pedido: os dados da receita (grau, eixo, distância
          pupilar), a armação escolhida, o tipo e tratamento da lente, o laboratório responsável, o
          valor e o prazo. É a ponte entre a venda no balcão e a produção da lente.
        </p>

        <h2>As etapas (estados) de uma OS</h2>
        <p>
          Cada OS percorre estados bem definidos. Acompanhar em que ponto cada pedido está é o que
          evita que algo "suma":
        </p>
        <ul>
          <li>
            <strong>Aberta:</strong> pedido registrado, com receita e armação definidas.
          </li>
          <li>
            <strong>Em produção / no laboratório:</strong> lente enviada e sendo fabricada.
          </li>
          <li>
            <strong>Pronta:</strong> lente recebida e montada, aguardando o cliente.
          </li>
          <li>
            <strong>Entregue:</strong> óculos retirado e venda concluída.
          </li>
        </ul>
        <p>
          Quando você enxerga todas as OS por estado, fica óbvio o que está atrasado e o que precisa
          de cobrança. É exatamente isso que a{" "}
          <a href="/funcionalidades/ordem-de-servico-otica">ordem de serviço de lentes do Vis</a>{" "}
          organiza, com status e prazo visíveis.
        </p>

        <h2>Erros comuns que custam caro</h2>
        <h3>Digitar grau, eixo ou DNP errado</h3>
        <p>
          O erro mais caro da ótica é refazer uma lente por causa de um dígito errado na receita. Um
          eixo trocado ou uma distância pupilar mal medida significa lente refeita, prazo perdido e
          cliente irritado. Conferir a receita duas vezes é regra de ouro.
        </p>
        <p>
          Para reduzir a digitação manual — e o erro que vem junto —, vale usar a{" "}
          <a href="/funcionalidades/leitura-de-receita-ia">leitura de receita por IA</a>: você
          fotografa a receita e o sistema extrai os valores, deixando você só conferir.
        </p>
        <h3>Prometer prazo que não se cumpre</h3>
        <p>
          Prazo otimista é furada. Combine prazos realistas com o laboratório e registre a data
          prometida na OS. Assim você cobra o lab a tempo e avisa o cliente antes que ele cobre você.
        </p>

        <h2>Como evitar atrasos</h2>
        <ul>
          <li>Tenha uma lista das OS atrasadas e vencendo, e olhe para ela todo dia.</li>
          <li>Registre o prazo prometido e cobre o laboratório quando ele se aproxima.</li>
          <li>Avise o cliente proativamente quando a lente fica pronta.</li>
        </ul>

        <h2>Garantia e retrabalho</h2>
        <p>
          Lente quebra, grau muda, cliente reclama de adaptação. Ter um fluxo de garantia e
          retrabalho vinculado à OS original mantém o histórico claro: você sabe quantas vezes aquele
          pedido foi refeito e por quê. Isso protege a ótica em discussões e revela problemas
          recorrentes com um fornecedor.
        </p>

        <h2>Resumindo</h2>
        <p>
          Controlar OS de lentes é, no fundo, controlar prazo e conferência. Estados claros, receita
          conferida e prazos cobrados resolvem a maioria dos atrasos. O resto é hábito — e uma
          ferramenta que coloca tudo isso na sua frente.
        </p>
      </>
    ),
  },

  {
    slug: "como-aumentar-vendas-otica",
    title: "Como Aumentar as Vendas da Sua Ótica: 8 Estratégias",
    description:
      "Como aumentar as vendas da ótica: conheça seus números, use metas, cashback, pós-venda, campanhas e ticket médio. 8 estratégias práticas para vender mais.",
    keyword: "como aumentar as vendas da ótica",
    date: "2026-06-02",
    author: "Equipe Vis",
    readingMinutes: 7,
    category: "Vendas",
    excerpt:
      "Vender mais não é só atender mais gente. São oito alavancas práticas — de metas a recompra de lentes — que cabem na rotina da ótica.",
    related: ["como-gerir-uma-otica", "controle-de-os-de-lentes"],
    featureLinks: [
      { label: "PDV para ótica", href: "/funcionalidades/pdv-para-otica" },
      { label: "Todas as funcionalidades", href: "/funcionalidades" },
    ],
    body: (
      <>
        <p>
          Aumentar as vendas da ótica raramente é só "colocar mais gente para dentro". Na maioria das
          lojas, dá para vender mais com os mesmos clientes e o mesmo movimento — ajustando processo,
          relacionamento e mix. Aqui estão oito estratégias práticas, sem promessa mágica.
        </p>

        <h2>1. Conheça os seus números</h2>
        <p>
          Você não melhora o que não mede. Saber quanto vendeu, qual o ticket médio, quais produtos
          giram e quais encalham é o ponto de partida. Relatórios de venda mostram onde está a
          oportunidade — muitas vezes ela está num produto que você nem destaca.
        </p>

        <h2>2. Defina metas e comissões</h2>
        <p>
          Uma equipe sem meta vende no automático. Metas claras por vendedor, acompanhadas de perto e
          ligadas a comissão, criam foco. O importante é que todos vejam o placar e saibam onde estão
          em relação ao objetivo do mês.
        </p>

        <h2>3. Use cashback para trazer o cliente de volta</h2>
        <p>
          Cashback é melhor que desconto puro: em vez de queimar margem na hora, você devolve um
          valor que só vale na próxima compra. Isso transforma uma venda única em duas. Bem
          comunicado no balcão, vira motivo concreto para o cliente voltar.
        </p>

        <h2>4. Faça pós-venda e segmentação</h2>
        <p>
          Quem comprou armação hoje pode precisar de lente de sol depois; quem comprou multifocal há
          dois anos pode estar na hora de trocar. Segmentar a base por tipo de compra e tempo permite
          falar com a pessoa certa, na hora certa, com a oferta certa.
        </p>

        <h2>5. Campanhas e lembretes</h2>
        <p>
          Datas (aniversário, retorno de exame, troca anual) são gatilhos naturais de venda. Manter
          lembretes organizados garante que essas oportunidades não passem batido. Um cliente
          lembrado é um cliente que volta.
        </p>

        <h2>6. Agilidade no balcão</h2>
        <p>
          Cliente parado esperando o caixa desiste de comprar o acessório a mais. Um balcão ágil —
          venda rápida, desconto na hora, fechamento de caixa sem dor — libera o vendedor para
          atender e fechar. A frente de caixa influencia diretamente a conversão.
        </p>
        <p>
          É por isso que vale ter um{" "}
          <a href="/funcionalidades/pdv-para-otica">PDV pensado para ótica</a>: venda com desconto,
          cashback e fechamento integrados, sem travar a fila.
        </p>

        <h2>7. Trabalhe o mix e a recompra de lentes</h2>
        <p>
          A lente é onde mora boa parte da margem. Oferecer tratamentos (antirreflexo, filtro de luz
          azul, fotossensível) e acompanhar quem está na hora de repor multiplica o faturamento por
          cliente. Recompra de lente é receita previsível — se você acompanhar.
        </p>

        <h2>8. Aumente o ticket médio</h2>
        <p>
          Segundo par, lente de sol com grau, acessórios, garantia estendida: pequenas adições por
          venda elevam o ticket sem precisar de mais clientes. O segredo é treinar a equipe para
          oferecer no momento certo, sem empurrar.
        </p>

        <h2>Por onde começar</h2>
        <p>
          Comece medindo. Quando você enxerga os números, as outras sete estratégias deixam de ser
          teoria e viram ação. Para ver como tudo isso se conecta numa operação só, conheça{" "}
          <a href="/funcionalidades">as funcionalidades do Vis</a> feitas para ótica.
        </p>
      </>
    ),
  },

  {
    slug: "gestao-financeira-otica-guia",
    title: "Gestão Financeira de Ótica: Caixa, Contas e Lucro",
    description:
      "Gestão financeira de ótica sem planilha: fluxo de caixa, fechamento diário, contas a pagar e receber, DRE, conciliação e indicadores para saber o lucro real.",
    keyword: "gestão financeira de ótica",
    date: "2026-06-01",
    author: "Equipe Vis",
    readingMinutes: 8,
    category: "Financeiro",
    excerpt:
      "Faturar não é lucrar. Veja como organizar caixa, contas e DRE para saber, de verdade, se a ótica fechou o mês no azul.",
    related: ["como-gerir-uma-otica", "como-aumentar-vendas-otica"],
    featureLinks: [
      { label: "Gestão financeira para ótica", href: "/funcionalidades/gestao-financeira-otica" },
      { label: "Vis vs planilha", href: "/vis-vs-planilha" },
    ],
    body: (
      <>
        <p>
          Muita ótica vende bem e mesmo assim não sobra dinheiro no fim do mês. O motivo quase sempre
          é o mesmo: falta de controle financeiro. Faturamento não é lucro, e caixa cheio num dia não
          significa conta paga no outro. Organizar a parte financeira é o que separa a ótica que
          cresce da que só corre atrás.
        </p>

        <h2>1. Separe as finanças pessoais das da ótica</h2>
        <p>
          O erro número um do dono é misturar o bolso pessoal com o caixa da loja. Tirar dinheiro do
          caixa "para resolver uma coisa" e nunca registrar destrói qualquer controle. A ótica
          precisa ter contas próprias, e o dono, um pró-labore definido. Sem essa separação, nenhum
          relatório é confiável.
        </p>

        <h2>2. Fluxo de caixa e fechamento diário</h2>
        <p>
          Fluxo de caixa é saber o que entra e o que sai, e quando. O hábito mais simples e poderoso
          é o fechamento diário: ao fim do dia, conferir quanto entrou em dinheiro, cartão e PIX e
          bater com o que o sistema registrou. Diferença pequena se resolve no dia; diferença grande
          some se você só percebe no fim do mês.
        </p>

        <h2>3. Contas a pagar e a receber</h2>
        <p>
          A ótica compra de fornecedores e laboratórios (a pagar) e, muitas vezes, vende parcelado (a
          receber). Acompanhar prazos dos dois lados evita dois problemas comuns: pagar juros por
          esquecer um boleto e ter um "buraco" de caixa porque o recebimento atrasou.
        </p>
        <ul>
          <li>Registre toda conta a pagar com vencimento, para nunca pagar atrasado.</li>
          <li>Acompanhe o que tem a receber, para prever o caixa das próximas semanas.</li>
        </ul>

        <h2>4. DRE: o lucro de verdade</h2>
        <p>
          A DRE (Demonstração do Resultado) é o que responde à pergunta que importa: a ótica deu
          lucro neste mês? Ela pega o faturamento, tira o custo das mercadorias (incluindo as
          lentes), as despesas fixas e variáveis, e mostra o resultado real. É a diferença entre
          "achar" que está indo bem e "saber".
        </p>
        <p>
          Montar isso na mão dá trabalho e erra fácil. Ter a{" "}
          <a href="/funcionalidades/gestao-financeira-otica">gestão financeira para ótica</a> com
          fluxo de caixa, contas e DRE prontos tira esse peso e mostra o número certo.
        </p>

        <h2>5. Conciliação</h2>
        <p>
          Conciliar é bater o que o sistema diz com o que o banco e a operadora de cartão mostram. É
          onde aparecem taxas a mais, recebimentos que não caíram e divergências. Sem conciliação,
          você confia em número que pode estar errado.
        </p>

        <h2>6. Indicadores que importam</h2>
        <p>
          Alguns números merecem olhar recorrente:
        </p>
        <ul>
          <li>
            <strong>Margem:</strong> quanto sobra de cada venda depois do custo.
          </li>
          <li>
            <strong>Ticket médio:</strong> valor médio por venda.
          </li>
          <li>
            <strong>Despesa fixa:</strong> o que sai todo mês independentemente de vender.
          </li>
          <li>
            <strong>Resultado do mês:</strong> o lucro (ou prejuízo) real.
          </li>
        </ul>

        <h2>7. Hora de sair da planilha</h2>
        <p>
          A planilha financeira até quebra um galho, mas não conversa com o caixa, não fecha o dia
          sozinha e depende de você lembrar de digitar tudo. Quando a ótica cresce, ela vira fonte de
          erro. Se você está nesse ponto, compare na prática{" "}
          <a href="/vis-vs-planilha">o Vis e a planilha</a> antes de decidir.
        </p>

        <h2>Resumindo</h2>
        <p>
          Gestão financeira de ótica é hábito antes de ferramenta: separar contas, fechar o caixa
          todo dia, acompanhar pagar e receber e olhar a DRE. A ferramenta certa só torna esse hábito
          fácil de manter — e o número, confiável.
        </p>
      </>
    ),
  },
];

export const blogSlugs = blogPosts.map((p) => p.slug);

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
