# Prompt de QA — Claude no Chrome (PDV Ótica)

Cole o bloco abaixo no Claude rodando no Chrome, depois de já estar logado com o login de teste em https://pdv-otica.vercel.app/dashboard

---

Você é um QA testando um PDV de ótica já aberto neste navegador (já estou logado). O objetivo é validar correções recentes de bugs. NÃO é um teste destrutivo, mas você VAI criar vendas/OS/orçamentos de teste — tudo bem, é ambiente de teste.

REGRAS:
- Trabalhe um teste por vez, na ordem. Para cada teste: execute os passos, observe a tela, e registre o RESULTADO (PASSOU / FALHOU / BLOQUEADO) + o que você viu.
- Se um teste precisar de um dado que não existe (ex: produto em promoção, cliente com limite baixo), marque como BLOQUEADO e explique o que faltou — não invente.
- Tire um print quando algo falhar.
- NÃO mude configurações da empresa, não exclua dados existentes, não mexa em usuários.
- Ao final, gere um RELATÓRIO no formato indicado no fim deste prompt.

O app fica em https://pdv-otica.vercel.app — as telas relevantes:
- PDV: /dashboard/pdv
- Vendas: /dashboard/vendas
- Ordens de serviço: /dashboard/ordens-servico
- Orçamentos: /dashboard/orcamentos
- Cashback: /dashboard/cashback
- Relatórios: /dashboard/relatorios
- Estoque: /dashboard/estoque

==================================================
BLOCO 1 — PREÇO / CRÉDITO / VENDA (prioridade máxima)
==================================================

T1 — Preço abaixo do custo deve bloquear
1. Vá ao PDV. Adicione qualquer produto ao carrinho.
2. Edite o preço unitário desse item para R$ 0,01.
3. Adicione forma de pagamento cobrindo o total e clique Finalizar.
ESPERADO (PASSA): aparece um aviso de "Preço abaixo do custo" e abre um modal pedindo SENHA de gerente (a venda NÃO conclui sozinha).
FALHA: a venda é finalizada normalmente sem pedir senha.

T2 — Limite de crédito com 2 métodos a prazo
Pré-requisito: um cliente cujo limite de crédito seja baixo (ex.: R$ 500). Se não houver, abra /dashboard/clientes, edite um cliente e defina limite de crédito = 500. Se não for possível, marque BLOQUEADO.
1. No PDV, selecione esse cliente. Monte uma venda de ~R$ 800.
2. Divida o pagamento em DOIS métodos a prazo: metade em "Crediário" (STORE_CREDIT) e metade em "Saldo a Receber" (BALANCE_DUE).
3. Finalize.
ESPERADO (PASSA): bloqueia por limite de crédito excedido (porque 800 > 500) e pede senha de gerente.
FALHA: a venda passa sem bloquear (seria o bug — antes cada método passava por ser < 500 isolado).

T3 — Promoção abaixo do custo NÃO deve pedir senha
Pré-requisito: um produto com preço PROMOCIONAL cadastrado ABAIXO do custo. Se não houver, em /dashboard/produtos edite um produto e defina um promoPrice menor que o custo. Se não for possível, marque BLOQUEADO.
1. No PDV, adicione esse produto em promoção. NÃO edite o preço manualmente.
2. Finalize a venda (pague o total).
ESPERADO (PASSA): cobra o preço promocional e finaliza SEM pedir senha de gerente (a promoção cadastrada já é a autorização).
FALHA: pede senha de gerente por "preço abaixo do custo".

T4 — Promoção aparece no card do PDV
Pré-requisito: qualquer produto com promoPrice cadastrado abaixo do preço de venda.
1. No PDV, busque esse produto na grade de produtos.
ESPERADO (PASSA): o card mostra o preço cheio RISCADO e o preço promocional em destaque (vermelho). Ao adicionar ao carrinho, entra pelo preço promocional.
FALHA: mostra só o preço cheio / cobra o preço cheio.

T5 — Duplo-clique no override não duplica a venda
1. Monte uma venda que dispare o modal de gerente (ex.: aplique um desconto acima do limite do seu perfil, ou use o cenário do T1).
2. Quando o modal de senha de gerente abrir, tente clicar no botão "Finalizar" da venda novamente (atrás do modal), várias vezes.
3. Cancele o modal de gerente.
ESPERADO (PASSA): nenhuma venda duplicada é criada; o botão fica travado enquanto o modal está aberto. Confira em /dashboard/vendas que não há 2 vendas iguais.
FALHA: aparecem 2 vendas idênticas.

