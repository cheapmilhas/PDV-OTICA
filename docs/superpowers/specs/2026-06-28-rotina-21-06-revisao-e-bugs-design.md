# Rotina 21/06 (revisão) + Bugs Grau/Caixa — Design

**Data:** 2026-06-28
**Status:** Design aprovado pelo dono (decisões coletadas)
**Origem:** documento `ROTINA DE TESTE 21.06 - VIS 2.docx` + bug do print (grau) + relato do dono (caixa Ótica Ultra dia 28).

## Resumo executivo

Três frentes:
- **Parte A** — os 5 itens do documento Rotina 21/06: VERIFICADO que 4 estão resolvidos em prod (commit `aec6ef6`); o 5º (herança de fundo) está PARCIAL — falta o caminho manual.
- **Parte B** — bug NOVO: grau exibido sem casas decimais (`-1` em vez de `-1,00`).
- **Parte C** — bugs NOVOS de caixa (apontados pelo dono, confirmados por código + dados reais).

---

## Parte A — Rotina 21/06 (estado verificado)

Verificado contra código atual da main (HEAD 592ba58) E dados reais. Fixes em prod via commit `aec6ef6` (branch `fix/rotina-teste-21-06` FOI mergeada — memória anterior estava desatualizada):

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | Orçamento não insere produto | ✅ RESOLVIDO | `quotes/product-search.tsx:100` onMouseDown+preventDefault |
| 2 | Relatório de caixa impresso quebrado | ✅ RESOLVIDO | `components/caixa/cash-print.ts:74` buildPrintHtml + testes |
| 3 | Caixa negativo (contas a pagar) | ✅ RESOLVIDO | `accounts-payable/route.ts:430,448` FOR UPDATE + withdrawalExceedsCash |
| 4 | Baixa reflete no caixa PDV | ✅ RESOLVIDO | `services/payable-cash-sync.ts:32` postPayableCashWithdrawal cria CashMovement |
| 4b | Fundo herdado entre caixas | ⚠️ PARCIAL → vira Parte C-a | só na auto-abertura (sale/quote.service); manual NÃO |
| 5 | "Cliente desde" = data import | ✅ RESOLVIDO | `import-utils.parseSpreadsheetDate` + template + ficha formatCivilDate |

**Ação Parte A:** nenhuma (4 itens prontos). O 4b vira Parte C-a. Smoke visual recomendado ao dono.

---

## Parte B — Grau sem casas decimais

**Bug:** `prescription-detail-dialog.tsx:39 val()` usa `String(v)` cru → `-1` aparece sem decimais. Idem `prescription-by-customer.tsx grauResumo`.

**Regra de formatação (convenção óptica BR) — decidida:**
| Campo | Formato | Exemplo |
|-------|---------|---------|
| Esférico, Cilíndrico, Adição (dioptria) | 2 casas, vírgula, **sinal +/−** | `+0,75` · `−1,00` |
| Eixo | inteiro, sem sinal | `75` |
| DNP, Altura (medida) | número simples | `32` |
| vazio/nulo | `—` | |

**Decisões do dono:** cobrir TODOS os lugares (helper único) + mostrar `+` nos positivos.

**Plano:**
1. Criar `src/lib/format-grau.ts` — `formatGrau(value, tipo: "dioptria"|"eixo"|"medida"): string`. Puro. Lida com number e string ("−1", "-1.5"), normaliza vírgula/ponto. + testes (negativo, positivo c/ +, zero, vazio, eixo inteiro, string).
2. `prescription-detail-dialog.tsx` — `EYE_COLS` ganha o tipo por linha; `val` usa `formatGrau`. Atualizar teste.
3. `prescription-by-customer.tsx` — `grauResumo` usa `formatGrau(..., "dioptria")`. Atualizar teste.

---

## Parte C — Caixa: fundo na abertura manual + PIX no saldo

