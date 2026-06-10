# RELATÓRIO — Caixa Fantasma (aberto desde 25/02/2026)

> Análise **read-only** numa cópia isolada do banco (Neon branch de teste). Produção não foi tocada. Nenhuma credencial neste documento.
> Objetivo: entender o impacto antes de fechar o caixa pela tela.

## O que é

Durante a detecção da Fase 2, encontramos **5 caixas abertos há mais de 2 dias**. O mais antigo está **aberto desde 25/02/2026** (mais de 3 meses e meio). Os outros 4 são de 03/06, 04/06, 07/06 e 08/06.

O caixa mais antigo pertence à empresa **"Oticas Matheus Teste"** (filial Matriz) — pelo nome, é uma **empresa de teste sua**, o que explica por que ficou aberto sem ninguém fechar. Vale confirmar se as outras 4 também são de empresas de teste ou se há alguma de cliente real.

## O que passou por esse caixa

| Item | Valor |
|---|---|
| Valor de abertura (fundo de troco) | R$ 0,00 |
| Movimentos registrados | 2 (ambos recebimento de venda em dinheiro) |
| Venda #1 | R$ 24.900,00 (dinheiro) |
| Venda #2 | R$ 12.000,00 (dinheiro) |
| **Total esperado em caixa hoje** | **R$ 36.900,00** |

> Observação: esses valores (R$ 24.900 e R$ 12.000) são altos para uma ótica — consistente com **dados de teste** (valores digitados sem compromisso). A boa notícia: **cada movimento bate exatamente com o total da venda correspondente** — a contabilidade interna do caixa está íntegra, não há divergência a investigar. Só está "esquecido aberto".

## O que vai aparecer quando você fechar agora

Ao fechar pela tela de fechamento de caixa:

1. O sistema vai mostrar o **valor esperado de R$ 36.900,00** (abertura 0 + 2 vendas em dinheiro).
2. Vai pedir o **valor contado** (declarado). Como é caixa de teste, você pode declarar o mesmo valor esperado para fechar com diferença zero — ou o valor que realmente houver, se for um caixa físico real.
3. Qualquer diferença entre esperado e declarado vira o campo `differenceCash` (com justificativa) — registro normal de fechamento.
4. O fechamento marca `closedAt`/`closedByUserId` e libera a filial para abrir um novo turno.

**Impacto em relatórios/DRE:** as 2 vendas **já estão lançadas** (foram contabilizadas na data em que ocorreram, 25/02). Fechar o caixa **não cria receita nova** nem altera o DRE — só encerra o turno e registra a conferência de caixa. O único efeito é que o relatório de "caixas abertos" para de mostrar esse turno fantasma, e a data de fechamento será hoje (não 25/02). Se isso distorcer algum relatório de "tempo de caixa aberto", é cosmético.

## Recomendação prática (minimizar distorção)

1. **Feche pelo fluxo normal do sistema** (tela de fechamento de caixa) — **nunca por SQL direto**. O fechamento dispara os cálculos e registros (diferença, expected/declared, timestamps) que um UPDATE manual pularia, deixando o caixa num estado inconsistente.
2. Para o caixa de teste: declare o valor esperado (R$ 36.900) para fechar com diferença zero, ou ajuste à vontade — é teste.
3. **Confirme antes** se os outros 4 caixas antigos (03–08/06) são de teste ou de cliente real. Se algum for real, o valor esperado precisa bater com o dinheiro físico na gaveta — nesse caso, conte o dinheiro antes de fechar.
4. Esta é **ação sua, na tela** — não é parte do código da Fase 2. O índice parcial da Fase 2 não impede fechar; ele só impede abrir **dois** caixas na mesma filial ao mesmo tempo.

## Por que ficou aberto? (item separado, se quiser investigar)

Não há auto-fechamento de caixa no sistema (o operador precisa fechar manualmente). Isso é comum em PDV, mas se caixas ficam esquecidos abertos com frequência, vale considerar (fora da Fase 2): um alerta no painel quando há caixa aberto há +X horas, ou um lembrete no fim do expediente. Decisão sua.
