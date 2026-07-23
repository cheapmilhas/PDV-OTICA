# F1 — SuperAdmin 100% product-aware (spec + plano de execução)

**Data:** 2026-07-22 · **Fase:** F1 do plano de unificação (`2026-07-22-unificacao-operadora-arquitetura.md`)
**Risco declarado no plano-mãe:** baixíssimo (só leitura; nenhuma migração; nenhuma escrita cross-system).
**Processo:** spec → plano → implementação com revisão adversarial do Codex por fase (máx 2 rodadas). Deploy fatiado; nenhuma migração nesta fase (checar no fim: `git diff --stat prisma/` deve estar vazio).

---

## 1. Objetivo (o que "pronto" significa)

O dono opera VIS App e VIS Medical no MESMO SuperAdmin com **números segregados por produto** e uma **visão consolidada "Grupo"**. Ao trocar o toggle de produto (cookie `admin.product`), TODA tela de leitura passa a refletir só o produto ativo — não só Dashboard e Clientes (que já filtram), mas Assinaturas, Financeiro (visão geral, faturas, inadimplência), Relatórios, Saúde, Usuários e Tickets. Onde o produto não é aplicável ou os dados não existem, a tela diz isso explicitamente (nunca mostra número errado). O form de criação de cliente ganha um seletor de produto que a API já aceita.

**Não-objetivos (fora da F1, explícitos):**
- Provisionamento no Domus. Criar cliente medical pelo admin **tagueia** a Company como VIS_MEDICAL e escolhe plano medical, mas **NÃO cria a clínica no Domus** — o vínculo `domusClinicId` continua sendo feito por script até a F2. O form deve DEIXAR ISSO CLARO ao operador (aviso), senão cria-se uma Company medical órfã achando que está completa.
- Filtrar Interessados por produto (o modelo `PlanInterest` não tem caminho para Company — precisaria de migração, proibida na F1).
- Health score real para medical (feed vem na F6). F1 só mostra "indisponível" — nunca um score derivado de sinais óticos.
- Configurações (planos/logs/IA/e-mails/etc.) — são config global/sistema, sem dimensão natural de produto nesta fase. Exceção possível discutida em §6.

---

## 2. Estado atual verificado (base factual — não re-explorar)

### 2.1 A lente já existe e é genérica
- `src/lib/admin-product-context.ts`: `getProductContext()` lê o cookie `admin.product` (default `VIS_APP`); `productWhereFilter(product, opts?)` produz 3 formas — direto `{platformProduct}` (Company), `{via:"company"}` (Subscription/User/SupportTicket), `{via:"subscription.company"}` (Invoice); `notDeletedFilter(opts?)` espelha as 3 formas para esconder soft-deletados.
- `src/app/admin/(painel)/dashboard-filters.ts`: `buildDashboardFilters(product)` retorna `{company, subscriptionCompany, invoiceCompany}`, cada um `AND [productWhereFilter, notDeletedFilter]` na via certa. **Apesar do nome, é genérico** — reutilizável em todas as telas. Testado em `__tests__/dashboard-product-filter.test.ts`.
- Toggle: `admin-nav.tsx` (botões Vis App / Vis Medical) → POST `/api/admin/product-context` grava cookie `httpOnly, sameSite:lax, path:"/admin", 1 ano` → `window.location.reload()`. `layout.tsx` lê `getProductContext()` e passa `activeProduct` prop pro nav.

### 2.2 Telas que JÁ filtram (referência de padrão)
- Dashboard (`page.tsx`), Clientes (`clientes/page.tsx` + `/api/admin/clientes/route.ts`).

