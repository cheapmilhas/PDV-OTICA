# Auditoria Super Admin + Custos de IA — 2026-07-03

> Status: **FASES A–F IMPLEMENTADAS + DEPLOYADAS (2026-07-04)**.
> Origem: 3 agentes de auditoria (custos de IA / segurança+lógica / UI-UX+organização).
>
> ## O que foi corrigido nas Fases A–D (2026-07-04)
> - **Fase A (segurança):** S1 IDOR company-users PATCH; S2 notas PATCH/DELETE com escopo; S3 whatsapp-config + S4 ai-config PUT exigem SUPER_ADMIN + auditam; S5 close-stale-shifts com escopo; S6 exports (clientes/assinaturas/faturas/health-scores) com escopo; S7 networks exige SUPER_ADMIN; S8 clientes/create exige ADMIN; S9 company-users GET com escopo; S10 CSV injection plan-interests via csv-safe; S12 token impersonação `maxAge=1800`; P1 páginas clientes/usuarios/saúde com escopo.
> - **Fase B (custos IA):** IA-1 Whisper mede duração real (verbose_json + Math.ceil); IA-2 warn + teste de acoplamento allowlist↔preço; IA-3 cacheWriteTokens medido nos 4 call-sites + coluna nova + migração `20260703160000`; IA-4 rota `/api/admin/ai-usage-internal` (uso global/playground); IA-5 omite temperature para opus-4-8.
> - **Fase C (financeiro):** F1 cancelar assinatura cancela no Asaas (fail-soft); F2/F3 faturas manuais com Zod + numeração atômica; F4 mark_paid transacional + não ressuscita CANCELED/SUSPENDED; F5 resend-charge com escopo; F6 billingType mapeado p/ Asaas; F7 add_note valida; F8 paymentMethod gravado; F9 inadimplência com take:500; F10 "recebido no mês" em fuso BRT; form: "149,90" com Math.round+vírgula.
> - **Fase D (UI P0):** Toaster do sonner montado no admin (destrava todos os toasts); loading.tsx + error.tsx no segmento /admin; feedback via toast + moeda com helper `brl()` em company-actions e new-invoice-form.
> - **Fase E (UI P1):** company-actions com diálogos reais (ConfirmReasonDialog p/ impersonação+cancelamento, dialog radio-list p/ troca de plano, AlertDialog "digite o nome" p/ exclusão) no lugar de prompt/confirm; admin-nav com IA+WhatsApp, sem "Config"/"Novo Cliente" duplicados; breadcrumb com labels completos e "Suporte" não-clicável (+ página redirect); subtítulo de clientes honesto ("Mostrando X de N"); inadimplência com take:500.
> - **Fase F (backlog P2/P3):** 15 componentes do admin convertidos de alert/confirm/prompt → toast/AlertDialog/ConfirmReasonDialog; cores dark legadas (A6) trocadas por tokens do design system (sync-invoices, toggle-user, resend-charge, knowledge badge etc.).
>
> Testes: suíte total verde (>2020). Migração `20260703160000_ai_usage_cache_write_tokens` aplicada no Neon antes do deploy.
>
> **Itens deixados como backlog explícito (não implementados):** unificar os dois fluxos de criação de cobrança (página vs modal); abas do cliente na URL (`?tab=`) + aba WhatsApp separada da IA; filtros clicáveis nos KPIs de tickets; paginação real (com skip) em assinaturas/faturas/tickets (hoje truncam em 100/50 — clientes já mostra "X de N").

---

## PARTE 1 — CUSTOS DE IA (suspeita do dono: CONFIRMADA parcialmente)

Referência oficial usada (Anthropic/OpenAI): sonnet-4-6 $3/$15, haiku-4-5 $1/$5, opus-4-8 $5/$25 por MTok; cache read 0,1×; cache write 1,25×; Whisper $0,006/min.

### IA-1 · CRÍTICO — Transcrição de áudio sempre registrada com custo $0
`src/services/audio-transcription.service.ts:91-97` grava `audioSeconds: 0` em toda transcrição ("por ora logamos 0"). Whisper é cobrado por minuto → custo sempre $0 e tokens=0 → **não consome cota**. O qualificador transcreve até 80 áudios por conversa. Gasto real na OpenAI invisível e sem teto nos dois painéis.
**Fix:** pedir `response_format=verbose_json` ao Whisper e logar `Math.ceil(data.duration)` (coluna `audioSeconds Int?` já existe).

