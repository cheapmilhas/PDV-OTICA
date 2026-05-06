# 18 — Prontidão Produção

## 1. Build

| Item | Status |
|---|---|
| `next.config.ts` `ignoreBuildErrors` | ❌ não configurado (✅ build erra ao detectar problema) |
| `next.config.ts` `ignoreDuringBuilds` (eslint) | ❌ não configurado (✅) |
| TypeScript erros | ⚪ NÃO TESTADO (`tsc --noEmit` não foi rodado por escopo de leitura — está na lista PERMITIDA mas optei por não rodar para manter mapeamento estático) |
| Build via `npm run build` | ⚪ NÃO TESTADO |

🟢 Configuração rigorosa por padrão.

## 2. Environment

### ENVs em uso (rel. 01 §5)
**Em `.env.example`:**
- `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `VERCEL_URL`

**No código mas NÃO em `.env.example`:**
- `AUTH_SECRET` (fallback de NEXTAUTH_SECRET)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- 🟠 `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (`@anthropic-ai/sdk` instalado mas grep não pegou — pode estar via SDK helper)

### Secrets hardcoded?
✅ **Nenhum encontrado** em grep básico (`sk-`, `api_key`, `password=`).

🟠 `/api/admin/seed` cria admin com senha `admin123` e o reseta — isto é "secret operacional" no código (linha 22 do route).

### Validação de ENVs no startup
- `src/middleware.ts:10`: `if (!authSecret) throw new Error("AUTH_SECRET environment variable is required")` ✅
- `src/lib/admin-session.ts:6`: idem ✅
- 🟠 Outros ENVs (Supabase, Anthropic) — falha tardia em runtime (quando a função é chamada)

## 3. Migrations

| Item | Status |
|---|---|
| Total migrations | **5** (rel. 01 §6) |
| Schema | 3.820 linhas, 130 models |
| Drift potencial | 🟠 schema muito maior que migrations sugerem |
| Migration mais recente | `20260331_add_impersonation_audit` |
| Migrações pendentes? | ⚪ NÃO TESTADO (`npx prisma migrate diff` está PERMITIDO mas não foi rodado) |

🟠 **Recomendação para próxima fase:** rodar `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma` para detectar drift.

## 4. Seed / Test data

### Seeds presentes
- `prisma/seed.ts` (configurado em `package.json:21`: `node --require esbuild-register prisma/seed.ts`)
- `prisma/seed-mock.ts` (`npm run seed:mock`)
- `prisma/seeds/index.ts` (`npm run seed:permissions`)
- `prisma/seed-plans.ts` (`npm run db:seed:plans`)
- `/api/admin/seed` (route — reseta admin/admin123 + cria planos + ativa empresa) 🟠
- `/api/permissions/seed` (route — popula permissões padrão) — restrito a ADMIN ✅

⚪ INCERTO se `prisma/seed.ts` (default) é rodado em CI/deploy. Risco: dados de teste em produção.

### Dados de exemplo no código
- `/api/customers/template` — gera `joao.silva@email.com` e CPF de exemplo no Excel template (✅ óbvio que é exemplo)
- `/api/products/template` — produto "Óculos de Sol Exemplo"
- 🟢 Templates são para download, não populam o banco

### Risco
🟠 `/api/admin/seed` na route — se acessível em produção (admin invadido), reseta senha. Não há ENV gate.

## 5. Segurança (resumo do rel. 15)

✅ **Bom:**
- Headers básicos (X-Frame-Options, nosniff, Referrer, Permissions)
- bcrypt para senhas
- Cookie HttpOnly + SameSite Lax
- Audit middleware ativo
- Upload validado (tipo + tamanho)
- Impersonation com audit completo

🟠 **Crítico:**
- Sem CSP / HSTS
- `console.log` com email/role em produção
- `Prescription` fora do AuditLog
- Sem rate limit em login, OCR, exports
- `AuditLog.userId` sempre null
- 17 routes recebem branchId no body sem validar ownership

