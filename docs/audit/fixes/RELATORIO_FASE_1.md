# RELATÓRIO — FASE 1: BLINDAGEM DE ACESSO

> Branch: `fix/fase1-blindagem-acesso` · Commit: `596388a` · **NÃO deployado.**
> tsc: 0 erros · Testes: **522 passando** (66 arquivos; +11 novos) · `git status` limpo (só os 3 untracked pré-existentes de outras frentes).
> Escopo: SEC-001, SEC-002, SEC-003, SEC-004, SEC-005. **SEC-007 removido** (ver §6).

---

## 1. Resumo em linguagem simples

Fechamos os buracos de controle de acesso no servidor. Antes: qualquer funcionário logado conseguia **devolver vendas**, **exportar a tabela de produtos** (custos/margens) e **abrir todos os relatórios** (DRE, comissões, etc.) — bastava estar logado. Agora:

- **Devolver venda** exige a nova permissão `sales.refund` (só GERENTE e ADMIN). A tela de Devoluções e os links no menu também somem para quem não pode.
- **Exportar produtos** virou ADMIN-only e fica registrado em auditoria (igual à exportação de clientes).
- **Relatórios** agora exigem a permissão de relatório correspondente — vendedor/caixa não veem mais relatórios financeiros e de vendas.
- **Filtros por filial** em relatórios financeiros agora recusam (403) filial de outra empresa, em vez de devolver vazio silencioso.
- **Gerador de código de barras** (antes público) agora exige login e tem limite de requisições (anti-DoS).

Tudo verificado no servidor (não só escondendo botão). 11 testes novos cobrem as proteções.

---

## 2. Tabela rota × permissão × roles com acesso (estado final)

| Rota | Permissão exigida | Têm acesso | Perderam acesso |
|---|---|---|---|
| `POST /api/sales/[id]/refund` | `sales.refund` (**nova**) | ADMIN, GERENTE | VENDEDOR, CAIXA, ATENDENTE |
| `GET /api/products/export` | `requireRole(["ADMIN"])` + auditoria | ADMIN | todos os demais |
| 9× `/api/reports/**` (sales-evolution, sales/consolidated, top-products, products/top-sellers, summary, dashboard, temporal, branch-comparison, optical, optical/labs) | `reports.sales` | ADMIN, GERENTE | VENDEDOR, CAIXA, ATENDENTE |
| 8× `/api/reports/**` (financial/dre, financial/accounts-payable, financial/accounts-receivable, financial/cash-history, card-settlement, payment-methods, commissions, team-performance) | `reports.financial` | ADMIN, GERENTE | VENDEDOR, CAIXA, ATENDENTE |
| 4× `/api/reports/**` (stock/position, stock/no-movement, products, category-distribution) | `reports.inventory` | ADMIN, GERENTE | VENDEDOR, CAIXA, ATENDENTE |
| 1× `/api/reports/customers` | `reports.customers` | ADMIN, GERENTE | VENDEDOR, CAIXA, ATENDENTE |
| `POST /api/barcodes/generate-image` | `requireAuth` + rate-limit 60/min por IP | qualquer logado | anônimos (era público) |

> Total reports: **23 rotas** (10 sales + 8 financial + 4 inventory + 1 customers). Todas já exigiam login (5 faziam `auth()` inline) — o que faltava era a camada de permissão.

---

## 3. Rotas que receberam `validateBranchOwnership` (SEC-004)

Aplicado nas **escritas com branchId do body** e nos **GETs financeiros sensíveis** (filtro por filial → 403 explícito quando a filial não é da empresa). Leituras operacionais já protegidas por `companyId` na query foram deixadas como estão (não vazam) — decisão aprovada pelo dono.