T6 — Pagamentos não vazam entre vendas
1. No PDV, abra o modal de finalizar venda, adicione UMA forma de pagamento, mas FECHE o modal sem confirmar (tecla ESC ou clique fora).
2. Reabra o modal de finalizar.
ESPERADO (PASSA): o modal abre limpo, sem o pagamento que você tinha adicionado antes.
FALHA: o pagamento anterior ainda está lá.

==================================================
BLOCO 2 — CASHBACK / DEVOLUÇÃO
==================================================

T7 — Devolução reverte tudo
1. Faça uma venda à vista para um cliente (gera cashback). Anote o estoque do produto antes.
2. Vá em /dashboard/vendas, abra os detalhes dessa venda e faça a devolução/estorno.
ESPERADO (PASSA): a venda fica como devolvida; o estoque do produto volta ao valor anterior; o cashback ganho é estornado (confira em /dashboard/cashback que o saldo do cliente voltou).
FALHA: estoque não volta, ou cashback continua creditado.

T8 — Ajuste de cashback não fica negativo
Pré-requisito: um cliente com saldo de cashback pequeno e positivo (ex.: ~R$ 30). Em /dashboard/cashback ache um cliente com saldo; se nenhum tiver, ajuste para dar a ele um saldo pequeno primeiro.
1. Faça um ajuste manual NEGATIVO maior que o saldo (ex.: −R$ 100 sobre saldo de R$ 30).
ESPERADO (PASSA): o saldo vai para R$ 0 (não fica negativo). Se você tentar ajustar negativo de novo com saldo já em 0, aparece um aviso tipo "saldo já é zero".
FALHA: o saldo fica negativo (ex.: −R$ 70).

==================================================
BLOCO 3 — ESTOQUE / ORDEM DE SERVIÇO
==================================================

T9 — Entrada de lote reflete no estoque da filial
1. Em /dashboard/estoque, registre uma ENTRADA (lote) de um produto numa filial, com uma quantidade (ex.: 10).
2. Vá ao PDV nessa mesma filial e busque o produto.
ESPERADO (PASSA): o estoque do produto aumentou pela quantidade do lote e ele pode ser vendido normalmente.
FALHA: o estoque não mudou na filial / produto continua zerado.

T10 — Transição de status de OS respeita a ordem
1. Em /dashboard/ordens-servico, abra (ou crie) uma OS que esteja em status "Rascunho" (DRAFT).
2. Vá editar a OS e abra o seletor "Novo Status".
ESPERADO (PASSA): o seletor mostra APENAS o status atual + o(s) próximo(s) válido(s) (ex.: "Aprovado"). NÃO aparece "Entregue" como opção a partir de Rascunho.
FALHA: o seletor oferece "Entregue" (ou qualquer salto) diretamente de Rascunho.

==================================================
BLOCO 4 — RELATÓRIOS
==================================================

T11 — Relatório respeita o seletor de filial (precisa ser ADMIN ou GERENTE; só funciona se a empresa tiver +1 filial)
1. Em /dashboard/relatorios, troque o seletor de filial para outra filial.
ESPERADO (PASSA): os números do relatório mudam conforme a filial selecionada.
Observação: se o seu login de teste for vendedor/caixa/atendente, ele NÃO deve conseguir trocar de filial (fica restrito à própria) — isso também é PASSA.
Se a empresa só tiver 1 filial, marque BLOQUEADO.

T12 — Timezone correto (venda noturna cai no dia certo)
Só dá para testar se for depois das 21h (horário de Brasília). Se for de dia, marque BLOQUEADO.
1. Faça uma venda agora.
2. Vá em /dashboard/relatorios e veja o relatório de "hoje".
ESPERADO (PASSA): a venda aparece no dia de HOJE (não no dia seguinte).

T13 — Margem do BI não fica absurdamente negativa
1. Em /dashboard/relatorios (ou financeiro/BI), veja o relatório por marca ou categoria.
ESPERADO (PASSA): a margem dos produtos é um número plausível (positivo ou levemente negativo), não um valor absurdamente negativo causado por custo inflado.
FALHA: margem extremamente negativa que não bate com a realidade.

==================================================
RELATÓRIO FINAL — gere exatamente neste formato e me entregue
==================================================

Para cada teste, uma linha:
Tn — RESULTADO — observação curta do que viu

Depois, um resumo:
- Total: X testes | Passou: X | Falhou: X | Bloqueado: X
- Falhas (detalhe): para cada FALHOU, descreva o passo exato, o que esperava, o que aconteceu, e a mensagem de erro/print se houver.
- Bloqueados: liste o que faltou para cada um.

Comece pelo T1.
