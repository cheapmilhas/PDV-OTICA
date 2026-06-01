# Prompt de QA — Claude no Chrome (PDV Ótica)

> **Como usar:** o Claude no Chrome estoura o contexto se você colar tudo de uma vez (ele soma o DOM da página ao prompt a cada passo). Por isso o roteiro está quebrado em **4 blocos**. Faça assim:
>
> 1. Esteja logado com o login de teste em `https://pdv-otica.vercel.app/dashboard`.
> 2. **Comece uma conversa NOVA no Claude do Chrome para cada bloco** (importante — não reaproveite a mesma conversa, senão o contexto acumula e trava).
> 3. Cole o bloco, deixe ele rodar até o relatório, copie o relatório, e passe pro próximo bloco.
> 4. Me cole os 4 relatórios aqui no final (ou um por vez).

---

## BLOCO 1 de 4 — PREÇO / CRÉDITO / VENDA

```
Você é um QA testando um PDV de ótica já aberto neste Chrome (já estou logado). Valide as correções abaixo. É ambiente de teste — pode criar vendas de teste. NÃO mude config da empresa, NÃO exclua dados, NÃO mexa em usuários.

Para cada teste: execute os passos, observe a tela, registre RESULTADO (PASSOU / FALHOU / BLOQUEADO) + o que viu. Se faltar um dado (produto em promoção, cliente com limite baixo), marque BLOQUEADO e diga o que faltou — não invente. Tire print quando FALHAR. Trabalhe um teste por vez, na ordem.

App: https://pdv-otica.vercel.app — PDV em /dashboard/pdv · Vendas em /dashboard/vendas · Clientes em /dashboard/clientes · Produtos em /dashboard/produtos

T1 — Preço abaixo do custo bloqueia
1. PDV: adicione qualquer produto ao carrinho.
2. Edite o preço unitário do item para R$ 0,01.
3. Adicione pagamento cobrindo o total e clique Finalizar.
PASSA: aparece aviso "Preço abaixo do custo" e abre modal pedindo SENHA de gerente (não conclui sozinha).
FALHA: finaliza normalmente sem pedir senha.

T2 — Limite de crédito com 2 métodos a prazo
Pré: cliente com limite de crédito baixo (ex.: R$ 500). Se não houver, em /dashboard/clientes edite um cliente e defina limite = 500. Se impossível, BLOQUEADO.
1. PDV: selecione esse cliente. Monte venda de ~R$ 800.
2. Divida o pagamento em DOIS métodos a prazo: metade "Crediário" (STORE_CREDIT) + metade "Saldo a Receber" (BALANCE_DUE).
3. Finalize.
PASSA: bloqueia por limite excedido (800 > 500) e pede senha de gerente.
FALHA: passa sem bloquear.

T3 — Promoção abaixo do custo NÃO pede senha
Pré: produto com promoPrice cadastrado ABAIXO do custo. Se não houver, em /dashboard/produtos edite um produto e defina promoPrice < custo. Se impossível, BLOQUEADO.
1. PDV: adicione esse produto em promoção. NÃO edite o preço manualmente.
2. Finalize (pague o total).
PASSA: cobra o preço promocional e finaliza SEM pedir senha.
FALHA: pede senha por "preço abaixo do custo".

T4 — Promoção aparece no card do PDV
Pré: qualquer produto com promoPrice < preço de venda.
1. PDV: busque esse produto na grade.
PASSA: card mostra preço cheio RISCADO + preço promocional em destaque (vermelho); ao adicionar, entra pelo preço promocional.
FALHA: mostra/cobra só o preço cheio.

T5 — Duplo-clique no override não duplica venda
1. Monte venda que dispare o modal de gerente (ex.: cenário do T1).
2. Com o modal de senha aberto, tente clicar "Finalizar" da venda de novo (atrás do modal), várias vezes.
3. Cancele o modal.
PASSA: nenhuma venda duplicada; botão travado enquanto modal aberto. Confira em /dashboard/vendas que não há 2 vendas iguais.
FALHA: aparecem 2 vendas idênticas.

T6 — Pagamentos não vazam entre vendas
1. PDV: abra o modal de finalizar, adicione UMA forma de pagamento, FECHE sem confirmar (ESC ou clique fora).
2. Reabra o modal de finalizar.
PASSA: abre limpo, sem o pagamento anterior.
FALHA: o pagamento anterior ainda está lá.

RELATÓRIO FINAL (gere exatamente assim):
Uma linha por teste: "Tn — RESULTADO — o que viu"
Resumo: Total / Passou / Falhou / Bloqueado. Para cada FALHOU: passo exato, o que esperava, o que aconteceu, mensagem/print. Para cada BLOQUEADO: o que faltou.
Comece pelo T1.
```

