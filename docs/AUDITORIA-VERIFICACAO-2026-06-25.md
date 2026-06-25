# Auditoria de Verificação Independente — PDV ÓTICA/VIS (2026-06-25)

Segunda passada **100% READ-ONLY** sobre os 36 achados de `AUDITORIA-COMPLETA-2026-06-23.md`.
Cada achado foi **re-deduzido do zero**, lendo o código atual de ponta a ponta, com prova colada.
Vereditos divergentes foram resolvidos por leitura manual do auditor principal.

> Nota de método: os números de linha do relatório anterior estavam deslocados (arquivos em
> `src/...`). As linhas abaixo são as REAIS do código atual. Nenhum arquivo foi alterado.

---

## 🎯 PLACAR FINAL

> ✅ **26 confirmados** · ❌ **3 falsos positivos derrubados** · ⚠️ **5 parciais/reclassificados** · 🆕 **4 achados novos** · ❓ **2 não verificados**

**Mudanças de classificação mais importantes vs. relatório anterior:**
- **C5 (conciliação) rebaixado de 🔴 Crítico → 🟠 Alto** — é escrita cross-tenant real, mas precisa do UUID do item alheio e não vaza leitura.
- **A2 (cancelamento não estorna boleto/cheque) = ❌ FALSO POSITIVO** — esses métodos nunca tocam FinanceAccount; estaria correto não estornar.
- **"Erros crus ao usuário" = ❌ FALSO POSITIVO em produção** — o error-handler mascara mensagens técnicas em prod.

---

## 🔴 CRÍTICOS CONFIRMADOS (dinheiro/segurança)

### C1 — DRE da tela conta vendas DEVOLVIDAS (REFUNDED) como receita ✅ 🔴
`src/services/reports/dre.service.ts:61` → `status: { not: "CANCELED" }`. O enum é `OPEN|COMPLETED|CANCELED|REFUNDED`; `refundFull` (`sale.service.ts:1220`) marca `REFUNDED`, que **passa pelo filtro** e soma receita+CMV.
**Correção do relatório anterior:** "OPEN/DRAFT como receita" é impreciso — `DRAFT` não existe e nenhuma venda é persistida como `OPEN` (o único create grava `COMPLETED`). **O vazamento real é só REFUNDED.**
**Achado novo correlato:** existem **dois DREs que divergem** — o dinâmico (`finance-report.service.ts`, baseado no ledger FinanceEntry) está **correto** (o ledger é apagado no cancel/refund); o da tela infla com REFUNDED. Quem olhar os dois vê números diferentes.
**Repro:** devolver uma venda → abrir DRE do mês → receita continua inflada.

### C2 — Importação de produtos NÃO cria BranchStock (estoque fantasma em massa) ✅ 🔴
`src/app/api/products/import/route.ts` — 0 referências a BranchStock; `create` (239-264) e `update` (209-233) gravam só `Product.stockQty`. O cadastro manual (`product.service.ts:380`) chama `syncBranchStock` em transação — **a importação não**.
**Achados novos:** (1) é o endpoint que a **tela de produtos** usa (`produtos/page.tsx:170`) — está no caminho de produção, não é endpoint morto; (2) existe um SEGUNDO importador (`data-management/import/products`) que **faz certo** (`branchStock.upsert`) — a inconsistência é entre os dois; (3) `syncBranchStock` só age em loja de **1 filial** (`product.service.ts:296` `if (branches.length !== 1) return`) — em multi-filial, nem o cadastro manual cria BranchStock.
**Repro:** importar produto pela tela → vender → "Disponível: 0".

### C3 — Importação de produtos ignora toda validação Zod ✅ 🔴
`src/app/api/products/import/route.ts:162-176`: `parseFloat(String(precoVenda)) || 0` (preço ≤0 ou texto vira 0), `parseInt(String(estoqueAtual)) || 0` (negativo passa). Nenhum `createProductSchema.parse`. Só valida "Nome obrigatório".
**Achado novo:** o **import de clientes** (`customers/import/route.ts:100`) também não usa o schema nem `validateCPF` — CPF de 11 dígitos inválido entra.