### IA-2 · ALTO — Modelo desconhecido → custo $0 silencioso
`src/lib/ai-pricing.ts:90` retorna `0` como fail-safe sem `log.warn`, e não há teste garantindo `QUALIFIER_MODELS ⊆ TEXT_PRICING` (`src/services/ai-config.service.ts:10`). Adicionar um modelo novo na allowlist sem tocar em ai-pricing.ts zera o custo E o markup cobrado da ótica, silenciosamente.
**Fix:** warn no ramo 0 + testes de acoplamento allowlist↔tabela (qualifier e copilot).

### IA-3 · ALTO — `cache_creation_input_tokens` ignorado nos 4 call-sites
`lead-qualifier.ts:137`, `conversation-copilot.ts:70`, `lens-advisor.ts:68`, `ocr/prescription/route.ts:170`; `ai-pricing.ts` não tem `cacheWritePerMillion`. Cache write NÃO vem dentro de `input_tokens` → some 100% da medição. Latente (nenhuma chamada usa `cache_control` hoje), mas obrigatório antes de ativar prompt caching.

### IA-4 · MÉDIO — Playground do super admin não aparece em painel nenhum
`ai-playground/route.ts:50-58` grava `companyId: null`; ambas agregações (`ai-usage.service.ts:63-91`) filtram por companyId concreto. Gasto real pago à Anthropic sem tela.
**Fix:** agregado global no admin incluindo `companyId IS NULL` como "playground/interno".

### IA-5 · MÉDIO — Opus 4.8 na allowlist quebra a qualificação
Opus 4.8 rejeita `temperature` (400). `lead-qualifier.ts:130` (temp 0) e `conversation-copilot.ts:63` (temp 0.3). Se o super admin escolher opus-4-8, toda qualificação falha, queima `analysisAttempts` (MAX=3) e congela conversas.
**Fix:** omitir `temperature` para opus-4-8 (ou tirar da allowlist).

### IA-6 · BAIXO — Mês corrente em UTC (`ai-usage.service.ts:53-56`): uso 21h-23:59 BRT do último dia cai no mês seguinte. Máx. 3h de deslocamento.
### IA-7 · BAIXO — BRL histórico recalculado com câmbio ATUAL (`admin/companies/[id]/ai-usage/route.ts:35-39`, `company/ai-usage/route.ts:60-66`): editar `usdBrlRate`/`markupPercent` muda retroativamente custo/preço/lucro do mês exibido ("números que mudam sozinhos").
### IA-8 · BAIXO — Falha do Prisma em `logAiUsage` é engolida (`ai-usage.service.ts:39-41`) → consumo pago mas não contabilizado (design fail-safe consciente).
### IA-obs · Créditos ponderam input/output/cache 1:1, mas output custa 5× input. Coerente entre gate e telas; só não é proporcional ao custo.

### O que está CORRETO (verificado)
Preços por modelo batem com a tabela oficial; matemática (÷1M, round6, Decimal(12,6)) correta; input/output não invertidos; os 4 call-sites Anthropic registram uso; multi-tenant ok; rota da ótica não vaza custo/markup/lucro; **admin e cliente veem o mesmo número** (mesma `getMonthlyUsage` + markup + câmbio); cota do ai-guard usa a mesma métrica exibida.

---

## PARTE 2 — SEGURANÇA E LÓGICA (APIs + páginas do super admin)

**Padrão-raiz:** admin com `scopeAllCompanies=false` (SUPPORT/BILLING escopados) passa em checks de role mas várias rotas/páginas não aplicam `getAccessibleCompanyIds` → vazamento cross-tenant.

### CRÍTICO
- **S1 · IDOR em `company-users/[id]` (PATCH)** (`:16-40`): ativa/desativa usuário de QUALQUER tenant sem validar escopo. Fix: `requireSupportScope(admin.id, user.companyId)`.
- **S2 · Notas sem escopo** (`clientes/[id]/notes/[noteId]` PATCH/DELETE): GET/POST irmãos validam escopo, PATCH/DELETE não.
- **S3 · `whatsapp-config` PUT sem role check**: config global anti-bloqueio mutável por qualquer admin. Fix: SUPER_ADMIN.
- **S4 · `ai-config` PUT sem role check**: chaves de API globais (Anthropic/OpenAI), câmbio e markup mutáveis por SUPPORT/BILLING. Fix: SUPER_ADMIN.
- **F1 · Cancelar assinatura NÃO cancela no Asaas** (`clientes/[id]/actions/route.ts:199-236`): banco vira CANCELED mas Asaas segue cobrando → chargeback. Fix: `asaas.subscriptions.cancel()` best-effort + `billingSyncPending` em falha (padrão do change_plan).

