# Auditoria Completa PDV ÓTICA — 2026-06-27

> **STATUS DE IMPLEMENTAÇÃO (Fase 1 — em andamento, NÃO deployada):**
> - ✅ Helper `requireAdminAndScope()` criado em `admin-session.ts` + 9 testes verdes.
> - ✅ `permissions/seed` agora exige SUPER_ADMIN do portal admin + clear/recreate em transação (era o crítico nº2). **Pós-deploy o seed roda logado como super admin, não pela ótica.**
> - ✅ `reset-password` com escopo + senha CSPRNG 10 chars (crítico nº3).
> - ✅ Segredo de admin separado `ADMIN_JWT_SECRET` (fallback p/ AUTH_SECRET; login+proxy alinhados).
> - ✅ ~15 rotas admin com `requireCompanyScope`/`getAccessibleCompanyIds` (SEC-1..16).
> - ✅ 6 IDORs cross-tenant da ótica corrigidos (inventory/lots, markCommissionAsPaid, reminders, cashback/customer, permissions/reset, lens-treatments).
> - ✅ **Fase 2 (fraude):** finance/entries exige financial.manage + amount>0; stock-movements com trilha de auditoria (logActivity); suppliers/import com role ADMIN/GERENTE + match só por CNPJ; cashback reaplica limites no débito; imports com cap 5MB.
> - ✅ **Fase 3 (deps + rede):** TENANT_GUARD default `throw` em dev (prod segue warn); xlsx migrado p/ exceljs nos 3 imports (CVE resolvida; helper `xlsx-read.ts`); 14 testes de isolamento cross-tenant; **+1 furo achado e corrigido: reminders/[id] retornava 500 em vez de 404 cross-tenant** (`notFoundError`). Middleware `/admin/*` JÁ existe (proxy.ts = convenção Next 16).
> - ✅ tsc 0 erros. ~1500 testes verdes. **Aguardando aprovação do dono + Fase 0 manual (rotacionar segredos) antes de deploy.**


Auditoria crítica de 5 camadas em paralelo (super admin, ótica/dinheiro, frontend, dados, transversal). Read-only. Cada achado foi verificado lendo o código. Severidade: 🔴 CRÍTICO · 🟠 ALTO · 🟡 MÉDIO · 🟢 BAIXO.

> **Estado geral:** base madura e bem defendida (locks FOR UPDATE, idempotência, reversões net-based, fail-closed em webhooks/cron). Os riscos reais se concentram em: (1) **escopo de admin** aplicado de forma inconsistente, (2) **2 escritas cross-tenant** na ótica, (3) **dívida de comissão** (3 cálculos + ledger), (4) **toast quebrado** no frontend, (5) **falta de rede de segurança** multi-tenant (guard em warn + zero testes).

---

## 🔴 CRÍTICOS (segurança / corrupção de dados)

### Escopo de admin (cross-tenant takeover)
- **SEC-1.** `permissions/seed/route.ts:219` — usa `requireRole(["ADMIN"])` **de tenant**, não de admin. Qualquer dono de ótica dispara `rolePermission.deleteMany()` GLOBAL → quebra permissões de todos os tenants. **Fix:** `getAdminSession()` + `SUPER_ADMIN`, dentro de transação.
- **SEC-2.** `admin/companies/[id]/users/[userId]/reset-password/route.ts:20` — sem `requireCompanyScope`. Admin escopado/SUPPORT reseta senha de qualquer ótica e recebe a temp em texto. **Account takeover.**
- **SEC-3.** `admin/companies/[id]/users/[userId]/route.ts:16,63,162` (GET/PATCH/DELETE) — sem escopo. PATCH muda role/email/active; DELETE soft-delete.
- **SEC-4.** `admin/companies/[id]/users/[userId]/permissions/route.ts:16,116,223` — sem escopo; PUT muda role cross-tenant.
- **SEC-5.** `admin/companies/[id]/users/route.ts:18,96` — lista/cria usuário em qualquer empresa.
- **SEC-6.** `admin/companies/[id]/branches/route.ts:12,43` + `branches/[branchId]/route.ts:12` — cria/desativa filial de qualquer empresa.
- **SEC-7.** `admin/impersonate/[id]/route.ts:23` (DELETE) — encerra impersonação de qualquer admin (sem `adminUserId === admin.id`).