### C6 — XSS armazenado em recibo/carnê ✅ 🔴(receipt) / 🟡(carnê parcial)
`accounts-receivable/[id]/receipt/route.ts` interpola SEM escape: `customer?.name` (117), `description` (130), `receivedBy?.name` (170), `companyName` (193). `text/html` na linha 203.
`.../sale/[saleId]/carne/route.ts` — `sale.customer?.name` sem escape em 117-119 e 195 (mas o cabeçalho via `companyHeaderHtml`/`pdf-header.ts` escapa).
**Confirmado que `products/print/route.ts` ESCAPA** (usa `escapeHtml` em todas as interpolações) — prova que a lib existe e o padrão era conhecido.
**Repro:** cadastrar cliente com nome `<img src=x onerror=...>` → abrir recibo → executa no navegador.

---

## 🟠 ALTOS CONFIRMADOS

### C5 — Escrita cross-tenant na conciliação (IDOR pai-vs-filho) ✅ ⬇️ rebaixado 🔴→🟠
`resolve/route.ts:21-24` valida o **batch** por companyId, mas passa `itemId` direto p/ `resolveItem` (`reconciliation-resolution.service.ts:23`), que faz `findUniqueOrThrow({ where: { id: itemId } })` **sem checar `item.batchId === batchId`** e deriva companyId do próprio item (linha 28).
**Verdict do auditor principal (resolvi a divergência entre verificadores):** É REAL. No caminho de resolução SEM `matchedSalePaymentId` (tipo IGNORED/DIVERGENT) não há nenhuma proteção — o item da empresa B é atualizado (status RESOLVED, resolvedByUserId, notas). A rota irmã PATCH faz certo (`where: { id: itemId, batchId }`). Rebaixado a 🟠 porque exige conhecer o UUID do item alheio e não vaza leitura.

### C4 — Cancelamento decrementa saldo CARD_ACQUIRER nunca incrementado ✅ 🟠 (era 🔴)
`finance-entry.service.ts:417` pula o increment quando `faType === CARD_ACQUIRER` (venda no cartão NÃO credita o adquirente — espera settlement). **Grep no repo todo: não existe job/webhook de settlement que incremente** (`card-settlement/route.ts` é GET read-only). Mas o cancelamento (`sale.service.ts:1084`) **decrementa** DEBIT_CARD/CREDIT_CARD. Saldo do adquirente só anda pra baixo.
**Mantido como Alto** (não Crítico): o saldo CARD_ACQUIRER hoje já é "incompleto por design" (settlement não implementado), então é uma inconsistência sobre uma feature inacabada, não corrupção de saldo operacional ativo.

### A1 — Reativação valida estoque pelo cache global ✅ ⚠️ severidade menor 🟡
`sale.service.ts:1284` valida `product.stockQty` (cache); `:1321` debita BranchStock via `atomicStockDebit`. **Ressalva importante:** `atomicStockDebit` TEM guard atômico (`quantity: { gte }`, `stock.service.ts:79-86`) e **falha fechada** se a filial não tiver saldo — então NÃO debita fantasma; só a leitura da validação é inconsistente. Dano contido. 🟡, não 🟠.

### A3 — Despesa recorrente ignora a frequência ✅ 🟠
`recurring-expenses/generate/route.ts:25-81` — o model TEM `frequency` (`schema.prisma`, default MONTHLY), mas o loop **nunca lê `exp.frequency`**; gera 1 AccountPayable por despesa ativa todo mês, e `nextDueDate` é hardcoded `month+1`. Despesa ANNUAL/QUARTERLY vira conta mensal.

### A4 — Juros de pagamento parcial sobre principal cheio ✅ 🟠
`receive-multiple/route.ts:93` → `calculatePenalties(existing, now)`; `penalty-utils.ts:45-51` calcula multa/juros **sempre sobre `receivable.amount` (principal integral)**, sem subtrair `receivedAmount` já pago. 2ª parcial cobra juros sobre o valor cheio.

### A5 — refundFull não atômico/idempotente ✅ 🟠
`sale.service.ts:1160-1228` — 3 commits separados (refund.create → cancel → update REFUNDED), guard de status é leitura-antes-de-agir SEM `FOR UPDATE`. `Refund` tem só `@@index([saleId])`, **não `@@unique`** (`schema.prisma:3049`). Duplo-clique → 2 Refund + reversões duplicadas (estoque/caixa).

