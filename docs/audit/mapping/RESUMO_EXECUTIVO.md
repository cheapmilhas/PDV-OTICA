# Resumo Executivo — Mapeamento PDV Ótica

> Saída de mapeamento estático e somente-leitura. 19 relatórios totalizando ~4.950 linhas de análise. **Nenhum arquivo do projeto fora de `/docs/audit/mapping/` foi modificado.**

## Tamanho do sistema

| Métrica | Valor |
|---|---|
| LOC em `src/` (ts/tsx) | **129.627** linhas |
| Arquivos `.ts`/`.tsx` | 657 |
| Pages (App Router) | 105 |
| API Routes | 254 |
| Layouts | 7 |
| Server Actions dedicadas (`"use server"`) | 0 (tudo via API) |
| Models Prisma | 130 |
| Enums Prisma | 75 |
| Migrations | 5 |
| Schema (linhas) | 3.820 |
| Services em `src/services/` | 33 |
| Utils em `src/lib/` | 38 |
| Components customizados | ~139 |
| Strings de permissão (catálogo) | 53 |
| Strings de permissão usadas em código | 76 (mistura permissões + system rules) |

## Stack
- Next.js 16, React 19, TypeScript 5.9
- Prisma 5.22 + PostgreSQL (Neon)
- NextAuth v5 BETA + JWT custom paralelo (admin via `jose`)
- Tailwind 3 + shadcn/ui + Radix
- Zod, React Hook Form (parcial), Sonner + react-hot-toast (coexistem)
- @anthropic-ai/sdk (OCR de prescrição), @supabase/supabase-js (storage de imagens)

## Top 10 áreas mais complexas

| # | Área | Por quê |
|---|---|---|
| 1 | `services/sale.service.ts` (1205 LOC) | God service tocando 14 modelos em uma transação |
| 2 | `services/quote.service.ts` (929 LOC) | Espelha sale.service mas com gaps |
| 3 | `services/service-order.service.ts` (787 LOC) | Fluxo de status, lab, prescrição |
| 4 | `services/finance-entry.service.ts` (735 LOC) | Lançamentos contábeis (DRE) |
| 5 | `services/cashback.service.ts` (621 LOC) | Acúmulo + redenção + expiração |
| 6 | Reconciliação bancária (8 routes + services) | Match automático + manual |
| 7 | Multi-tenancy (companyId + branchId + Network sharing) | Camadas + impersonation + redes |
| 8 | Sistema de permissões (Permission/RolePermission/UserPermission + custom overrides) | DB + enum TS + hooks duplicados |
| 9 | App Router com 22 subdiretorios em `(dashboard)/dashboard/*` | Vários domínios coexistindo |
| 10 | Schema Prisma 3.820 linhas / 130 models | Cobertura ampla mas com inconsistências |

## Top 10 pontos de atenção (com classificação)

1. 🔴 **`quote.convertToSale` cria venda incompleta** — sem AccountReceivable, CardReceivable, FinanceEntry, Cashback ganho. **Bloqueante para uso real.** (`services/quote.service.ts:735`)
2. 🔴 **`sales/[id]/refund` não atualiza `BranchStock`** — só atualiza cache `Product.stockQty`. Estoque por filial dessincroniza. (`refund/route.ts:122-129`)
3. 🔴 **`UserRole` enum TS ≠ Prisma** — `MANAGER` (TS) vs `GERENTE` (DB), `STOCK_MANAGER` não existe no DB, `ATENDENTE` sem mapping em TS. `permissions.ts` é armadilha de pegadinha. (`lib/permissions.ts:93`)
4. 🔴 **`validateCreditLimit` é stub** que sempre aprova STORE_CREDIT. Sale.service usa achando que valida limite de cliente devedor. (`lib/installment-utils.ts:72`)
5. 🔴 **`/api/sales/[id]/refund` não usa `requirePermission`** — qualquer logado devolve venda. (`refund/route.ts:8-19`)
6. 🔴 **`Customer.acceptsMarketing` default `true`** viola opt-in LGPD. (`schema.prisma:385`)
7. 🔴 **`console.log` com email do user em produção** em 6+ pontos de auth. (`src/auth.ts:76, 84, 98, 126, 142, 150`)
8. 🟠 **17 routes recebem `branchId` no body sem `validateBranchOwnership`** — possível cross-branch dentro da mesma empresa.
9. 🟠 **Backend confia em `total`/`subtotal` enviados pelo frontend** — sem recálculo defensivo (rel. 07 H17). Manipulação de preço explorável.
10. 🟠 **Race conditions** em: abertura de caixa (sem partial unique), geração de RecurringExpense (check fora tx), aprovação de StockTransfer (check fora tx).

