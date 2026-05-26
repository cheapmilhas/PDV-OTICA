# Smoke Test E2E — PDV ÓTICA · 2026-05-25/26

Ambiente testado: **localhost:3000** (dev) e **https://pdv-otica.vercel.app** (produção). Mesmo banco Neon nos dois.
Empresa: **Óticas Atacadão dos Óculos** (`cmlx4fkjt000092bq1n7rm63g`).
Usuário: `admin@pdvotica.com` / `admin123` (digitado inicialmente como `.br`, **typo corrigido pelo diagnóstico no banco**).
Filial selecionada: **Pacajus**.

## Status dos 3 fluxos golden

| # | Fluxo | Local | Prod | Severidade |
|---|---|---|---|---|
| 1 | PDV — venda à vista | ❌ Falha **silenciosa** (P2028 timeout) | ⚠️ Funciona, mas com 2 bugs latentes | Crítica |
| 2 | Caixa — abrir / vender / fechar | ❌ Bloqueado pelo bug #1 | ⚠️ Tela ok (F2-F5 visíveis), fechamento **falha silenciosamente** | Crítica |
| 3 | OS → conversão em venda | **Não executado** (mesma raiz que #1) | Não executado | — |

Convenção do report: ✅ passou · ⚠️ passou mas com problemas · ❌ falhou.

---

## 🔴 Bug #1 — `prisma.$transaction` timeout no `saleService.create` (CRÍTICO)

**Sintoma observado**:
- Local: `POST /api/sales` retorna HTTP 500 com mensagem genérica `BUSINESS_RULE_VIOLATION` / "Erro de regra de negócio". Frontend cai no catch e mostra toast — **mas redireciona pra `/dashboard/vendas` assim mesmo** (ver bug #2).
- Produção: a venda **às vezes** passa (testada em 2s, latência baixa). Em horários de pico ou conexões lentas, mesmo timeout vai estourar.

**Causa raiz**:

Stack confirmado:
```
PrismaClientKnownRequestError P2028 — Transaction not found.
  at SaleService.create                            sale.service.ts:441
  at applyFinanceEntriesInTx                       sale-side-effects.service.ts:429
  at generateSaleEntries                           finance-entry.service.ts:227
  at tx.chartOfAccounts.findUnique                 finance-entry.service.ts:19
```

`generateSaleEntries` faz **6 a 12 queries sequenciais** dentro do `$transaction` (cada item → 1+ `chartOfAccounts.findUnique` + 1 `financeEntry.upsert`; cada pagamento → idem; mais débito/crédito de receita, desconto, estoque, CMV, taxa de cartão). Sob latência Neon de ~300-500ms por query, soma **estoura facilmente os 5s default** do `prisma.$transaction`. Quando estoura, a tx fica inválida e qualquer query subsequente lança P2028. O try/catch interno de `applyFinanceEntriesInTx` (sale-side-effects.service.ts:430) captura o erro mas a tx **já está morta** — o `prisma.$transaction()` outer re-lança ao tentar commitar.

**Resultado**: venda **NÃO persistida** (rollback completo), `CashShift` auto-criado **persistiu** (criado antes do `$transaction`). É exatamente o sintoma que o cliente "Óticas Atacadão" vai sentir como "vendi mas sumiu" ou "abriu caixa sozinho do nada".

**Evidência local** (POST direto via tsx):
```json
{"error":{"code":"BUSINESS_RULE_VIOLATION","message":"Erro de regra de negócio"}}
```
Stack real escondido pelo `error-handler.ts:158-166` (bug #3 abaixo).

**Fix proposto** (mínimo): aumentar timeout do `$transaction`. Em `sale.service.ts:441`:
```ts
await prisma.$transaction(async (tx) => { ... }, {
  maxWait:  5_000,
  timeout: 30_000, // dá margem confortável pra 12+ queries sob Neon
});
```

**Fix arquitetural** (correto): mover `applyFinanceEntriesInTx` para **fora** do `$transaction` (entries DRE são consequência, não obrigação atômica). Já existe try/catch que assume isso ("DRE precisa correção manual" — sale-side-effects.service.ts:441). Por que está dentro da tx é histórico.

---

## 🔴 Bug #2 — Frontend redireciona pra `/dashboard/vendas` mesmo quando POST /api/sales falha (CRÍTICO)

**Sintoma**:
- Bug #1 reproduzido no PDV local: API retornou 500, mas o operador é redirecionado pra `/dashboard/vendas` (ver `01-vendas-page-misleading-redirect.png`). Operador acredita que vendeu, sistema não gravou.

**Causa raiz**:
`src/app/(dashboard)/dashboard/pdv/page.tsx:602-605` faz `window.location.href = "/dashboard/vendas"` dentro de um `setTimeout` **separado do try/catch**. Mesmo se houvesse erro no catch, o setTimeout que dispara o redirect só não é cancelado por estado (`finalizingVenda`). Em produção esse redirect aconteceu em 2s e a venda **persistiu** (Bug #1 não disparou) — mas em qualquer falha futura o operador é induzido a achar que vendeu.

Reproduzi também no fluxo de fechamento de caixa em prod: cliquei "Fechar Caixa", a página recarregou exibindo "Caixa aberto" novamente (shift `cmplzt8ix0001syv48wkrk19s` continua OPEN com 1 movimento). Frontend não mostrou nenhum erro. Banco confirma que `closedAt` segue `null`.

**Fix proposto**: o `setTimeout(window.location.href, 1500)` da linha 603-605 deve ser executado **dentro do `try`**, depois de validar `res.ok && data.data?.id`. E nunca fazer `window.location.href` — usar `router.push` + `router.refresh` (já aplicado no modal de caixa via F1, mesma lógica vale aqui).

---

## 🟡 Bug #3 — `handleApiError` mascara erros Prisma como "Erro de regra de negócio" (ALTO)

`src/lib/error-handler.ts:158-166`: qualquer `PrismaClientKnownRequestError` que não seja P2002/P2025 cai em fallback genérico:

```ts
return NextResponse.json({
  error: {
    code: ERROR_CODES.BUSINESS_RULE_VIOLATION,
    message: "Erro de regra de negócio",  // mascarado!
  }
}, { status });
```

Resultado: o cliente NUNCA vê o motivo real do erro. Toda regressão Prisma (P2028 timeout, P2010 query, P2014 violação relacional, P2024 connection pool…) aparece como "regra de negócio".

**Fix proposto**:
```ts
return NextResponse.json({
  error: {
    code: error.code,                       // P2028, P2024, etc
    message: process.env.NODE_ENV === "development"
      ? `${error.code}: ${error.message}`
      : "Erro de banco de dados. Tente novamente.",
  }
}, { status });
```

Sem expor a stack em produção, mas devolvendo `error.code` consistente que aparece nos logs.

---

## 🟡 Bug #4 — PDV permite adicionar produto com estoque 0 sem aviso (MÉDIO)

Cliquei no produto SKU `01` (estoque 0) e ele foi adicionado ao carrinho normalmente. Pequeno texto "Estoque: 0" no card é a única indicação. Em produção a venda em si pode ser bloqueada na transação (ainda não confirmei se há check de estoque negativo no checkout), mas a UX permite ao operador chegar até o modal de pagamento.

**Sugestão**: card com `opacity-50 cursor-not-allowed` quando `stockQty === 0 && stockControlled`, ou toast de aviso ao clicar.

---

## 🟡 Bug #5 — Auto-abertura silenciosa de CashShift via venda no PDV (MÉDIO)

`sale.service.ts:354-380` cria um `CashShift` automaticamente se não houver turno OPEN — comportamento existente desde antes do F5 do refactor de caixa. F5.2/F5.3 hardening está **funcionando bem** (try/catch + log + auditoria + cashRegisterId auto-vinculado), confirmado via banco:

```
ActivityLog: DATA_UPDATED · Turno de caixa auto-aberto
detail: {kind:"cash_shift_auto_opened", triggeredBy:"sale.service.createSale", cashRegisterId:null}
```

Mas o operador **não é avisado** que isso aconteceu. Em prod, fiz 1 venda e do nada havia "Caixa aberto há 1h 0m" — operador pode achar que tem outro turno aberto em paralelo.

**Sugestão**: depois da auto-abertura, o frontend deveria mostrar toast "Caixa auto-aberto sem valor inicial. Confira em `/dashboard/caixa`." ou banner no PDV até o fim do dia.

---

## Bugs auxiliares observados

| # | Onde | O quê | Severidade |
|---|---|---|---|
| 6 | `pdv/page.tsx:544` | `console.log("Dados enviados para API:", JSON.stringify(saleData, null, 2))` em produção | Baixa |
| 7 | PDV modal pagamento | Input "Valor" recebe `19.899999618530273` ao clicar "Total" (float não arredondado). Persiste como `R$ 19,90` no banco, mas é UX horrível | Baixa |
| 8 | `CashShift.cashRegisterId` | Continua `null` em prod (a filial Pacajus não tem `CashRegister` cadastrado). F5.3 vincula automaticamente **se houver** terminal — não cria um se faltar | Baixa (decisão de domínio) |

---

## Screenshots

Os arquivos `prod-NN-*.png` mostram o smoke test em produção. Os caminhos `01-*` e `02-*` foram a tentativa local antes da reorganização do repo apagar a pasta de artifacts.

- `prod-01-login.png` — tela de login em prod
- `prod-02-after-login.png` — dashboard após login
- `prod-03-pdv.png` — PDV carregado com lista de produtos
- `prod-04-after-finalize.png` — redirect para `/dashboard/vendas` após finalizar (a venda **persistiu** desta vez)
- `prod-05-caixa.png` — tela de caixa renderizando F2-F4 (banner contextual, tabular-nums, separação informativo)
- `prod-06-fechamento-step1.png` — modal stepper F3, passo 1, pre-fill F1 (Dinheiro 119.90)
- `prod-07-fechamento-step3.png` — passo 3 do stepper
- `prod-08-after-close.png` — depois do click em "Fechar Caixa": **tela voltou pra "Caixa aberto"** (fechamento falhou silenciosamente — bug #2 repetiu aqui)

---

## Verificações no banco (read-only)

| Query | Resultado |
|---|---|
| `Sale` em qualquer empresa, últimos 15 min (após teste local) | **0** — confirmando rollback do bug #1 |
| `Sale` na Atacadão últimos 5 min (após teste prod) | **1** — venda R$ 119,90 ID `cmpm1x0uy0002aarw02ntfkf5` |
| `CashShift` OPEN da Pacajus após "fechamento" prod | **ainda OPEN**, `closedAt: null`, 1 movimento — confirmando bug #2 |
| `ActivityLog` últimos 15 min | F5.2 funcionou: `cash_shift_auto_opened` gravado pra cada turno auto-criado |

---

## Recomendação de prioridade

| Prioridade | Item | Esforço | Risco |
|---|---|---|---|
| **P0** | Bug #1 — `$transaction({ timeout: 30_000 })` em `sale.service.ts:441` e em `quote.convertToSale` | 1 linha | Baixíssimo |
| **P0** | Bug #2 — mover redirect do PDV pra dentro do try, remover `setTimeout(window.location.href)` | 30 min | Baixo |
| **P1** | Bug #3 — expor `error.code` real no `handleApiError` | 5 min | Nenhum |
| **P1** | Bug #1 (refactor) — mover `applyFinanceEntriesInTx` pra fora da tx, ou paralelizar `chartOfAccounts.findUnique` via `Promise.all` | 2-3 h | Médio (precisa validar idempotência) |
| **P2** | Bug #4, #5, #6, #7, #8 | 1h cada | Baixo |

P0 são suficientes pra **destravar vendas** e **parar de iludir o operador**. P1 e P2 podem entrar num PR único de hardening do checkout.

---

## Notas operacionais

- **Interferência externa**: durante o smoke local, o repo foi reorganizado em paralelo (3 commits `docs:` + movimentação de MDs antigos pra `docs/historico/`). Isso apagou a pasta `qa-artifacts/` original — recriada e parcialmente repopulada.
- **Dev server local + Neon**: a latência alta entre Mac → Neon US-East é o que faz o bug #1 reproduzir 100% local. Em prod (Vercel runtime US-East → Neon US-East) ele só dispara em horário de pico ou na cauda de latência. **Não é "só local"** — é uma bomba relógio em produção.
- **Auto-abertura de turno**: a Pacajus ganhou 1 turno OPEN durante este smoke (`cmplzt8ix0001syv48wkrk19s`, 25/05 23:05). Recomendo fechar manualmente via admin/UI ou usar `POST /api/admin/cash/close-stale-shifts` (endpoint criado no F5.4).