### A6 — Ajuste PENDENTE usa snapshot velho, não revalida na aprovação ✅ 🟠
`stock-adjustment.service.ts:44-59` valida negativo só no create; `applyAdjustment` (330-380) faz `increment` cego sem revalidar. Ajuste -80 criado com saldo 100, aprovado quando há 20 → estoque -60 mesmo com `allow_negative_stock` off.

### A7 — Ajuste de estoque sem branchId → sempre na matriz ✅ 🟠
`stock-adjustment.schema.ts:7-29` não tem `branchId`; `applyAdjustment:354-362` faz fallback p/ a filial mais antiga (matriz). Inventário da Filial 2 corrige saldo da Matriz.

### A8 — Transferência: race TOCTOU + decrement sem guard ✅ 🟠
`stock-transfers/route.ts`: checagem de saldo FORA da `$transaction` (87-105, tx começa em 110); débito `decrement` sem `where quantity>=qty` (141-144). `atomicStockDebit` tem o guard; a transferência não.
**Achado novo:** o mesmo defeito se repete na **aprovação** de transferência pendente (`stock-transfers/[id]/route.ts:47-79`).

### A9 — goals/sellers-ranking + monthly-summary SEM requirePermission ✅ 🟠
Ambas as rotas (linhas 9-15) só fazem `auth()` + `requirePlanFeature` — **sem `requirePermission`**. ATENDENTE/CAIXA veem faturamento e comissão de todos os vendedores.

### A10 — Dois motores de comissão divergentes ✅ 🟠
`goals.service.ts:328-337` usa `CommissionConfig` (base+bônus de meta); `sellers-ranking:68` e `monthly-summary:68` usam `user.defaultCommissionPercent` (ignora bônus). Comissão exibida ≠ a que `goals.service` calcula.

### A11 — Meta inventada ignora a cadastrada ✅ 🟠
`sellers-ranking:58-62` e `monthly-summary:58-59`: `metaGeralMes = lastMonthTotal*1.1 || 150000`. Nenhuma consulta a `SalesGoal`/`SellerGoal`. A meta que o gerente cadastra (`goals.service.getDashboard`) é ignorada nessas telas.

### A12 — Receita óptica do orçamento/OS sem validação de faixa ✅ 🟠
`quote.schema.ts:9-15` (esf/cil/eixo/dnp/altura/adicao = `z.string().optional()`) e `service-order.schema.ts:30` (`prescription: z.string().max(5000)`). Contra `prescription.schema.ts:15-25` que valida (sph -30..30, cyl -10..10, axis 0..180, add 0.5..4). Orçamento/OS aceitam eixo="999", esf="abc".
**Verificado:** venda direta de lente (`createFromSale`) não recebe receita óptica, então o gap é só na criação/edição manual de OS e no orçamento.

---

## 🟡 MÉDIOS CONFIRMADOS