### ALTO
- **S5 · `cash/close-stale-shifts`**: ADMIN escopado fecha turnos de TODOS os tenants (`apply=true` altera differenceCash). Fix: requireCompanyScope / SUPER_ADMIN para modo global.
- **S6 · Exports sem escopo** (`export/clientes|assinaturas|faturas|health-scores|auditoria`): CSV com PII de todos os tenants para admin escopado. Só `export/tickets` filtra (usar como referência).
- **S7 · `networks` POST/PATCH sem role/escopo**: reassocia empresas e flags de compartilhamento multi-tenant.
- **F4 · `mark_paid` sem transação + reativa assinatura CANCELED** (`faturas/[id]/workflow/route.ts:59-93`). Fix: `$transaction` + só reativar se PAST_DUE/TRIAL.
- **F5 · Telas financeiras e rotas por-fatura sem escopo** (financeiro, faturas, inadimplência, assinaturas; `invoices/[id]/resend-charge`).
- **F6 · billingType inválido** — form oferece `CARTAO`/`TRANSFERENCIA`, Asaas só aceita `BOLETO|CREDIT_CARD|PIX|UNDEFINED` → cobrança falha 400.
- **P1 · Páginas admin ignoram escopo que as APIs respeitam** (dashboard, clientes, saúde, assinaturas, usuários, logs, tickets — só `requireAdmin()`).

### F2/F3 · CRÍTICO financeiro — Faturas manuais
- **F2**: fatura manual nunca vira OVERDUE (webhook filtra `asaasPaymentId` que ela não tem; sem job por dueDate) → some da Inadimplência.
- **F3**: `faturas/create` sem validação de valor (aceita negativo/fracionário em campo Int; `parseFloat*100` sem `Math.round`) + `invoiceNumber = INV-${count+1}` com corrida e colisão com `nextSaasInvoiceNumber`. Fix: Zod centavos + gerador atômico; ou rotear tudo pelo `createManualCharge` (que já é correto).

### MÉDIO/BAIXO
- **S8** `clientes/create` (provisionar empresa+owner) sem role check → mín. ADMIN.
- **S9** `company-users` GET lista usuários de todos os tenants (PII).
- **S10** CSV injection em `plan-interests` (campos de formulário público sem `csv-safe`).
- **S11** `whatsapp-config`/`ai-config` PUT sem `globalAudit` (inclusive gravação de chave de API).
- **S12** Token de impersonação com `exp` 30 dias no JWT (TTL 30min só no banco; revalidação DB funciona, mas alinhar `maxAge: 1800`).
- **F7** `workflow add_note` sem Zod, sobrescreve `adminNotes` (undefined apaga).
- **F8** `mark_paid` não seta `paymentMethod` → coluna vazia em tela/export.
- **F9** Paginação: inadimplência `findMany` SEM take; faturas/assinaturas take:100 truncando silenciosamente; exports take:5000.
- **F10** "Recebido no mês" com fronteira local vs UTC.
- **F11** `computeMrrSeries` aplica preço atual a meses passados (gráfico historicamente incorreto).
- **P2** Health-score usa `user.updatedAt` como proxy de atividade (reset de senha "revive" cliente inativo, peso 30%). Fix: `UsageSnapshot.lastLoginAt`.
- **P3** Janela 24h corrida vs dia-calendário SP no health-score.
- **P4** `catch {}` silencioso (ViaCEP em new-client-form; audit do MFA enroll).

### Verificado OK
Seed com gate triplo; login admin com rate limit + MFA TOTP; middleware + `requireAdmin()` em todas as páginas; `params` await ok em todos os handlers; monetário em Int centavos (sem bug de Decimal); `charges/route.ts` (manual-charge) correto com Zod + numeração atômica; impersonação com revogação por DB checada a cada request.

---

## PARTE 3 — UI/UX E ORGANIZAÇÃO

### Bugs de UI (ALTO)
- **A1** Toasts sonner NUNCA aparecem — `<Toaster/>` do sonner não é montado em lugar nenhum; ações de ticket (status/resposta) ficam sem feedback algum.
- **A2** Zero `loading.tsx`/`error.tsx` em toda a árvore `/admin` (dashboard faz ~17 queries; navegação congela sem skeleton; exceção → erro genérico do Next).
- **A3** `alert()`/`confirm()`/`prompt()` nativos em ~15 componentes (até sucesso é `alert("Dados atualizados!")`).
- **A4** Troca de plano digitando número da opção num `window.prompt()`; motivo de impersonação/cancelamento idem.
- **A5** Excluir empresa (irreversível) com um único `confirm()` genérico, sem digitar nome nem listar cascata.
- **A6** Cores dark legadas em página clara: `sync-invoices-button.tsx:37` (`text-gray-300` sobre branco = ilegível), `resend-charge-button.tsx:52-55`, `toggle-user-button.tsx:50-63`.

