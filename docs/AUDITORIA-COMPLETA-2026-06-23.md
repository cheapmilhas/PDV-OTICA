# Auditoria Completa do Sistema — PDV ÓTICA (2026-06-23)

Análise sistemática de ~88 telas, 331 rotas de API e 105 services, por 7 auditores
especializados (PDV/Caixa, Financeiro, Estoque, Clientes/OS, Relatórios/Permissões,
Segurança, UX/UI). Os achados CRÍTICOS e ALTOS abaixo foram **confirmados manualmente
no código**. Severidade: 🔴 Crítico · 🟠 Alto · 🟡 Médio · ⚪ Baixo.

> NÃO implementado — relatório para análise e priorização do dono.

---

## 🔴 CRÍTICOS (dinheiro/dado errado, vazamento entre empresas, segurança)

| # | Onde | Problema | Impacto |
|---|------|----------|---------|
| C1 | `services/reports/dre.service.ts:58-91` | DRE conta vendas **DEVOLVIDAS (REFUNDED)** e rascunhos (OPEN/DRAFT) como receita cheia + CMV. Filtra só `≠ CANCELED`. | Lucro do mês superestimado em todo mês com devolução. Dono decide com número errado. |
| C2 | `app/api/products/import/route.ts` (todo) | Importação grava `stockQty` mas **NUNCA cria BranchStock** (0 referências). Mesma falha "estoque fantasma" já corrigida no cadastro manual. | Produtos importados (volume da migração) ficam **invendáveis** ("Disponível: 0") até edição manual. |
| C3 | `app/api/products/import/route.ts:163-176` | Importação **ignora toda validação Zod** — preço negativo/zero, estoque negativo, texto→0 silencioso. | Preço errado entra no catálogo (dinheiro errado na venda); perda silenciosa de dados. |
| C4 | `services/sale.service.ts:1073-1088` | Cancelamento/devolução de **cartão** decrementa saldo `CARD_ACQUIRER` que nunca foi incrementado na venda. | Saldo do adquirente fica **negativo permanente** após qualquer devolução de cartão. |
| C5 | `app/api/.../reconciliation/.../resolve/route.ts` + `reconciliation-resolution.service.ts:23` | Rota valida o **batch** mas passa `itemId` sem checar dono → escreve em item de **outra empresa**. | **Vazamento cross-tenant (escrita)**: ótica A corrompe conciliação da ótica B. |
| C6 | `accounts-receivable/[id]/receipt/route.ts` + `.../carne/route.ts` | HTML do recibo/carnê interpola `customer.name` etc. **sem `escapeHtml`** (outras rotas escapam). | **XSS armazenado**: nome de cliente com `<script>` executa no navegador de quem abre o recibo. |
| C7 | `.env` / `.env.diagnostic` | Credenciais Neon de produção + `NEXTAUTH_SECRET` no disco (não no git, mas live). | Risco se vazar (zip/print). Conhecer o secret permite forjar sessão. Rotacionar. |

## 🟠 ALTOS (dinheiro/estoque errado, bypass de permissão, race)

| # | Onde | Problema | Impacto |
|---|------|----------|---------|
| A1 | `services/sale.service.ts:1277-1321` | Reativação de venda valida estoque pelo **cache global** (`stockQty`), debita do **BranchStock** da filial. | Reativação falha ou debita filial errada (estoque fantasma). |
| A2 | `services/sale.service.ts:1073-1088` | Cancelamento não estorna saldo de **BOLETO/CHEQUE/STORE_CREDIT**. | Saldo de conta inflado após cancelar venda a prazo (as mais comuns). |
| A3 | `app/api/recurring-expenses/generate/route.ts:25-63` | Geração de despesa recorrente **ignora a frequência** — gera todo mês para tudo (anual, trimestral). | Contas a pagar e projeção de caixa massivamente infladas. |
| A4 | `accounts-receivable/receive-multiple/route.ts:93-148` | Juros de pagamento parcial **derivam** (cobra juros sobre principal já pago). | Cliente cobrado a mais; recibo não bate. |
| A5 | `services/sale.service.ts:1198-1225` | Devolução **não atômica nem idempotente** (3 commits separados, sem lock/unique). | Duplo-clique/crash → estoque +2×, caixa estornado 2×, saldo cartão 2×. |
| A6 | `stock-adjustment.service.ts:44-59` vs `:330-384` | Ajuste PENDENTE usa snapshot velho, **não revalida** na aprovação. | Estoque negativo mesmo com trava desligada; auditoria mente. |
| A7 | `stock-adjustment.schema.ts` (sem branchId) | Ajuste de estoque **sem branchId** → sempre na filial **matriz**. | Inventário da Filial 2 corrige saldo da Matriz. |
| A8 | `app/api/stock-transfers/route.ts:86-144` | Transferência: checagem de saldo **fora da transação** + decrement sem guard (TOCTOU). | Estoque de origem fica negativo; unidade "duplicada". |
| A9 | `app/api/goals/sellers-ranking/route.ts` + `monthly-summary` | **Sem `requirePermission`** — só `auth()`. Expõe faturamento/comissão por vendedor. | ATENDENTE sem permissão vê ranking financeiro de todos. |
| A10 | `goals.service.ts:315` vs `goals/sellers-ranking:68` | **Dois motores de comissão divergentes** na mesma tela de Metas (CommissionConfig vs defaultCommissionPercent). | Comissão exibida ≠ paga. Conflito real. |
| A11 | `goals/sellers-ranking:59` + `monthly-summary:59` | Meta **inventada** (110% do mês anterior ou R$150k fixo), ignora a meta cadastrada. | "% da meta" fictício, diverge do que o gerente cadastrou. |
| A12 | `quote.schema.ts:9-26` + `service-order.schema.ts:30` | Receita óptica do orçamento/OS é **string livre, sem validação de faixa** (eixo>180, sinal trocado). | Lente fabricada errada — prejuízo + cliente não enxerga. (motor existe, não é chamado) |
| A13 | OCR `app/api/ocr/prescription/route.ts:200` | Resposta 422 vaza `rawText` (saída crua do Claude + prompt) ao usuário. | Expõe internals; texto técnico confuso no fluxo foto→OS. |
| A14 | Datas "date-only" → `.toISOString()` em financeiro/lançamentos/OS | Grava **1 dia antes** em BRT (mesma classe do bug de nascimento). | Vencimento/entrega da OS no dia errado. |