**Diagnóstico factual (caixa Ótica Ultra dia 28, dados reais):**
- Caixa fechado 28/06 (`cmqnqalg30005rvymnpr274is`): openingFloat R$0, closingDeclaredCash R$0, 1 movimento PIX R$50 (Venda #6, 26/06). NUNCA teve dinheiro físico.
- Caixa novo (`cmqxqi4ro000m1pg0sum6vijb`): abriu 28/06 com openingFloat R$200 (digitado).
- Os "R$50" do relato são um **PIX**, não dinheiro. Os dados estão classificados corretamente (PIX isolado de CASH).

### C-a — Abertura MANUAL não herda o fundo (CONFIRMADO)
`openShift` (`cash.service.ts:24-89`) usa só `data.openingFloatAmount` do body; `modal-abertura-caixa.tsx:24` hardcoda "200.00". A herança (`resolveInheritedFloat`/`autoOpenShiftWithInheritedFloat`) só roda na auto-abertura por venda (sale.service:638, quote.service:775).

**Decisão do dono:** pré-preencher (sugerir) o fundo com o último fechamento, deixando editar.
**Plano:**
- Backend: endpoint/serviço que devolve o `closingDeclaredCash` do último CashShift CLOSED da filial (reutiliza a query de `autoOpenShiftWithInheritedFloat`). Multi-tenant (companyId+branchId).
- Front (`modal-abertura-caixa.tsx`): no open, fazer fetch desse valor e pré-preencher `valorAbertura` (em vez de "200.00" fixo); operador pode ajustar. Fallback p/ vazio/0 se não houver caixa anterior.
- `openShift` mantém usar o valor do body (que agora vem sugerido) — sem mudança de regra no backend além do endpoint de sugestão.

### C-b — Tela soma PIX/débito no "Saldo em gaveta · Dinheiro" (CONFIRMADO)
`dashboard/caixa/page.tsx:168 valorAtual` soma "tudo exceto a prazo" → inclui PIX e DEBIT_CARD (que estão em METHODS_IN_CASH, não em METHODS_A_PRAZO). O label (`:465`) diz "Dinheiro" mas o número inclui PIX. O fechamento real está correto (filtra CASH).

**Decisão do dono:** "Saldo em caixa" = SÓ dinheiro físico (method=CASH).
**Plano:**
- `page.tsx`: `valorAtual` filtra só `method === "CASH"` (entradas e saídas CASH). PIX/débito saem do número "Saldo em caixa".
- Garantir que PIX/débito apareçam em outra linha (resumo por forma de pagamento já existe — `resumoPagamentos`). Confirmar que a UI mostra esses totais separados para não "sumir" a informação.
- Atenuar risco: conferir se algum outro lugar consome `valorAtual` com a semântica antiga (ex.: alerta de caixa) antes de mudar.

---

## Faseamento sugerido
- **Fase 1 (rápida, isolada):** Parte B (grau). Não toca caixa. Deploy independente.
- **Fase 2:** Parte C-b (saldo só CASH) — mudança de cálculo localizada + verificação de consumidores.
- **Fase 3:** Parte C-a (herdar fundo na abertura manual) — endpoint + front.

Cada fase: TDD onde houver lógica (helper grau, cálculo de saldo, resolução de fundo), tsc + build + review, deploy só com OK do dono.

## Fora de escopo
- Reescrever o sistema de caixa; relatórios; o documento não pede mais nada além dos 5 itens (todos cobertos).
- Migração de dados do caixa Ultra (nada a migrar — os dados estão corretos; era percepção).

## Premissas
- `closingDeclaredCash` = dinheiro físico declarado (confirmado no fechamento). PIX nunca entra nele.
- `METHODS_IN_CASH = [CASH, PIX, DEBIT_CARD]`; `METHODS_A_PRAZO` exclui esses. A confusão de C-b vem de "in cash" (à vista) ≠ "dinheiro físico".