### Bugs de UI (MÉDIO)
- **A7** Datas server-rendered sem `timeZone` → hora UTC (3h adiantada) em quase todas as telas; só 3 lugares usam America/Sao_Paulo.
- **A8** Filtro de Interessados engole erro (`catch {}` mantém lista antiga sem avisar).
- **A9** Cobrança manual: "149,90" → `parseFloat` → R$ 149,00.
- **A10** "Fechar Ticket" sem confirmação (e com toast quebrado A1).
- **A11** 10 abas do detalhe da empresa sem overflow no mobile e sem estado na URL (`?tab=`).
- **A12/A13** Tabela de tickets sem scroll horizontal; KPI grids `grid-cols-4` fixos quebram no mobile (3 padrões diferentes de grid).
- **A14** Export CSV via `<a href>` cru (erro → JSON numa aba); existe componente correto `relatorios/export-buttons.tsx` que é código morto.
- **A15-A18** (BAIXO) Recalc health sem confirmação; aba Uso com 30 cards empilhados; ícones sem aria-label; export `companyInclude` de dentro de page.tsx.

### Inconsistências
- **B1** Moeda: 3 formatos concorrentes, ~25 cópias de template string, `toFixed(2)` errado p/ pt-BR; nenhum helper central.
- **B2** "Clientes" (nav) × "Empresas" (página).
- **B4** 3 padrões de feedback (alert / sonner quebrado / span inline).
- **B6** 3 mecânicas de filtro; selects não auto-submetem.
- **B7** Listas truncadas (take:100/50/500) sem paginação nem aviso — "100 empresas encontradas" mente.
- **B8** Contadores de filtro de clientes contam assinaturas (histórico), não empresas.
- **B3/B5/B9/B10** Prioridade de ticket em inglês c/ emoji; header manual vs PageHeader; login dark vs admin claro; `<button>` manual em vez de shadcn Button.

### Organização/Navegação
- **C1** Páginas de IA e WhatsApp fora do menu (escondidas atrás de Config→card).
- **C4** Breadcrumb: labels faltando (saude, sincronizacao, ia, whatsapp...) e crumb "Suporte" linka p/ rota 404.
- **C5** Sobreposição Financeiro×Assinaturas×Faturas×Relatórios (MRR em 4 telas com queries próprias) + DOIS fluxos divergentes de criar cobrança (página `/faturas/nova` vs modal NovaCobrancaButton — campos diferentes, o correto é o modal).
- **C6** Painel WhatsApp do cliente dentro da aba "IA".
- **C2/C3/C7/C8/C9** "Config" duplicado no nav; "Novo Cliente" como item de menu; "Trials expirando" mostra todos os TRIAL; tickets sem filtros; Interessados mal agrupado.

### Melhorias sugeridas (P0→P3)
P0: montar Toaster sonner + confirmDialog compartilhado; helpers `formatBRL`/`formatDateBR` com fuso; loading.tsx+error.tsx no segmento admin.
P1: modal de troca de plano/cancelamento; confirmação forte de exclusão; paginação padrão (extrair de usuarios); reorganizar nav+breadcrumb; unificar criação de cobrança.
P2: busca global na topbar; abas na URL + aba WhatsApp própria; tickets com KPIs clicáveis/filtros; export respeitando filtros.
P3: cards extras no dashboard (interessados novos, tickets abertos); padronizar Button shadcn; varrer cores dark legadas.

---

## PLANO DE EXECUÇÃO PROPOSTO (fases aprovableis separadamente)

**FASE A — Segurança crítica (S1-S4, S5-S7) — ~1 sessão.** Guards de escopo/role + testes de regressão por rota.
**FASE B — Custos de IA (IA-1..IA-5) — ~1 sessão.** Whisper duration real; warn+teste de acoplamento modelo↔preço; cache write nos 4 call-sites + pricing; agregado global playground; fix temperature opus. (IA-6/7/8 opcionais, decidir com dono.)
**FASE C — Integridade financeira (F1-F8) — ~1-2 sessões.** Cancelamento Asaas; faturas manuais via createManualCharge (ou job OVERDUE); mark_paid transacional; billingType; escopo em telas/exports financeiros (junto com S6/P1).
**FASE D — UI/UX P0 (A1-A3, A6, A7, B1) — ~1 sessão.** Toaster + confirmDialog + helpers de formato + boundaries; varredura dos alert/confirm/prompt.
**FASE E — UI/UX P1 (A4, A5, A9, paginação B7, nav C1-C4, cobrança C5) — ~1-2 sessões.**
**FASE F — Melhorias P2/P3 — backlog** (busca global, abas na URL, tickets, dashboard).

Cada fase: implementação + testes + tsc + build + revisão adversarial + deploy manual (migração antes quando houver).