🔴 **Bloqueante para LGPD:**
- `acceptsMarketing` default true
- Sem consent/anonymization
- Sem audit em prescrição

## 6. Logs e monitoramento

| Item | Status |
|---|---|
| `console.log` em código de produção | **308 ocorrências** (rel. 14) — vão direto pro Vercel logs |
| Logger estruturado (winston, pino) | ❌ NÃO encontrado |
| Sentry / error tracking | ❌ NÃO encontrado em deps |
| Vercel logs nativos | ✅ por default |
| `ActivityLog` model | ✅ existe (provavelmente uso em CRM/onboarding) |
| `AuditLog` automático | ✅ ativo via Prisma middleware |
| `GlobalAudit` (admin actions) | ✅ usado em impersonation |

🟠 **Falta visibility de erros em produção.** Sentry ou similar é o gap.

## 7. Backups

| Item | Status |
|---|---|
| Estratégia de backup do Neon | ⚪ NÃO DOCUMENTADO no repositório |
| `directUrl` em datasource | ✅ presente (suporta connection pooling) |
| Plano de recovery | ⚪ NÃO DOCUMENTADO |
| Backup de Supabase storage (imagens prescrição) | ⚪ NÃO DOCUMENTADO |
| Snapshot strategy | ⚪ |

🟠 Neon tem backup automático mas **point-in-time recovery** depende do plano. Para uma ótica que perde 1 dia de vendas, é problema sério.

## 8. Performance

### Queries N+1 detectadas (rel. 11)
- `/api/reports/sales-evolution` — 1 query por mês × N meses
- ⚪ Outros relatórios — não auditados

### Páginas potencialmente lentas
- `/dashboard/financeiro/bi` — BI complexo
- `/dashboard/relatorios/dre` — agregação contábil
- `/dashboard/pdv` — busca produtos + clientes em real-time
- `/dashboard/financeiro/lancamentos` — pode ter milhares de FinanceEntry

### Imagens otimizadas?
- `<Image>` configurado para `localhost` apenas (rel. 01 A4) 🟡
- `mainImage` e `images String[]` em Product — provavelmente Supabase URL
- Logos como base64 no banco (rel. 15) 🟡

### Indexes (visto no schema)
✅ Vários `@@index([companyId, ...])` — boa cobertura para multi-tenant. Mas relatórios complexos podem precisar de indexes específicos.

## 9. Mobile

✅ **Bem trabalhado** (rel. 12 §3.5):
- `MobileNav` (bottom navigation)
- `mobile-sidebar.tsx` (Sheet drawer)
- Breakpoints `md:` consistentes
- Layout responsivo no `(dashboard)/layout.tsx`

⚪ **Não testado em runtime:**
- PDV em mobile (tela complexa com checkout)
- Tabelas com muitas colunas (vendas, OS, financeiro)
- Modal de finalizar venda em iPhone SE

## 10. LGPD (resumo do rel. 15)

🔴 **Não conforme** para uso comercial sem ajustes:
- `acceptsMarketing` opt-in violado
- Sem consent/anonymization
- Prescrição (dado de saúde) sem audit
- Sem fluxo de "exportar/eliminar dados do titular"
- Permissão de prescrição grosseira

## 11. Operação real — o que IMPEDE uma ótica usar hoje

### 🔴 Bloqueantes (precisam fix antes de produção)