## Áreas "verdes" (estáveis)

- ✅ **`atomicStockDebit`** — race-safe via `UPDATE WHERE quantity >= solicitado` no Postgres
- ✅ **`sale.create`** (caminho principal) — transação completa, atomic, integra estoque/caixa/comissão/cashback/finance corretamente
- ✅ **`sale.cancel`** — reverte tudo simetricamente (BranchStock + Product + AccountReceivable + Commission + FinanceEntry + FinanceAccount + Cashback)
- ✅ **`Quote.convertedToSaleId @unique`** — impede dupla conversão a nível DB
- ✅ **`FinanceEntry @@unique([companyId, sourceType, sourceId, type, side])`** — idempotência forte para DRE
- ✅ **Impersonation completa** — JWT NextAuth válido + ImpersonationSession + GlobalAudit + IP/UA + 2h expiry
- ✅ **`date-utils.ts`** — completo com timezone São Paulo e bug-aware
- ✅ **`payment-methods.ts`** — fonte única de verdade para 10 métodos
- ✅ **`AuditLog` middleware** — automático para 11 modelos críticos
- ✅ **Upload de prescrição** — whitelist + tamanho + path com companyId
- ✅ **`(dashboard)/layout.tsx`** — `auth()` + `checkSubscription()` server-side

## Áreas "vermelhas" (frágeis)

- 🔴 **`quote.service.convertToSale`** — divergência grave de `sale.create`
- 🔴 **`refund/route.ts`** — divergência grave de `sale.cancel`
- 🔴 **Sistema de permissões** — TS enum desincronizado do DB enum, hooks duplicados, `hasPermission` armadilha
- 🟠 **`cash.openShift`** — race condition possível
- 🟠 **`/api/admin/seed`** — reseta admin/admin123 em produção se chamado
- 🟠 **LGPD** — não conforme (consent, anonimização, audit de prescrição)
- 🟠 **Adoção parcial de `date-utils`** — alguns dashboards usam `new Date` direto
- 🟠 **Rate limiting** apenas em 3 routes (login, OCR, exports todos sem)

## Achados críticos por categoria

| Categoria | 🔴 | 🟠 | 🟡 | 🔵 | ⚪ |
|---|---|---|---|---|---|
| Multi-tenant / branch | 1 | 4 | 4 | 0 | 3 |
| Transações / atomicidade | 4 | 4 | 1 | 0 | 1 |
| Idempotência | 0 | 6 | 0 | 0 | 1 |
| Monetário | 1 | 2 | 5 | 0 | 1 |
| Datas/Timezone | 0 | 4 | 1 | 0 | 0 |
| Permissões / Auth | 5 | 4 | 4 | 0 | 0 |
| LGPD / Segurança | 5 | 11 | 6 | 0 | 1 |
| Estoque | 2 | 1 | 1 | 1 | 3 |
| Performance | 0 | 1 | 2 | 0 | 1 |
| UI / Mobile | 0 | 0 | 5 | 0 | 4 |
| **Total identificado** | **19** | **23** | **28** | **8** | **10** |

(Dos 88 achados consolidados no rel. 14)

## Red flags para investigação imediata

1. 🚩 **Conversão de orçamento → venda gera venda incompleta financeiramente.** Reproduzir em runtime: criar quote APPROVED com STORE_CREDIT, converter, observar ausência de AccountReceivable.
2. 🚩 **Refund deixa BranchStock dessincronizado.** Reproduzir: vender produto da filial B; devolver; comparar `BranchStock.quantity` antes/depois (não muda).
3. 🚩 **Manipulação de `total` no body do POST `/api/sales`.** Testar em runtime: enviar `total: 0.01`, verificar se foi gravado.
4. 🚩 **`validateCreditLimit` aprova qualquer STORE_CREDIT** independente do saldo do cliente. Cliente com R$ 100 mil devidos pode comprar mais R$ 50 mil a prazo sem impedimento.
5. 🚩 **`UserRole` desincronizado** — qualquer feature que dependa de `permissions.ts:hasPermission()` está silenciosamente quebrada para todos os roles ≠ ADMIN.