### 2.3 Telas que IGNORAM o toggle (o trabalho) — com caminho de filtro
| Tela | Entidade | Via de filtro | Migração? | Observação |
|---|---|---|---|---|
| `assinaturas/page.tsx` | Subscription | `via:company` | não | ⚠️ `groupBy(["status"])` roda **sem where** — corrigir junto ou KPI ≠ lista |
| `financeiro/page.tsx` | Invoice + service `getReceivableThisWeek` | `subscription.company` | não | service precisa receber o filtro |
| `financeiro/faturas/page.tsx` | Invoice + `company.findMany` (picker) | `subscription.company` / direto | não | 6 `count` de workflow rodam sem where — filtrar |
| `financeiro/inadimplencia/page.tsx` | Invoice | `subscription.company` | não | 4 `count` + `aggregate` OVERDUE |
| `relatorios/page.tsx` | Subscription + SupportTicket | `via:company` | não | injeta produto nas **queries**; helpers de `admin-metrics.ts` continuam puros |
| `saude/page.tsx` | Company | direto | não | compõe com `scopeWhere` existente por `AND`; **medical → "indisponível"** |
| `usuarios/page.tsx` | User + Company (dropdown) | `via:company` / direto | não | compõe com `getAccessibleCompanyIds` por `AND` |
| `suporte/tickets/page.tsx` | SupportTicket | `via:company` | não | `findMany` e `groupBy` rodam **sem where** — filtrar ambos |
| `interessados/page.tsx` | PlanInterest | **nenhuma** | exigiria | **FORA da F1** — sem coluna de produto |

### 2.4 Fatos de schema que travam a fase
- `platformProduct` existe SÓ em `Company` e `Plan`. `Subscription`/`Invoice`/`SupportTicket`/`User` chegam a Company por relação. `PlanInterest` não tem nenhum caminho.
- `admin-metrics.ts` (computeMRR/computeMrrSeries/computeChurnRate/computeTrend) é **lógica pura** — recebe listas já filtradas. Product-awareness entra no CALLER (as queries), não dentro dos helpers. **Não mexer na assinatura dos helpers.**

### 2.5 Testes existentes a espelhar
- `__tests__/dashboard-product-filter.test.ts` (asserta as 3 vias do AND) · `clientes/__tests__/clientes-product-scope.test.ts` · `src/lib/__tests__/admin-product-context.test.ts` · `clientes/__tests__/create-product.test.ts`.

---

## 3. Decisões de design da F1

**D1 — Reutilizar `buildDashboardFilters`, não reinventar.** Toda tela chama `const product = await getProductContext(); const pf = buildDashboardFilters(product);` e espalha `pf.company` / `pf.subscriptionCompany` / `pf.invoiceCompany` nas wheres. Zero novos helpers de filtro para os casos cobertos por essas 3 vias. Renomear o arquivo/função seria ruído de diff sem valor — mantém o nome.
  - *Exceção necessária:* `User` filtra `via:company` (mesma forma do Subscription → reusa `pf.subscriptionCompany`, que é `AND[{company:{platformProduct}}, {company:notDeleted}]`); `SupportTicket` idem. Confirmar que a forma `{company:...}` casa com o relacionamento desses modelos (têm `company` relation) — casa.

**D2 — Corrigir TODA query da tela, não só a lista.** Onde há `groupBy`/`count`/`aggregate` sem `where` (assinaturas, tickets), aplicar o mesmo filtro. Um KPI global sobre uma lista filtrada é um bug de confiança (o número não bate com o que se vê).

**D3 — `admin-metrics.ts` fica intacto.** A "parametrização por produto" das métricas é feita alimentando os helpers com subscriptions já filtradas por produto no `relatorios/page.tsx` (e no Grupo). Não adicionar parâmetro `product` aos helpers — quebraria a pureza testável e não é necessário.