### Escritas cross-tenant na ótica
- **TEN-1.** `inventory/lots/route.ts:102` — `product.update` com `productId` cru do body, sem `findFirst({id, companyId})`. Ótica A sobrescreve costPrice de produto da ótica B. **Fix:** ownership guard antes da tx.
- **TEN-2.** `goals/commissions/[id]/route.ts:28` → `goals.service.ts:444` — `markCommissionAsPaid(id)` sem escopo; em modo legacy (toda ótica menos Atacadão) marca comissão alheia como paga.

### Frontend
- **FE-1.** **Toast quebrado** (verificado): root layout monta só o `<Toaster/>` do shadcn; **76 arquivos usam `react-hot-toast` + 14 usam `sonner`, sem provider montado** → feedback de sucesso/erro provavelmente não aparece em grande parte do app.

---

## 🟠 ALTOS

### Escopo de admin (faltando, menos grave que os críticos)
- **SEC-8.** `admin/clientes/[id]/route.ts:17` (PATCH dados da empresa) — sem escopo.
- **SEC-9.** `admin/clientes/[id]/actions/route.ts:18` — block/cancel/change_plan sem escopo (só `delete` tem role guard).
- **SEC-10.** `admin/faturas/[id]/workflow/route.ts:9` — `mark_paid` reativa subscription, sem role nem escopo.
- **SEC-11.** `admin/faturas/create/route.ts:9` — cria fatura para qualquer subscription.
- **SEC-12.** `admin/company-users/[id]/route.ts:17` + `company-users/route.ts:11` — ativa/desativa user + lista usuários de todas as empresas sem filtro de escopo.
- **SEC-13.** `admin/whatsapp-config/route.ts:26` (PUT) e `admin/ai-config/route.ts:23` (PUT, grava API key Anthropic) — sem role guard; SUPPORT/BILLING podem alterar.
- **SEC-14.** `admin/health-score/route.ts:13` — recalc batch caro + sem escopo no single.
- **SEC-15.** `admin/clientes/[id]/{notes,onboarding,tags}` — sem escopo (vários handlers).
- **SEC-16.** Export CSV de clientes sem `getAccessibleCompanyIds` → exfiltração da base toda.

### Dinheiro
- **MON-1.** **Comissão: 3 cálculos divergentes.** Engine novo (decimal, tiers retroativos, líquido) × writer/report legado (flat 5% float) × tela de Metas (5%+2% float). Ex.: R$900 vs R$700 vs R$500 pra mesma venda. Read da tela de Metas **não é gateado** pelo kill-switch.
- **MON-2.** **COMMISSION_EXPENSE nunca entra no ledger** → linha de Comissões do DRE sempre R$0 (lucro superestimado). Confirma dívida do Bloco 4.
- **MON-3.** `sales/route.ts:168` — idempotência não-atômica; duplo-POST simultâneo cria 2 vendas/2 cobranças. Defesa real só no front (`submitLockRef`).
- **MON-4.** `cashback.service` — `maxUsagePercent`/`minPurchaseMultiplier` validados só no preview, **não reaplicados no débito** (`applyCashbackUsageInTx`). POST direto resgata 100% do total.
- **MON-5.** `sale-side-effects.service.ts:622` — venda commita mesmo se `generateSaleEntries` falhar (try/catch sem re-throw). Mitigado por fila de retry, mas sem alerta.

### Transversal
- **CROSS-1.** `prisma-tenant-guard.ts:75` — guard roda em **`warn` (não bloqueia)** em prod. `TENANT_GUARD_MODE` não setado. Único backstop automático só loga.
- **CROSS-2.** **Zero testes de isolamento cross-tenant.** Maior superfície de risco sem defesa testada.
- **CROSS-3.** `sale.service.ts` (refund/create), `cash.service.closeShift`, `auth.ts` (authorize/callbacks) — sem teste direto.

### Frontend
- **FE-2.** Validação de formulário client-side: react-hook-form+zod em **1 de 84 páginas**; resto é `useState` cru. Risco de POST inválido.
- **FE-3.** 29 arquivos com `window.confirm()` nativo (incl. admin deletar empresa/cancelar assinatura) vs 7 com `AlertDialog`.
- **FE-4.** Loading/erro: quase nenhuma tela tem skeleton ou ErrorState com retry; padrão é spinner + toast (que pode nem aparecer → FE-1).
- **FE-5.** `modal-imprimir-movimentacao.tsx:50` — carrega `cdn.tailwindcss.com` em runtime + innerHTML (anti-padrão que `cash-print.ts` já resolveu).