## 3 fluxos críticos que MAIS precisam de teste em runtime na próxima fase

1. **Conversão Orçamento → Venda com pagamento STORE_CREDIT** — confirmar que NÃO cria parcelas (e validar todos os outros side effects ausentes)
2. **Devolução parcial multi-filial** — vender produto da filial B, devolver da filial A, verificar BranchStock e Product.stockQty
3. **Concorrência de `cash.openShift`** — disparar 2 POST simultâneos, verificar se 2 turnos OPEN são criados na mesma filial

## Cobertura

| Área | % mapeado com confiança |
|---|---|
| Arquitetura geral | ~95% |
| Schema Prisma | ~85% (lidos os models críticos; alguns triviais por amostragem) |
| Rotas/Pages | ~95% (cruzamento permissão × ProtectedRoute completo) |
| API Routes | ~70% (255 routes — todas tabuladas; ~25 lidas em detalhe completo) |
| Services | ~60% (sale, quote, cash, stock lidos; reconciliation/finance-entry/cashback lidos parcialmente) |
| Permissões/Auth | ~90% |
| Multi-tenant | ~80% (Network sharing INCERTO) |
| Estoque | ~85% |
| Financeiro/Caixa | ~80% |
| LGPD/Segurança | ~85% |
| UI/Componentes | ~50% (bottom-up — só componentes-chave lidos) |
| Performance | ~50% (sem profile real) |

### Zonas obscuras (NÃO TESTADAS)

- `Network.sharedCatalog` implementação real — risco de vazamento entre empresas em rede
- `getNextNumber` (Counter) atomicidade
- `/api/sales/[id]/reactivate` comportamento
- `StockReservation` uso real (modelo existe)
- `SystemRule.stock.*` consultadas em runtime?
- Prints (`/components/print/*`)
- Branch context (front muda branchId — backend honra?)
- `Lab.apiKey` integration real
- Botões críticos com `disabled` durante mutação
- Performance real de relatórios (sem benchmark)

## Tempo aproximado de mapeamento

~3-4 horas de análise estática + escrita. Aproximadamente 4.950 linhas de saída em 19 documentos.

---

## Lista dos 19 arquivos gerados

| # | Arquivo | Tamanho |
|---|---|---|
| 01 | `01_arquitetura_geral.md` | ~230 linhas |
| 02 | `02_rotas_e_paginas.md` | ~225 linhas |
| 03 | `03_apis_e_server_actions.md` | ~415 linhas |
| 04 | `04_schema_prisma.md` | ~395 linhas |
| 05 | `05_permissoes_e_auth.md` | ~265 linhas |
| 06 | `06_multitenant_e_branch.md` | ~205 linhas |
| 07 | `07_fluxo_vendas_orcamentos_os.md` | ~260 linhas |
| 08 | `08_fluxo_financeiro_caixa.md` | ~265 linhas |
| 09 | `09_estoque_multifilial.md` | ~190 linhas |
| 10 | `10_cadastros.md` | ~190 linhas |
| 11 | `11_relatorios_dashboards.md` | ~175 linhas |
| 12 | `12_componentes_ui_chave.md` | ~165 linhas |
| 13 | `13_libs_e_utils.md` | ~190 linhas |
| 14 | `14_inconsistencias_e_pontos_de_atencao.md` | ~205 linhas |
| 15 | `15_seguranca_e_lgpd.md` | ~290 linhas |
| 16 | `16_mapa_de_dependencias.md` | ~245 linhas |
| 17 | `17_analises_criticas_transversais.md` | ~245 linhas |
| 18 | `18_prontidao_producao.md` | ~265 linhas |
| 19 | `RESUMO_EXECUTIVO.md` | este |
| **Total** | | **~4.950 linhas** |