| Arquivo | Tipo | Onde |
|---|---|---|
| `src/app/api/finance/entries/route.ts` | **escrita (POST)** + GET | valida branchId do body antes de gravar; valida no GET quando filtrado |
| `src/app/api/finance/dashboard/route.ts` | GET | após `branchId` do query |
| `src/app/api/finance/card-receivables/route.ts` | GET | idem |
| `src/app/api/finance/bi/route.ts` | GET | idem |
| `src/app/api/finance/bi/stock-aging/route.ts` | GET | idem |
| `src/app/api/finance/reports/dre/route.ts` | GET | idem |
| `src/app/api/finance/reports/cash-flow/route.ts` | GET | idem |
| `src/app/api/reports/financial/cash-history/route.ts` | GET | idem |
| `src/app/api/reports/stock/position/route.ts` | GET | idem |
| `src/app/api/reports/sales/consolidated/route.ts` | GET | idem |

Padrão aplicado: `if (branchId && branchId !== "ALL") await validateBranchOwnership(branchId, companyId);` (no POST, sem o `!== "ALL"`).

---

## 4. Arquivos criados/modificados

**Modificados (38):**
- `src/lib/permissions.ts` — enum `SALES_REFUND`, label, MANAGER ganha a permissão
- `src/app/api/permissions/seed/route.ts` — catálogo + `ROLE_PERMISSIONS_MAP.GERENTE` ganham `sales.refund`
- `src/app/api/sales/[id]/refund/route.ts` — `requirePermission(SALES_REFUND)`
- `src/app/api/products/export/route.ts` — ADMIN-only + auditoria
- 23× `src/app/api/reports/**/route.ts` — `requirePermission`
- 7× `src/app/api/finance/**/route.ts` — `validateBranchOwnership` (entries tem 2)
- `src/app/api/barcodes/generate-image/route.ts` — auth + rate-limit + catch preserva 401
- `src/app/(dashboard)/dashboard/financeiro/devolucoes/page.tsx` — `ProtectedRoute permission="sales.refund"`
- `src/components/layout/sidebar.tsx` + `mobile-nav.tsx` — link Devoluções gated por `sales.refund`

**Criados (3 testes):**
- `src/lib/permissions-refund.test.ts` — 6 testes (sales.refund existe; ADMIN/MANAGER têm; SELLER/CASHIER não)
- `src/app/api/sales/[id]/refund/route.test.ts` — 403 sem permissão / 201 com
- `src/lib/validate-branch.test.ts` — 403 filial de outra empresa / 403 inexistente / passa quando própria

---

## 5. Migration/seed criada?

**Migration de schema: NÃO.** As tabelas `Permission`/`RolePermission` já existem; nenhuma alteração de schema foi necessária.

**Seed: SIM, precisa ser EXECUTADO no deploy (não roda automático).** A permissão `sales.refund` foi adicionada ao código, mas o runtime (`permissionService`) lê do **banco** (tabela `RolePermission`). Para a permissão valer, é preciso rodar `POST /api/permissions/seed` (ADMIN) após o deploy — ele faz `deleteMany` + recreate de `RolePermission` (idempotente, seguro re-rodar). **Sem rodar o seed, GERENTE não consegue devolver venda** (só ADMIN, que tem bypass no código).

> ⚠️ Detalhe de arquitetura confirmado no mapeamento: a fonte que vai ao banco é o `ROLE_PERMISSIONS_MAP` em `permissions/seed/route.ts` (roles em PT: GERENTE/VENDEDOR/CAIXA), **não** o `ROLE_PERMISSIONS` de `permissions.ts` (roles em EN). Ambos foram atualizados para ficarem coerentes, mas só o do seed afeta o banco.

---

## 6. Decisões e desvios do mapeamento aprovado