| # | Onde | Confirmação |
|---|------|-------------|
| A13 | `ocr/prescription/route.ts:193-203` | ✅ 422 devolve `rawText` (saída crua do Claude) ao cliente |
| A14 | `financeiro/page.tsx:286` + `lancamentos/page.tsx:263` | ✅ **PARCIAL**: payable dueDate e entryDate gravam -1 dia em BRT (`new Date("yyyy-MM-dd").toISOString()`). **OS (`ordens-servico`) está MITIGADA** — o servidor usa `dateOnlyToUTC`. Helper existe (`date-utils.ts:37`), só não é usado nas 2 rotas financeiras. Achado novo: conciliação/lotes-estoque também têm o padrão |
| M1 | `schema.prisma:3173` | ✅ `matchedSalePaymentId` sem `@@unique` → double-count |
| M2 | `accounts-receivable/route.ts:603-625` | ✅ recebimento vira RECEIVED sem CashMovement se não há turno aberto |
| M3 | `card-fee.service.ts:29-44` | ✅ fee parcelado usa taxa à vista no fallback (subcobra) |
| M4 | `recurring-expenses/route.ts` | ✅ POST/PUT/DELETE/generate sem requireWriteAccess/requirePermission |
| M5 | `sale.service.ts:1187-1194` | ✅ refund deriva do preço dos itens, não do efetivamente pago |
| M6 | `card-fees/route.ts:31-41` + `finance/chart/route.ts:42` | ✅ POST sem Zod/bounds (feePercent negativo passa) |
| M7 | `cashback.service.ts:139-144` | ✅ aniversário compara só `getMonth()` — vale o mês todo (comentário diz "mês e dia") |
| M8 | `cashback/customer/[customerId]` | ✅ não valida posse do cliente; cria CustomerCashback órfã |
| M9 | `customer.schema.ts:273` | ✅ `validateCPF` (dígito) é código morto — 0 chamadas; só regex `\d{11}` |
| M10 | `auth/activate/route.ts` | ✅ sem rate limit (verify-manager tem) |
| M11 | `public/contact` + `plan-interest` | ✅ sem rate limit (register tem) |
| M12 | webhooks Asaas/Evolution/NFe | ✅ fail-open só se `ALLOW_UNSIGNED_*=1` setado (kill-switch sem TTL) |
| M13 | `reports.service.ts:114` | ✅ salesCount conta itens, não vendas distintas (métrica) |
| M14 | `goals.service.ts:208` + ranking | ✅ fronteira de mês em UTC vs reports.service em BRT |
| **#8 PDV** | `cash.service.ts:112-131` | ✅ **closeShift sem branchId** — usuário multi-filial fecha caixa de outra filial da MESMA empresa. createMovement escopa branchId, closeShift não. (MÉDIA-ALTA) |

---

## 🆕 ACHADOS NOVOS (não estavam no relatório anterior)

1. **IDOR em `admin/clientes/[id]/notes/[noteId]`** — `update`/`delete` por `noteId` sem usar o `[id]` (companyId). **Severidade baixa**: rota `/admin/` protegida por `getAdminSession()` = super admin do SaaS (já tem acesso a todas as empresas). Não é vazamento entre óticas-clientes; é robustez. 🟡/⚪
2. **Segundo importador de produtos faz BranchStock certo** (`data-management/import/products`) enquanto o da tela não — inconsistência entre dois caminhos (agrava C2).
3. **A8 se repete na aprovação de transferência** (`stock-transfers/[id]/route.ts`).
4. **`syncBranchStock` só funciona em loja de 1 filial** — em multi-filial nem o cadastro manual cria BranchStock (depende de transferência/entrada).
5. **Comissão em `goals.service.ts:329` é float sem arredondar** antes de gravar Decimal (drift de centavos).
6. **`console.log` financeiro vaza payload** (`financeiro/page.tsx:277` loga conta a pagar inteira).

---

## ❌ FALSOS POSITIVOS DERRUBADOS

1. **A2 — "cancelamento não estorna BOLETO/CHEQUE/STORE_CREDIT"** — FALSO. `getFinanceAccountType` retorna `null` para esses métodos (`finance-entry.service.ts:102-106`); eles **nunca incrementam FinanceAccount** na venda, logo não há saldo a estornar. O cancelamento trata o "a receber" via `accountReceivable → CANCELED`. Estaria errado estornar.
2. **"Erros crus do backend ao usuário"** — FALSO em produção. O `error-handler.ts` mascara: Prisma → "Erro de banco de dados..." (texto cru só em dev); 500 → "Erro interno do servidor"; P2002/P2025 → mensagens curadas em PT. Constraint/HTTP 500 não chega cru ao usuário em prod.
3. **"SQL Injection via $queryRaw"** — FALSO. Todos os `$queryRaw`/`$executeRaw` usam template tag parametrizado do Prisma (`${companyId}` vira parâmetro, não concatenação). Nenhuma concatenação insegura.
4. **"Crons sem CRON_SECRET"** — FALSO. Os 13 crons verificam `CRON_SECRET` (Bearer), fail-closed.
5. **"Novo anti-padrão onBlur+setTimeout"** — FALSO. Só existe nos 2 já corrigidos (product-search, product-combobox). O `onBlur` em `new-client-form.tsx:369` é lookup de CEP (sem setTimeout/dropdown).

---