| # | Item | Impacto |
|---|---|---|
| B1 | `quote.convertToSale` não cria AccountReceivable/CardReceivable/FinanceEntry/Cashback (rel. 07 H1) | Conversão de orçamento gera venda **financeiramente quebrada** — DRE, contas a receber, recebíveis de cartão e cashback errados |
| B2 | `quote.convertToSale` e `refund` não atualizam `BranchStock` (rel. 07 H2/H3) | Estoque por filial **dessincroniza** ao longo do tempo |
| B3 | `validateCreditLimit` é stub — sempre aprova STORE_CREDIT (rel. 13 N2) | Sem proteção contra cliente devedor — perda financeira |
| B4 | Refund sem `requirePermission` (rel. 03 C2) | Qualquer logado devolve venda |
| B5 | `console.log` com email do user (rel. 01 A3) | LGPD + ruído em logs Vercel |
| B6 | `acceptsMarketing` default true (rel. 14 #14) | LGPD ANPD pode multar |
| B7 | Duas páginas críticas sem ProtectedRoute: `/dashboard/caixa`, `/dashboard/ordens-servico*` (rel. 02 §4) | Vendedor pode ver/operar caixa de outro |

### 🟠 Sérios (precisam fix em curto prazo)

- Race conditions em CashShift open, RecurringExpense generate, StockTransfer
- Auditoria de prescrição inexistente
- Sem rate limit em login (vulnerável a credential stuffing)
- Sem CSP / HSTS
- `/api/admin/seed` com reset de senha em produção
- Backend confia em `total` enviado pelo front (manipulação preço)
- AccountReceivable/Commission/RefundEntry não cancelados no refund

### 🟡 Importantes (nice to have, melhoram robustez)

- N+1 em sales-evolution
- 2 hooks de permissão coexistentes
- 2 libs de toast
- Maioria dos formulários sem react-hook-form
- Cashback por filial (decisão de produto a confirmar)
- Lab.apiKey sem cifra
- Sentry/Logger ausente

### 🔵 Oportunidades (melhoria contínua)

- Adotar `prisma-tenant` extension (já existe)
- Soft delete em Prescription (LGPD)
- Inventário cíclico
- TTL para AuditLog/GlobalAudit
- Helper único de arredondamento monetário

## 12. Avaliação final de prontidão

| Categoria | Score | Nota |
|---|---|---|
| Arquitetura | 8/10 | App Router + Prisma bem organizado, services bem separados |
| Multi-tenant | 6/10 | companyId consistente, mas branchId solto e prisma-tenant não usado |
| Auth | 6/10 | NextAuth funcional, mas v5 BETA + middleware fraco + permissions enum desincronizado |
| Schema | 7/10 | Rico, mas algumas inconsistências (precisão monetária, soft delete parcial) |
| Transações | 7/10 | Maioria coberta; 3 padrões problemáticos |
| Idempotência | 6/10 | Algumas constraints DB ✅, várias faltam |
| Segurança | 5/10 | Headers básicos OK; sem CSP/rate limit/Sentry; console.log com PII |
| LGPD | 3/10 | 🔴 Não conforme |
| Mobile UX | 7/10 | Bem trabalhado mas não testado |
| Performance | 6/10 | Indexes OK; N+1 em alguns relatórios |
| Build/Deploy | 8/10 | Vercel + Neon, configs corretas |
| Documentação | ⚪ | múltiplos `.md` no root sugerem boa documentação interna |

### Veredicto

🟠 **PRÉ-PRODUÇÃO COM AJUSTES.**

O sistema é **funcional e bem arquitetado** para a maior parte dos fluxos. **Caminho feliz da venda direta funciona perfeitamente.** Os pontos críticos estão em:
1. Caminhos secundários (conversão orçamento, devolução) que duplicam lógica e divergem
2. LGPD (necessário para BR)
3. Operações concorrentes em poucos pontos (cash open, recurring, transfer)
4. `validateCreditLimit` stub é "mentira" perigosa

**Para uma ótica única (1 filial, 1 caixa, baixa concorrência):** com fixes em B1-B7, está pronto.

**Para uma rede multi-filial em volume:** precisa também resolver os 🟠 sérios.

**Para SaaS multi-tenant em escala (objetivo aparente):** precisa resolver tudo + adicionar Sentry, rate limiting agressivo, CSP, e LGPD completa.