## 🟡 MÉDIOS (selecionados)

| # | Onde | Problema |
|---|------|----------|
| M1 | `ReconciliationItem.matchedSalePaymentId` sem `@@unique` | Mesmo pagamento conciliado em 2 itens (double-count). |
| M2 | `accounts-receivable/route.ts:601` | Recebimento marca pago **sem movimento de caixa** se não houver turno aberto. |
| M3 | `card-fee.service.ts:30-46` | Taxa de cartão parcelado subcobrada (fallback usa taxa à vista). |
| M4 | `app/api/recurring-expenses/route.ts` | Rotas sem `requireWriteAccess`/`requirePermission` (tenant inadimplente cria conta). |
| M5 | `services/sale.service.ts:1187` | Refund pode exceder o efetivamente pago (devolução de crediário não pago vira dinheiro saindo). |
| M6 | `card-fees/route.ts` + `finance/chart/route.ts` | POST sem validação Zod/bounds (feePercent negativo corrompe todo cálculo). |
| M7 | `cashback.service.ts:135-145` | Cashback de aniversário aplica o **mês inteiro**, não o dia (comentário diz dia). |
| M8 | `cashback/customer/[customerId]` | Não valida posse do cliente; cria cashback órfão sob a sua branch. |
| M9 | `customer.schema.ts:34` | `validateCPF` (dígito verificador) é **código morto** — CPF inválido aceito, enfraquece dedup. |
| M10 | `app/api/auth/activate/route.ts` | Sem rate limit (outras rotas de auth têm). |
| M11 | `app/api/public/contact` + `plan-interest` | Sem rate limit → flood na tabela de auditoria. |
| M12 | webhooks Asaas/Evolution/NFe | HMAC fail-open se `ALLOW_UNSIGNED_*=1` ficar ligado (sem TTL). |
| M13 | `reports.service.ts:113` | `salesCount` conta itens, não vendas distintas (métrica inflada). |
| M14 | `goals.service.ts` + ranking | Apuração de meta/comissão em **fuso UTC** (diverge dos relatórios que já usam BRT). |
| M15 | Fila WhatsApp `whatsapp-send.ts:277` | `.catch(()=>{})` no update de falha pode deixar msg presa em PROCESSING. |

## ⚪ BAIXOS (higiene/UX)
- 62 `console.log` em produção (`vendas/[id]/imprimir`, `financeiro/page.tsx` loga payload, etc).
- Erros crus do backend (`toast.error(error.message)`) em fornecedores/funcionários/financeiro (~4 telas).
- Botões admin destrutivos sem `disabled` de loading (~3 telas: excluir empresa, cancelar assinatura, planos).
- Seed de permissões: `deleteMany` global de RolePermission, não-atômico (custom grants preservados, ok).
- Cashback config com defaults permissivos (5% earn, 50% uso, isActive=true) em payload parcial.
- DRE da tela vs DRE dinâmica divergem (cancel/refund deletam FinanceEntry em vez de postar estorno; `generateRefundEntries` é código morto).

---

## ✅ O que está SÓLIDO (auditado e aprovado)
- **PDV/venda:** cálculo de totais/desconto/troco/cashback (decimal.js, fonte única front+back), duplo-submit (lock + Idempotency-Key + rate limit), auto-abertura de caixa com P2002, fechamento/sangria com `FOR UPDATE`.
- **Multi-tenancy geral:** quase todas as rotas `[id]` filtram `companyId` em dupla camada (rota + service). Exceção real = C5 (conciliação resolve).
- **Crons (13):** todos verificam `CRON_SECRET` Bearer, fail-closed.
- **Webhooks:** HMAC/JWT + timingSafeEqual + idempotência (ressalva M12).
- **Impersonation:** validação cruzada JWT×DB, re-leitura do admin.
- **Chaves de IA:** cifradas AES-256-GCM, nunca retornadas em texto.
- **Travas recentes:** caixa negativo + estorno-por-net em accounts-payable (corrigidos nesta semana) confirmados OK.
- **Dropdown onBlur×onClick:** só existia nos 2 já corrigidos (product-search, product-combobox); demais usam click-outside seguro.

## Sugestão de priorização
1. **C5, C6** (vazamento cross-tenant + XSS) — segurança, baratos de corrigir.
2. **C1, C2, C3** (DRE devolução, importação sem BranchStock + sem validação) — dinheiro/estoque que o dono e clientes veem.
3. **C4, A1, A2, A5** (saldos de cartão/cancelamento/devolução) — consistência financeira.
4. **A9, A10, A11** (permissão + comissão/meta divergente) — confiança do gerente.
5. **C7** (rotacionar credenciais) — operacional, fazer já.
6. A12, A14 (dados ópticos + datas -1 dia), depois médios/baixos.