### Dados
- **DATA-1.** `DunningEvent` sem nenhum índice (full scan). `UserBranch.branchId` sem índice. `Commission` sem índice `[companyId,userId,period]`.
- **DATA-2.** `Subscription` sem unique parcial de "ativa por empresa" → race do Asaas cria duplicata.

---

## 🟡 MÉDIOS

- **MON-6.** Dois DREs vivos (ledger × Sale.total) divergem em devolução parcial; ambos omitem comissão.
- **MON-7.** AR receive (PATCH) cria CashMovement mas não FinanceEntry (assimetria com o estorno); single-receive sem `FOR UPDATE` (caixa-fantasma por duplo-clique).
- **MON-8.** Devolução em dinheiro não reverte caixa se não houver turno aberto. `refundMethod` gravado mas não dirige o movimento.
- **MON-9.** Quote→sale valida estoque contra cache global, não BranchStock (over/under-sell).
- **DATA-3.** `ConsentRecord`/`CustomerAccessLog`/`SaleIdempotency`/`WhatsappMessage` têm `companyId` String sem FK para Company (LGPD: órfãos).
- **DATA-4.** `CardReceivable` sem índice composto p/ conciliação; `InventoryLot.supplierId` sem índice.
- **CROSS-4.** PII em log: `auth.ts:136,164,275` + `auth-helpers.ts:129` logam email via `console.*` cru. 8 `console.*` server-side fora do logger.
- **CROSS-5.** 63 rotas admin usam `NextResponse.json({error})` em vez de `handleApiError` (perde errorId/Sentry).
- **CROSS-6.** Webhook Focus-NFe sem teste de assinatura (único sem `route.test.ts`).
- **FE-6.** Guards de UI duplicados (`Can` por role × `PermissionGuard` por code). Sem `middleware.ts`.
- **FE-7.** Formatação: 3 caminhos de moeda (`formatCurrency`, `brl` órfão, inline). Admin formata inline.
- **FE-8.** 19 componentes >800 linhas (limite da própria regra); lógica de dinheiro inline em páginas.

---

## 🟢 BAIXOS
- Senha temp com prefixo previsível `Otica@`+4 chars. Rate-limit in-memory (serverless). Índices faltando em FKs de baixo volume (LoyaltyPoints.saleId, WarrantyClaim, StockTransferItem.productId). `Sale.number` Int (overflow em ~2bi). `admin/layout.tsx` sem guard (defesa-em-profundidade; páginas já guardam).

---

## O que está SÓLIDO (não mexer)
Cobrança/pagamento (decimal.js, under/overpayment rejeitados), devolução total (estoque+FIFO+ledger+cashback+OS+campanha), caixa negativo ao pagar conta (FOR UPDATE + flip atômico — bug histórico corrigido), sangria>saldo travada, fechamento de caixa sob lock, cashback double-spend (updateMany atômico), ~90 rotas de ótica corretamente escopadas, crons fail-closed, webhooks com HMAC, `handleApiError` com errorId+Sentry, logger estruturado (124 arquivos), defesa de timing no login.

---

# 🥷 PENTEST ADVERSÁRIO (2026-06-27) — 4 agentes atacantes

Mentalidade de invasor: roubar/corromper dados de outras óticas, virar admin, fraudar dinheiro. Read-only (provas no código). **Limpo:** SQL injection (tudo parametrizado), SSRF (URLs pinadas em env), secrets hardcoded (nenhum), webhooks Asaas/Evolution/Focus (HMAC fail-closed — pagamento NÃO forjável), prompt-injection (fencing com nonce). Os furos reais:

## 🔴 NOVOS CRÍTICOS (verificados por mim)