## ✅ CONFIRMADO SÓLIDO (não derrubar)
- **Duplo-submit PDV:** `submitLockRef` síncrono (pdv/page.tsx:93,665,678) + modal com `disabled={loading}` (604). Protegido.
- **Multi-tenancy de escrita** (produtos/estoque/fornecedores/transferências): todos os writes "por id" são precedidos de leitura escopada em companyId. Sem furo (exceto C5-conciliação e o IDOR admin-only de notes).
- **DRE dinâmico** (ledger): correto. **Crons, webhooks (HMAC+timingSafeEqual), impersonation, chaves IA cifradas:** OK.
- **`atomicStockDebit`** com guard atômico: correto (é o padrão que ajuste/transferência deveriam reusar).

---

## ❓ NÃO VERIFICADO (precisa de outra passada)
1. **Writer original da comissão por venda** (`COMMISSION_EXPENSE` no ledger / `reverseCommissionForSaleInTx`) — só li o ranking e o relatório de comissões, não o ponto exato onde a comissão por venda é gravada/revertida.
2. **Fluxo `renegotiate` e `reverse-payment` de AccountReceivable** — não auditado a fundo.
3. **Dashboard/KPIs** (`reports.service.ts:821` tem variação de clientes hardcoded em 0 — visto, mas o resto dos KPIs não foi verificado linha a linha).
4. **As ~331 rotas completas** — foi feita amostragem representativa de multi-tenancy/auth, não leitura das 331. As áreas de maior risco (financeiro, estoque, conciliação, goals, cashback, auth, webhooks, crons) foram cobertas.
5. **Geração de PDF / upload de arquivo** (se houver) — não investigado.

---

## TABELA DE COBERTURA

| Categoria | Inspecionado | Como | Resultado |
|---|---|---|---|
| Multi-tenant (escrita) | conciliação, produtos, estoque, fornecedores, transferências, cashback, admin/notes, admin/companies | grep writes + leitura de cada where ponta a ponta | 1 furo real (C5), 1 admin-only (notes), resto OK |
| Dinheiro/financeiro | DRE×2, finance-report, comissões, metas, juros, cashback, card-fee, refund | leitura completa dos services + filtros de status colados | C1/C4 confirmados, A2 derrubado, 2 DREs divergem |
| Estoque | product create×4 caminhos, import×2, ajuste, transferência×2 | leitura + tabela de quem cria BranchStock | C2/C3/A6/A7/A8 confirmados |
| Atomicidade/idempotência | refundFull, transferência, ajuste, PDV submit, AR receive | leitura de $transaction/lock/unique | A5 confirmado; PDV protegido |
| Segurança | XSS (todos text/html), IDOR pai-filho, $queryRaw, rotas públicas, crons, webhooks | grep + leitura | C6 confirmado, C5 real, SQLi/cron derrubados |
| Datas/fuso | payable, entries, OS, conciliação, lotes | grep new Date(...).toISOString() + date-utils | A14 parcial (financeiro real, OS mitigada) |
| Validação | import produtos/clientes, CPF, óptico | leitura schemas | C3/A12/M9 confirmados |
| UX/higiene | console.log, error-handler, botões admin, dropdown | grep + leitura | console.log confirmado, "erro cru" derrubado |

---

## SUGESTÃO DE PRIORIDADE (revisada pós-verificação)
1. **C6 (XSS recibo) + C5 (conciliação cross-tenant)** — segurança real, correção barata (escapeHtml + `where: {id, batchId}`).
2. **C2 + C3 (importação sem BranchStock e sem validação)** — estoque/preço errado em massa; está no caminho de produção. Solução: importação chamar `productService.create/update`.
3. **C1 (DRE conta REFUNDED)** — número que o dono usa para decidir.
4. **#8 closeShift sem branchId + A9 (goals sem permissão)** — isolamento/permissão.
5. **A3/A4/A5/M4/M6** — dinheiro recorrente, juros, atomicidade, permissão/validação financeira.
6. **A6/A7/A8 (estoque: ajuste/transferência)** — race e filial errada.
7. **A12 (validação óptica)** — risco ao cliente da ótica.
8. **A14 + M-vários + higiene** (datas, cashback aniversário, CPF, console.log).

> Tudo acima é diagnóstico. Nada foi alterado. Read-only.