---

## BLOCO 2 de 4 — CASHBACK / DEVOLUÇÃO

```
Você é um QA testando um PDV de ótica já aberto neste Chrome (já estou logado). É ambiente de teste — pode criar vendas de teste. NÃO mude config da empresa, NÃO exclua dados, NÃO mexa em usuários.

Para cada teste: execute, observe, registre RESULTADO (PASSOU / FALHOU / BLOQUEADO) + o que viu. Falta de dado = BLOQUEADO (diga o que faltou, não invente). Print ao FALHAR. Um teste por vez.

App: https://pdv-otica.vercel.app — PDV /dashboard/pdv · Vendas /dashboard/vendas · Cashback /dashboard/cashback

T7 — Devolução reverte tudo
1. Faça uma venda À VISTA para um cliente (gera cashback). Anote o estoque do produto ANTES (veja em /dashboard/produtos ou /dashboard/estoque).
2. Em /dashboard/vendas, abra os detalhes dessa venda e faça a devolução/estorno.
PASSA: venda fica devolvida; estoque do produto volta ao valor anterior; cashback ganho é estornado (confira em /dashboard/cashback que o saldo do cliente voltou).
FALHA: estoque não volta, ou cashback continua creditado.

T8 — Ajuste de cashback não fica negativo
Pré: cliente com saldo de cashback pequeno e positivo (ex.: ~R$ 30). Em /dashboard/cashback ache um; se nenhum tiver, ajuste para dar a ele um saldo pequeno primeiro.
1. Faça um ajuste manual NEGATIVO maior que o saldo (ex.: −R$ 100 sobre R$ 30).
PASSA: saldo vai a R$ 0 (não negativo). Ajustar negativo de novo com saldo 0 → aviso tipo "saldo já é zero".
FALHA: saldo fica negativo (ex.: −R$ 70).

RELATÓRIO FINAL (gere exatamente assim):
Uma linha por teste: "Tn — RESULTADO — o que viu"
Resumo: Total / Passou / Falhou / Bloqueado. Para cada FALHOU: passo, esperado, ocorrido, mensagem/print. Para cada BLOQUEADO: o que faltou.
Comece pelo T7.
```

---

## BLOCO 3 de 4 — ESTOQUE / ORDEM DE SERVIÇO

```
Você é um QA testando um PDV de ótica já aberto neste Chrome (já estou logado). É ambiente de teste. NÃO mude config da empresa, NÃO exclua dados, NÃO mexa em usuários.

Para cada teste: execute, observe, registre RESULTADO (PASSOU / FALHOU / BLOQUEADO) + o que viu. Falta de dado = BLOQUEADO. Print ao FALHAR. Um teste por vez.

App: https://pdv-otica.vercel.app — Estoque /dashboard/estoque · PDV /dashboard/pdv · Ordens de serviço /dashboard/ordens-servico

T9 — Entrada de lote reflete no estoque da filial
1. Em /dashboard/estoque, registre uma ENTRADA (lote) de um produto numa filial, com quantidade (ex.: 10).
2. Vá ao PDV NESSA MESMA filial e busque o produto.
PASSA: estoque do produto aumentou pela quantidade do lote e pode ser vendido.
FALHA: estoque não mudou na filial / produto continua zerado.

T10 — Transição de status de OS respeita a ordem
1. Em /dashboard/ordens-servico, abra (ou crie) uma OS em status "Rascunho" (DRAFT).
2. Edite a OS e abra o seletor "Novo Status".
PASSA: o seletor mostra APENAS o status atual + o(s) próximo(s) válido(s) (ex.: "Aprovado"). NÃO aparece "Entregue" a partir de Rascunho.
FALHA: o seletor oferece "Entregue" (ou qualquer salto) direto de Rascunho.

RELATÓRIO FINAL (gere exatamente assim):
Uma linha por teste: "Tn — RESULTADO — o que viu"
Resumo: Total / Passou / Falhou / Bloqueado. Para cada FALHOU: passo, esperado, ocorrido, mensagem/print. Para cada BLOQUEADO: o que faltou.
Comece pelo T9.
```