### Segredos / sessão
- **PEN-SEC-1.** `.env` local aponta para **Neon de PRODUÇÃO** + `NEXTAUTH_SECRET` real. (✓ não está no git, mas é credencial de prod em máquina de dev.) **Ação: rotacionar `NEXTAUTH_SECRET` + senha do DATABASE_URL; usar banco de dev local.**
- **PEN-SEC-2.** Admin e tenant assinam JWT com o **mesmo segredo** (`admin-session.ts:16` = `auth/login/route.ts:16` = `AUTH_SECRET || NEXTAUTH_SECRET`). Sem `ADMIN_JWT_SECRET`. Quem tiver o segredo forja cookie `{isAdmin:true, role:SUPER_ADMIN}`. **Ação: segredo de admin separado.**
- **PEN-SEC-3.** JWT admin sem revalidação no banco (janela de 8h após desativar admin). Tenant revalida a cada 5min; admin não.

### IDOR cross-tenant novos (verificados)
- **PEN-IDOR-1.** `reminders/[id]/route.ts` (PUT/POST) → `reminder.service.ts:433` — sem `getCompanyId`/escopo. Qualquer usuário de qualquer ótica silencia/edita lembrete alheio.
- **PEN-IDOR-2.** `cashback/customer/[customerId]/route.ts:51` (POST ajuste) — `customerId` não validado contra o tenant → ajusta saldo de cashback de cliente de outra ótica.
- **PEN-IDOR-3 / 4.** Confirmados `inventory/lots:102` (sobrescreve costPrice alheio) e `goals/commissions markAsPaid:444` (paga comissão alheia / própria).
- **PEN-IDOR-5.** `users/[id]/permissions/reset/route.ts` — reset de permissões sem checar `companyId` do alvo.
- **PEN-IDOR-6.** `lens-treatments/[id]:107` — `update({where:{id}})` sem companyId (findFirst antes, mas update bare).

### Fraude financeira (verificados)
- **PEN-FRAUD-1.** `finance/entries/route.ts:9` — POST no ledger só com `requireAuth()`, **sem `requirePermission("finance.manage")`**. VENDEDOR/CAIXA fabrica despesa/some receita + decrementa `FinanceAccount.balance` real. **Verificado por mim.**
- **PEN-FRAUD-2.** `stock-movements/route.ts:67` — `PURCHASE`/`ADJUSTMENT` credita estoque na hora sem threshold/aprovação/nota → esconde furto físico (estoque-fantasma). Mesma perm do fluxo aprovado.
- **PEN-FRAUD-3.** `stock-adjustment.service.ts` — auto-aprova ≤R$500 (fatiável) e `approve()` não checa `approvedBy !== createdBy` (sem separação de funções).
- **PEN-FRAUD-4.** `suppliers/import/route.ts:13` — só `getCompanyId()` (sem role), e faz match por **nome OU cnpj** → qualquer cargo importa/sobrescreve fornecedor. (`customers/import` exige ADMIN.) **Verificado.**

## 🟠 NOVOS ALTOS
- **PEN-DEP-1.** `xlsx@^0.18.5` — CVE-2023-30533 (prototype pollution) + CVE-2024-22363 (ReDoS), corrigidos só em 0.20.2+ (CDN SheetJS, não npm). Disparável por todo route de import. **Verificado.**
- **PEN-UP-1.** Imports (customers/products/suppliers/reconciliation) sem limite de tamanho de arquivo → OOM/zip-bomb.
- **PEN-UP-2.** `company/logo/route.ts:31` confia no MIME do cliente, sem magic bytes, salva data-URL → stored-XSS via SVG/polyglot.
- **PEN-COST-1.** `conversation-qualifier.service.ts` — texto de WhatsApp sem cap de tamanho no prompt do Sonnet → abuso de custo de token por estranho.
- **PEN-LEDGER-1.** Sangria/suprimento (`cash.service:210`) e recebimento de AR não lançam FinanceEntry → dinheiro sai/entra invisível à DRE (assimetria com o estorno que lança).

## Ranking dos ataques mais perigosos (consolidado dos 4)
1. **Forjar JWT admin com segredo de prod** (PEN-SEC-1+2) → SUPER_ADMIN instantâneo
2. **`permissions/seed` por dono de ótica** (SEC-1) → wipe global de permissões
3. **reset-password cross-tenant** (SEC-2) → takeover de qualquer ótica em 2 requests
4. **FinanceEntry/stock-movement por baixo privilégio** (PEN-FRAUD-1/2) → fraude contábil + esconder furto
5. **IDORs de reminder/cashback/commission/inventory** → corromper dados de concorrentes