**D4 — Saúde para medical: "indisponível" em TODA superfície (revisado pós-Codex).** O health score é derivado de sinais óticos. Para `VIS_MEDICAL`:
  - `/saude`: não roda a query; estado explícito "Health score de clientes Medical ainda não disponível (fase futura)".
  - **Lista de clientes** (`ClientesTable.tsx:116`): quando o toggle é medical, a coluna Saúde mostra "—"/indisponível, não o badge fake. (A lista já filtra por produto, então basta o componente não renderizar o badge para medical.)
  - **Dashboard** (`page.tsx:66-67`): as contagens/AlertCards de saúde (CRITICAL/AT_RISK) não devem contar medical — mas o dashboard já filtra por `pf.company`; o problema é o score fake existir. Cobrir escondendo o card de saúde quando o produto ativo é medical (não há sinal real).
  - **Cron** (`recalcAllActiveHealthScores`, `health-score.ts:313`): excluir `platformProduct:"VIS_MEDICAL"` do `findMany` — não recalcular medical, para não gravar score sem sentido.
  - Racional (plano-mãe §9.2/§5.5): "nunca score errado".

**D5 — Dashboard "Grupo": rota própria FORA do toggle.** Nova rota `/admin/grupo` (server component) que **ignora o cookie** e consulta os dois produtos lado a lado: MRR total e por produto, clientes por produto, trials ativos por produto, churn comparado. É "a tela que o dono olha de manhã". Como o cookie tem `path:"/admin"`, ele É lido em `/admin/grupo` — então a rota deve explicitamente NÃO chamar `getProductContext`, e sim consultar `VIS_APP` e `VIS_MEDICAL` separadamente (dois `buildDashboardFilters`).
  - Link no nav numa seção "Visão Geral"/"Grupo" no topo, acima do toggle de produto (é cross-produto).