---

## BLOCO 4 de 4 — RELATÓRIOS

```
Você é um QA testando um PDV de ótica já aberto neste Chrome (já estou logado). É ambiente de teste. NÃO mude config da empresa, NÃO exclua dados, NÃO mexa em usuários.

Para cada teste: execute, observe, registre RESULTADO (PASSOU / FALHOU / BLOQUEADO) + o que viu. Falta de dado = BLOQUEADO. Print ao FALHAR. Um teste por vez.

App: https://pdv-otica.vercel.app — Relatórios /dashboard/relatorios · PDV /dashboard/pdv

T11 — Relatório respeita o seletor de filial (precisa ser ADMIN ou GERENTE; só vale se a empresa tiver +1 filial)
1. Em /dashboard/relatorios, troque o seletor de filial para outra filial.
PASSA: os números mudam conforme a filial selecionada.
Obs: se o login for vendedor/caixa/atendente, ele NÃO deve conseguir trocar de filial (fica restrito à própria) — isso também é PASSA.
Se a empresa só tiver 1 filial, BLOQUEADO.

T12 — Timezone correto (venda noturna cai no dia certo)
Só dá pra testar depois das 21h (Brasília). Se for de dia, BLOQUEADO.
1. Faça uma venda agora.
2. Em /dashboard/relatorios veja o relatório de "hoje".
PASSA: a venda aparece HOJE (não no dia seguinte).

T13 — Margem do BI não fica absurdamente negativa
1. Em /dashboard/relatorios → "Rentabilidade por Produto" (ou BI por marca/categoria), veja a margem.
PASSA: margem plausível (positiva ou levemente negativa), não um valor absurdamente negativo por custo inflado.
FALHA: margem extremamente negativa que não bate com a realidade.

RELATÓRIO FINAL (gere exatamente assim):
Uma linha por teste: "Tn — RESULTADO — o que viu"
Resumo: Total / Passou / Falhou / Bloqueado. Para cada FALHOU: passo, esperado, ocorrido, mensagem/print. Para cada BLOQUEADO: o que faltou.
Comece pelo T11.
```

---

## RETESTE — T12 (rodar APÓS 21h, horário de Brasília)

> Só faz sentido depois das 21h BRT — antes disso a venda não cruza a meia-noite UTC e o teste não exercita o bug de timezone. Conversa nova no Claude do Chrome, já logado.

```
Você é um QA testando um PDV de ótica já aberto neste Chrome (já estou logado). É ambiente de teste — pode criar 1 venda de teste. NÃO mude config da empresa, NÃO exclua dados, NÃO mexa em usuários.

Primeiro confirme o horário: me diga a hora atual em Brasília (America/Sao_Paulo). Se for ANTES das 21h, PARE e marque BLOQUEADO (ainda não dá pra testar). Se for 21h ou mais, prossiga.

App: https://pdv-otica.vercel.app — PDV /dashboard/pdv · Relatórios /dashboard/relatorios

T12 — Timezone: venda noturna cai no dia certo
1. Anote a data de HOJE em Brasília (ex.: 01/06/2026).
2. No PDV, faça uma venda simples à vista (qualquer produto, pagamento em Dinheiro cobrindo o total) e finalize.
3. Vá em /dashboard/relatorios, período "Hoje" (e, se quiser confirmar, "Este Mês").
PASSA: a venda que você acabou de fazer aparece no relatório de HOJE, com a data correta (não no dia seguinte).
FALHA: a venda aparece no dia seguinte / some do "Hoje".

RELATÓRIO: "T12 — RESULTADO — o que viu" (inclua a hora de Brasília que você confirmou e a data em que a venda apareceu no relatório). Se FALHOU, descreva data esperada vs. data exibida.
```