1. **SEC-007 removido (falso positivo confirmado).** O login de loja (`authorize()` em `src/auth.ts`) **já tinha rate-limit** (`checkRateLimit('login:<email>', 10/5min)`). O relatório de diagnóstico errou ao marcá-lo como aberto. Dono aprovou remover.
2. **SEC-004 com escopo reduzido (aprovado).** O diagnóstico falava em "~17 rotas"; a leitura mostrou que a maioria usa branchId como filtro de leitura já restrito por `companyId` (não vaza) ou pega branchId da sessão. Aplicamos só nas escritas + GETs financeiros sensíveis (~10 rotas) — equilíbrio risco/esforço aprovado pelo dono.
3. **products/export = ADMIN-only** (não ADMIN+GERENTE) — decisão do dono, espelha customers/export.
4. **Gate de UI do refund por página inteira**, não por botão: a tela `/financeiro/devolucoes` é 100% dedicada a devolução, então trocamos seu `ProtectedRoute` de `financial.view` (amplo, CAIXA tem) para `sales.refund`.

---

## 7. Testes

- **Rodados:** suíte completa — **522 passando** (era 511; +11 novos). 0 falhas. tsc 0 erros.
- **Adicionados (11):**
  - Permissão `sales.refund`: existe, tem label, ADMIN+MANAGER têm, SELLER+CASHIER não (6).
  - Rota refund: 403 sem permissão (não chama refundFull); 201 com permissão chamando `requirePermission("sales.refund")` (2).
  - `validateBranchOwnership`: passa p/ filial própria, 403 p/ filial de outra empresa, 403 p/ inexistente (3).

---

## 8. Erros/imprevistos encontrados

- **Catch do barcode transformava 401 em 500.** O handler tinha um catch que retornava sempre 500; ajustado para delegar a `handleApiError` quando o erro tem `statusCode` (AppError), preservando o 401 do `requireAuth`.
- **Teste de refund 403 inicialmente falhou** (retornava 500): um `Error` fabricado com `statusCode` não é `instanceof AppError`, então `handleApiError` caía no fallback 500. Corrigido usando o helper real `forbiddenError()` no teste (simula fielmente o que `requirePermission` lança).
- **Higiene de branch (fora do diagnóstico):** havia outra frente (`feat/auto-sync-fase-b`) com trabalho não-commitado/stashes. A branch da Fase 1 foi recriada limpa a partir da `main` e o commit inclui **apenas** arquivos desta fase (verificado: nenhum arquivo auto-sync/fase-b/default-messages).

---

## 9. Riscos de regressão — validar manualmente na tela

1. **Devolução por GERENTE:** logue como GERENTE → menu deve mostrar "Devoluções" → abrir, buscar venda, devolver → **deve funcionar** (após rodar o seed em prod!).
2. **Devolução bloqueada:** logue como VENDEDOR ou CAIXA → "Devoluções" **não deve aparecer** no menu; acessar a URL direta deve bloquear; chamar a API deve dar 403.
3. **Relatórios bloqueados:** logue como VENDEDOR → relatórios financeiros/vendas devem dar 403 (ou sumir da navegação). ADMIN/GERENTE continuam vendo tudo.
4. **Export de produtos:** logue como GERENTE → exportar produtos deve **negar** (ADMIN-only). ADMIN deve exportar e gerar log de auditoria.
5. **Filtro de filial:** num relatório financeiro, passar `?branchId=<de outra empresa>` deve dar 403 (antes: lista vazia).
6. **ADMIN não quebrou nada:** ADMIN tem bypass — deve continuar acessando tudo mesmo antes do seed.

---

## 10. Pendências para o deploy (ritual padrão)

- [ ] Backup do Neon (prod).
- [ ] **Não há migration de schema** — pular `migrate deploy` (ou rodar; é no-op para esta fase).
- [ ] `git push` da branch + merge na `main` (ou deploy direto da branch conforme o fluxo).
- [ ] **`vercel deploy --prod`** (deploy é MANUAL; push não dispara — ver memória do projeto).
- [ ] **CRÍTICO pós-deploy: rodar `POST /api/permissions/seed` como ADMIN** para a permissão `sales.refund` existir no banco (senão GERENTE não devolve). Idempotente.
- [ ] Smoke: logar como GERENTE e confirmar devolução; logar como VENDEDOR e confirmar bloqueio de relatórios.
- [ ] Janela de baixo tráfego (domingo de madrugada).