**D6 — Form: seletor de produto + aviso + integridade plano×produto (revisado pós-Codex).** No `new-client-form.tsx`, seletor VIS App / VIS Medical. Ao escolher Medical: (a) enviar `platformProduct:"VIS_MEDICAL"` no submit; (b) aviso "A clínica no Domus NÃO é criada automaticamente nesta fase — rode o script de vínculo após cadastrar; provisionamento automático chega na F2"; (c) filtrar a lista de planos EXIBIDA para o produto selecionado; (d) **ao trocar de produto, RESETAR `planId`** para o primeiro plano do novo produto (senão o draft persiste um `planId` do outro produto — Codex #5). E no SERVIDOR (`create/route.ts`): **validar `plan.platformProduct === platformProduct`** e retornar 400 se divergir (defesa real, não só UI). CNPJ continua obrigatório (DEC-2).
  - Os planos vêm de `clientes/novo/page.tsx` (server): carregar todos com seu `platformProduct` (o client filtra por seleção).

**D7 — Nenhuma migração, nenhuma escrita nova.** Toda mudança é em `where` de leitura, mais UI. `PlanInterest` e `Configurações` ficam de fora. Se no meio aparecer necessidade de coluna nova, PARAR e reportar (violaria o risco declarado da fase).

---

## 4. O que fica de fora e por quê (para o Codex não cobrar)
- **Interessados/PlanInterest:** sem caminho a Company; filtrar exige migração → F1 é read-only sem DDL. Deixar global; opcionalmente esconder o efeito do toggle com uma nota "não segmentado por produto".
- **Configurações/*:** planos, logs, IA, e-mails, equipe, segurança, integrações, whatsapp, sincronização — config de sistema. `planos` TEM `platformProduct` e PODERIA filtrar, mas é tela de CRUD de catálogo; segmentar aqui é conveniência, não correção. Decidir no fim (§6), default = não mexer.
- ~~**Exports CSV**~~ **INCLUÍDOS na F1** (achado do Codex na 2ª rodada): a lente por cookie agora chega em `/api/admin/*` (DEC-1, path "/"), então os exports clientes/assinaturas/faturas/tickets/health-scores passam a filtrar por produto — senão o CSV contradiz os KPIs da tela. Auditoria fica global (cross-cutting, igual à decisão do Logs). Health-scores de medical sai vazio (não há score).
- **Impersonate / detalhe do cliente medical (painel da federação):** é F2 (§5.5 do plano-mãe fala do detalhe medical junto do provisionamento). F1 não toca.

---

## 5. Plano de execução (fatiado, cada fatia testável)

Ordem: telas de menor risco primeiro (só `where`), depois Grupo (query nova mas read-only), depois form (UI). Uma rodada de Codex no PLANO (agora) e uma no DIFF ao final.

### Fatia A — Telas de leitura por produto (o grosso, repetitivo, baixo risco)
Para cada tela abaixo: importar `getProductContext` + `buildDashboardFilters`, computar `pf` no topo, espalhar nas wheres (inclusive count/groupBy/aggregate), passar listas server-side já filtradas aos client components (pickers de empresa).
1. `assinaturas/page.tsx` — `pf.subscriptionCompany` nas 3 queries (findMany, groupBy, count). **groupBy inclusive.**
2. `financeiro/page.tsx` — `pf.invoiceCompany` nos 4 aggregate + findMany OVERDUE; passar produto a `getReceivableThisWeek` (nova assinatura opcional: aceitar um `where` extra ou o `product`).
3. `financeiro/faturas/page.tsx` — `pf.invoiceCompany` nas queries de Invoice; `pf.company` no `company.findMany` do picker (passado a `NovaCobrancaButton`); os 6 count de workflow.
4. `financeiro/inadimplencia/page.tsx` — `pf.invoiceCompany` no findMany + 4 count + aggregate.
5. `relatorios/page.tsx` — `pf.subscriptionCompany` nas contagens de subscription e no findMany de MRR; SupportTicket via `pf.subscriptionCompany` (tem company relation). Helpers de métrica inalterados.
6. `usuarios/page.tsx` — `AND`-compor `pf.subscriptionCompany` (via company) com o `getAccessibleCompanyIds`; `pf.company` no dropdown de empresas.
7. `suporte/tickets/page.tsx` — `pf.subscriptionCompany` no findMany E no groupBy.
8. `saude/page.tsx` — **especial (D4):** se `product === "VIS_MEDICAL"`, renderizar estado "indisponível" e NÃO rodar as queries de health; se `VIS_APP`, `AND`-compor `pf.company` com o `scopeWhere` existente.

Teste da Fatia A: um teste por padrão de composição já é coberto por `dashboard-product-filter.test.ts` (a forma do filtro). Adicionar testes finos onde há composição não-trivial: `saude` (medical → não consulta), `usuarios` (AND com accessible ids), e o `getReceivableThisWeek` com produto. Não precisa testar cada tela isoladamente — a lente é a mesma e já testada; testar a COMPOSIÇÃO nova.

### Fatia B — Dashboard "Grupo" (`/admin/grupo`)
- Nova rota server component. NÃO lê `getProductContext`. Roda, para cada produto, o conjunto de contagens do dashboard (`buildDashboardFilters("VIS_APP")` e `("VIS_MEDICAL")`): total empresas, ativas, trials, MRR (via `computeMRR` com subs filtradas), churn (via `computeChurnRate`). Renderiza cards comparativos + totais consolidados.
- Link no nav numa seção nova no topo ("Grupo" / "Consolidado"), com ícone. Deixar claro que é cross-produto (não afetado pelo toggle).
- Teste: helper puro que monta os dois conjuntos de filtros e um teste de que o total consolidado = soma dos produtos (matemática, sem banco).

### Fatia C — Seletor de produto no form (UI)
- `clientes/novo/page.tsx` (server): carregar planos SEM filtrar por produto (o operador precisa ver ambos) OU carregar ambos e o client filtra por seleção. Simplest: carregar todos os planos com seu `platformProduct` e o client filtra a lista exibida pela seleção.
- `new-client-form.tsx`: estado `platformProduct` (default VIS_APP, persistido no draft), seletor visual no Step 2, filtro da lista de planos exibida, aviso medical (D6), envio do campo no submit.
- Teste: o form é client — cobrir a lógica de filtro de planos e o payload de submit com um teste de componente leve OU deixar coberto pelo teste da API (`create-product.test.ts` já valida o lado servidor). Mínimo: garantir que `platformProduct` entra no body.

### Passo final — verificação
- `npx tsc --noEmit` limpo (ou o script de typecheck do projeto).
- `vitest run` verde (suite relacionada + novos testes).
- `git diff --stat prisma/` vazio (invariante: zero migração).
- Codex revisa o diff completo (Fatias A+B+C). Corrigir achados reais, rejeitar falso-positivo com justificativa. Máx 2 rodadas.
- Deploy fatiado: como não há migração, `git push origin main` (com fetch+rebase antes) dispara o auto-deploy. Nada de `migrate deploy` nesta fase.

---

## 6. Decisões do dono (RESOLVIDAS 2026-07-22, pós review Codex)

**DEC-1 — Cookie `admin.product` → alargar `path:"/"`.** O cookie hoje tem `path:"/admin"` e NÃO chega em `/api/admin/*` (o browser não envia; confirmado — bug latente no picker `company-network.tsx:92`). Mudar para `path:"/"` em `api/admin/product-context/route.ts`. Continua `httpOnly, sameSite:lax` — é contexto de UX, não autorização (o access-scope é a fronteira real). Corrige o bug latente e faz a lente funcionar em API routes + exports automaticamente.

**DEC-2 — CNPJ continua obrigatório na F1.** Não relaxar a validação da API (relaxar = mudança de comportamento de escrita, fora do risco da fase). Medical sem CNPJ (profissional CPF) fica bloqueado até a F2 (que reescreve o serviço de criação). Dívida documentada. O operador ainda cria medical COM CNPJ.

**DEC-3 — Esconder health de medical em TODAS as telas + excluir do cron.** Não só `/saude`: também a lista de clientes (`ClientesTable.tsx:116`) e as contagens de saúde do dashboard (`page.tsx:66-67`, os AlertCards). E excluir VIS_MEDICAL de `recalcAllActiveHealthScores` (`health-score.ts:313`) para nem gravar score sem sentido. Racional: o score é derivado de sinais óticos; para clínica é ruído (falso churn-risk). Feed real = F6.

**DEC-4 — Incluir os 3 extras na F1:**
- **Guard de produto nos detalhes:** `clientes/[id]`, `financeiro/faturas/[id]`, `suporte/tickets/[id]` → `notFound()` se o registro for de produto ≠ toggle ativo (consistência; access-scope continua sendo a segurança real).
- **Badge "não segmentado" em Interessados:** aviso discreto (PlanInterest não tem coluna de produto; filtrar exigiria migração proibida).
- **Filtrar pickers de empresa em Configurações:** dropdowns de empresa nas telas IA (`configuracoes/ia/page.tsx:14`) e Logs (`configuracoes/logs/page.tsx:89`) aplicam a lente; o resto de Configurações continua global.

**DEC-5 (design, não do dono) — Grupo no nav:** seção "Grupo" com um item, acima de "Principal".

---

## 7. Riscos da própria F1
| Risco | Mitigação |
|---|---|
| Esquecer um count/groupBy sem where → KPI não bate com lista | Checklist §5 Fatia A explicita cada query; Codex confere no diff |
| `saude` medical mostrar score ótico (falso churn) | D4: não roda a query; estado "indisponível" |
| Grupo ler o cookie e virar "só produto ativo" | D5: rota NÃO chama getProductContext; consulta os 2 produtos |
| Form criar Company medical órfã (sem clínica Domus) | D6: aviso explícito; provisionamento é F2 |
| Introduzir migração sem querer | Invariante final: `git diff --stat prisma/` vazio |
| Composição errada AND vs spread (colisão de chave `company`) | Seguir o padrão de `dashboard-filters.ts`; nunca spread quando ambos aninham em `company` |
