# Evolução do Super Admin — design

**Data:** 2026-08-03
**Status:** aprovado pelo dono (design); aguarda revisão do spec escrito
**Frente relacionada:** recorrência de cobrança / webhook do Asaas

---

## 1. Problema

O super admin **não sofre por falta de funcionalidade**. São 30 telas, ficha de cliente com 11
abas, wizard de onboarding e impersonation madura. Sofre por três coisas concretas, todas medidas
nesta sessão:

1. **Telas que discordam entre si** sobre o fato mais importante do negócio: se uma fatura foi paga.
2. **Caminhos que enganam** — existe tela que parece cobrar o cliente e não cobra.
3. **Defaults perigosos** que só machucam no dia em que houver um segundo operador.

O evento que originou esta análise: o dono passou ~2 meses sem saber que um pagamento entrou,
porque o webhook estava desligado no painel do Asaas **e** não existe forma de perguntar ao
gateway "esta fatura foi paga?".

### Âncora de escala (contra over-engineering)

17 empresas, 4 pagantes, **8 faturas em todo o histórico**, **1 operador**. A Vercel já pausou o
projeto por excesso de invocations. O Asaas é produção real sem sandbox. Qualquer proposta que
ignore esses números está errada por construção.

---

## 2. Achados que sustentam o plano

Todos verificados no código ou no banco de produção. `file:line` no inventário completo.

### 2.1 Cinco definições concorrentes de "pago"

| # | critério | onde |
|---|---|---|
| A | `status === "PAID"` | KPIs, badges, CSV, aba do cliente, inadimplência |
| B | `paymentConfirmed === true` | coluna "Pago" da lista (`(painel)/financeiro/faturas/page.tsx:290`), chips de etapa |
| C | `paidAt !== null` | "Pago em", coluna do CSV, janela dos KPIs de receita |
| D | união de C e B | guarda de cancelamento (`invoice-cancel-charge.service.ts:227`) |
| E | `paymentConfirmedAt === null` | seleção de lembretes (`invoice-reminders.service.ts:136`) |

**Choque visível:** `(painel)/financeiro/faturas/page.tsx:279` (Status, usa A) e `:290` (Pago, usa B) na
MESMA linha → badge "Paga" ao lado de ícone "não pago". Atinge toda fatura legada, porque
`paymentConfirmed` tem `@default(false)`.

**Chip "Aguardando NF"** (`:104`) filtra `paymentConfirmed: true` **sem filtro de status** → conta
faturas canceladas/estornadas. Nunca fecha com o KPI "Faturas Pagas" (`:100`).

A divergência NÃO vem das escritas (webhook e `mark_paid` gravam os 4 campos juntos e coerentes) —
vem das **leituras não normalizadas** + dados legados.

### 2.2 Caminhos que enganam

- **`/admin/financeiro/faturas/nova`** cria fatura **sem falar com o Asaas, sem PIX e sem e-mail**
  ("fatura fantasma"). O caminho correto é o botão "Nova Cobrança"
  (`/api/admin/charges` → `manual-charge.service.ts:78`).
  🚨 **É PIOR do que a 1ª versão deste spec afirmava.** Eu escrevi "não está no menu, só por URL":
  **falso.** `src/app/admin/(painel)/financeiro/page.tsx:185` tem um `QuickLink` intitulado
  **"Nova Cobrança"** apontando para ela — ou seja, o operador é levado à fatura fantasma **pelo
  caminho principal**, com o nome do caminho correto. Isso eleva a gravidade do achado.
  ↳ Correção de rota: a página **TEM** gate (`requireFinanceAccess`, 1ª linha de
  `faturas/nova/page.tsx`, travado por `admin-finance-roles.test.ts:164`). Quem não tem gate de
  papel é a **rota de API** `/api/admin/faturas/create` (`route.ts:31`: `getAdminSession` +
  `requireCompanyScope`, sem checar papel).
- **Não existe "conferir ESTA fatura no Asaas"** — só um sync global.
- **PIX truncado em 30 chars** (`(painel)/financeiro/faturas/[id]/page.tsx:262`), sem QR e sem copiar → inútil na prática.

### 2.3 Defaults perigosos (bomba-relógio de contratação)

- `AdminUser.role @default(SUPPORT)` (`schema.prisma:2865`) + `scopeAllCompanies @default(true)`
  (`:2867`) → **conta nova enxerga a carteira inteira**.
- Sem gate de papel: `GET /api/admin/clientes`, `GET /api/admin/company-users` (dado pessoal de
  todos os tenants), `mark_paid` (`api/admin/faturas/[id]/workflow/route.ts:31`).
- Telas abertas a SUPPORT: clientes (lista e detalhe), assinaturas, usuários,
  `configuracoes/planos` (precificação), `configuracoes/logs` (auditoria global).

Hoje inofensivo — há 1 conta ativa, `SUPER_ADMIN`. É barato arrumar **antes** de existir a segunda.

### 2.4 Auditoria ausente onde mais importa

- **Os 6 exports CSV não gravam `GlobalAudit`** (clientes, faturas, assinaturas, tickets, health,
  auditoria) → a base pessoal inteira sai sem rastro. **Verificado:** `grep -c globalAudit` = 0.
- Sem trilha: `cancel-charge`, `billing/reconcile`, mutações de usuário/permissão de tenant.
- `support-redeem` audita só a **falha**; o **sucesso** não deixa rastro do lado Vis.

### 2.5 Esqueletos e duplicação

| item | situação |
|---|---|
| `/admin/assinaturas` | **ESTÁ no menu lateral** (`(painel)/admin-nav.tsx:55`) e no breadcrumb (`admin-breadcrumb.tsx:23`). Lista read-only navegável (202 linhas, chips de status, sort, link para a ficha) — redundante com `/clientes?status=`, mas **não é esqueleto vazio** |
| `/admin/financeiro/faturas/nova` | fatura fantasma (§2.2). **Alcançável pelo `QuickLink` "Nova Cobrança"** do hub financeiro (`financeiro/page.tsx:185`) |
| `relatorios/export-buttons.tsx` | órfão **neste caminho** — ⚠️ existe homônimo MUITO usado em `@/components/reports/export-buttons` (DRE, BI, fluxo de caixa). Não confundir |
| toggle de usuário | existe em 2 telas com **2 APIs distintas** → risco de divergência de regra |
| `/admin/suporte` | redirect que existe **de propósito**: evita 404 do breadcrumb; `admin-breadcrumb.tsx:46` já tem `NON_LINKABLE = Set(["suporte"])` |
| rotas de fatura | 2 famílias: `/api/admin/faturas/*` e `/api/admin/invoices/*` |

> ⚠️ **Correção honesta:** a 1ª versão deste spec afirmou que `/admin/assinaturas` e
> `faturas/nova` **não estavam no menu**. Estão. O erro foi meu: procurei `admin-nav.tsx` em
> `src/components/admin/` e, ao não achar, concluí ausência em vez de procurar o arquivo real
> (`src/app/admin/(painel)/admin-nav.tsx`). Achado pela revisão adversarial e confirmado por mim.

### 2.6 O que já é bom — NÃO mexer

Impersonation (motivo obrigatório, 30min, expira, audita inclusive negativas); ficha do cliente
product-aware; wizard de onboarding com draft; **o dado clínico do Domus não é exposto**
(`clinic-usage/route.ts:46,80` devolve só agregados); health score; "O Pulso".

---

## 3. Decisões

**D1 — Normalizar leitura, não escrita.** As escritas já são coerentes. Criar uma função única de
derivação de estado e trocar os pontos de LEITURA. Não migrar dado, não alterar schema.

**D2 — Remover em vez de consertar** o que é esqueleto ou duplicata (§2.5). Aprovado pelo dono:
*"pode remover se for ficar melhor"*.
⚠️ **Premissa original REVOGADA:** eu havia escrito "confirmado que nenhuma das telas removidas
está no menu" — **era falso** (§2.5). Remover exige, junto:
- tirar o item de `admin-nav.tsx:55` e a entrada de `admin-breadcrumb.tsx:23` (assinaturas);
- tirar o `QuickLink` de `financeiro/page.tsx:185` (fatura fantasma);
- atualizar `admin-finance-roles.test.ts:164` (o `it.each` lê o arquivo do disco → apagar a página
  sem editar o teste quebra a suíte com ENOENT), e o teste de cobertura que conta `page.tsx`;
- manter `/admin/suporte` **como está** (existe para o breadcrumb não dar 404) — sai da lista.

**D2.1 — `/admin/assinaturas`: consolidar, não apagar cego.** Não é esqueleto: é lista navegável
com filtros, no menu. A remoção só compensa se `/clientes?status=` cobrir o uso. **Decisão adiada
para o início do Sprint 2**, com o dono olhando as duas telas lado a lado. Se ele usar, fica.

**D3 — Endurecer defaults ANTES de contratar.** Verificar contra o banco antes de aplicar: gate que
tranca o próprio dono é pior que o buraco (precedente de 2026-07-31, financeiro).

**D4 — Adiar estorno / editar fatura / pausar cobrança.** Com 8 faturas no histórico, UI própria
adiciona risco financeiro real para um caso resolvido no Asaas em 2 minutos. Revisitar com volume.

**D5 — Nenhum cron novo.** A Vercel já pausou o projeto por invocations. Conferência é **sob
demanda** (1 clique = 1 chamada) e o sinal de saúde vai no `health-alert` que já roda de hora em hora.

**D6 — Desconto pós-venda entra, mas por último.** Diverge da recomendação do Codex (que cortaria
tudo de operação comercial): renegociar preço é rotina comercial, não caso raro, e hoje exige SQL.

---

## 4. Sprints

Cada sprint tem tema único, entregável fechado e critério de pronto verificável.

> **Ordem revisada: 2 → 1 → 3 → 4 → 5 → 6.** O Sprint 2 passou para primeiro por recomendação da
> revisão: é o de maior impacto e menor risco, e mexer nas rotas de fatura ANTES evita que o
> Sprint 4 escreva auditoria sobre alvo móvel.

### Sprint 2 (PRIMEIRO) — Podar o que engana

Remover `/financeiro/faturas/nova` **e o endpoint** `/api/admin/faturas/create`, junto com o
`QuickLink` de `financeiro/page.tsx:185` que leva até ela; o `export-buttons.tsx` **de
`(painel)/relatorios/`** (⚠️ NUNCA `@/components/reports/export-buttons`, homônimo em uso);
o toggle de usuário duplicado (manter uma API só).
Atualizar `admin-finance-roles.test.ts:164` e o teste de contagem de páginas.
`/admin/assinaturas`: decidir com o dono (D2.1). `/admin/suporte`: **fica**.

**Pronto:** não existe caminho — nem por menu, nem por URL — para criar fatura sem cobrança; suíte
verde; nenhum link ou breadcrumb quebrado.

### Sprint 1 — Uma só verdade sobre "pago"

**Pré-requisito:** snapshot das 8 faturas (JSON no scratchpad) antes de qualquer correção — é a
única rede, já que o Asaas é produção sem sandbox.

Função pura única (ex.: `deriveInvoicePaymentState`) como fonte de verdade; aplicada em todas as
telas, KPIs, chips e no CSV; correção do chip "Aguardando NF" (`(painel)/financeiro/faturas/page.tsx:104`,
filtra `paymentConfirmed` **sem** filtro de status → conta cancelada/estornada); revisão das 8
faturas históricas contra o Asaas.

**Pronto:** a mesma fatura mostra o mesmo estado em toda tela; chip e KPI fecham entre si; as 8
faturas batem com o gateway. Teste table-driven sobre os estados (mutação é exagero para função
pura com 8 registros).

### Sprint 3 — Fechar a porta antes de contratar

`AdminUser.role` deixa de nascer com acesso global; `scopeAllCompanies` nasce `false`; gate de papel
em `/api/admin/clientes`, `/company-users` e `mark_paid`; gate nas telas de clientes, planos e logs.

**Pronto:** conta recém-criada não enxerga empresa alguma sem permissão explícita; **o dono continua
entrando normalmente** (verificado contra o banco antes de aplicar); testes cobrem leitura, export
e `mark_paid`.

### Sprint 4 — Rastro do que é sensível

`GlobalAudit` nos 6 exports (operador, filtros, quantidade, horário), em `cancel-charge`, na
reconciliação, nas mutações de usuário/permissão de tenant, e no **sucesso** do `support-redeem`.
Sem gravar PIX, token ou payload.

**Pronto:** nenhuma exportação ou mudança de permissão sem evento; negativas de autorização também
registradas.

### Sprint 5 — Ver o que o Asaas diz (e reparar o que se perdeu)

Botão **"Conferir no Asaas"** por fatura (1 clique = 1 chamada, `payments.get`); PIX completo com QR
e botão copiar; sinal de saúde do webhook no `health-alert` existente (último evento recebido /
processado / erro), alertando só após janela real de silêncio.

**Acrescentado pela revisão — reparo do passado.** Detectar e conferir não conserta o que já se
perdeu: o Asaas descarta evento não entregue em ~14 dias, e **a INV-000006 (R$ 5,45, paga em
17/06) segue `PENDING` até hoje** por isso. O botão "Conferir no Asaas" já resolve o caso quando
a divergência é de status; a fatia extra é deixá-lo **aplicar** a correção (com confirmação e
auditoria), não só exibir.

**Pronto:** qualquer fatura é conferida em um clique; divergência encontrada pode ser corrigida ali
mesmo, com trilha; se o webhook parar, chega alerta sem ninguém olhar log. **Nenhum cron novo.**

### Sprint 6 — Operação comercial

Desconto pós-venda (hoje só na criação — `api/admin/clientes/create/route.ts:342`); estender trial com N dias
(hoje fixo +7 — `(painel)/clientes/[id]/company-actions.tsx:194`); exibir último acesso (`lastLoginAt` já existe no schema,
nenhuma tela mostra).

**Pronto:** renegociar preço não exige tocar no banco; toda alteração de desconto fica auditada.

---

## 5. Fora de escopo (declarado)

Estorno, editar valor/vencimento de fatura, pausar cobrança (D4); LTV/ARPU/cohort/BI novo; funil nos
Interessados; SLA/atribuição no suporte; bulk actions; governança de equipe além do Sprint 3.

**Motivo comum:** custo e risco sem volume que justifique hoje. Revisitar quando houver ≥10 clientes
pagantes ou um segundo operador.

---

## 6. Riscos

### 6.1 O risco mais grave do plano — verificado, mas eu apontei para o lado ERRADO

🚨 **Correção da revisão:** eu tratei o `@default` como o perigo e o gate de papel como detalhe.
**Está invertido.** O `@default` comprovadamente não afeta linha existente (prova 1 abaixo); quem
pode trancar alguém é o **gate de papel** aplicado às telas e rotas. Mitigações obrigatórias no
Sprint 3, portanto:
- `SELECT id, email, role, active, scopeAllCompanies FROM "AdminUser"` **antes** de aplicar;
- **reusar `FINANCE_ROLES`/`isFinanceRole`** em vez de criar lista de papéis nova — foi a
  repetição de listas que gerou as duas convenções incompatíveis que este plano conserta;
- aplicar por rota/tela, medindo o efeito, não em lote.

O Sprint 3 trancaria o dono para fora? **Não, com o estado atual.** Três provas:

1. **`@default` do Prisma/Postgres só vale para INSERT novo.** `ALTER COLUMN SET DEFAULT` não
   reescreve linha existente — nenhuma conta atual é rebaixada.
2. **Estado real do banco (leitura, 2026-08-03): existe exatamente 1 conta admin** —
   `admin@pdvotica.com.br`, `role: SUPER_ADMIN`, `active: true`, `scopeAllCompanies: true`,
   MFA habilitado, último login 2026-08-02. Ela não é afetada por mudança de default.
3. **Os dois caminhos de verificação aceitam SUPER_ADMIN:** `requireAdminRole`
   (`admin-session.ts:76-80`) lê o papel do **JWT**; `requireCompanyScope` (`:104-115`) **revalida
   no banco**. Como o papel é `SUPER_ADMIN` nos dois, nenhum barra.

⚠️ Corrigido durante a verificação: o campo é `AdminUser.active`, **não** `isActive`
(`schema.prisma:2866`).

**Recuperação, se ainda assim algo travar:** a mudança é de `@default` + gates em código —
reversível por `git revert` + redeploy, sem migração de dado. E o papel de uma conta pode ser
corrigido direto no banco.

| risco | mitigação |
|---|---|
| Gate do Sprint 3 trancar o próprio dono | **VERIFICADO seguro** — ver §6.1 (1 conta, SUPER_ADMIN; `@default` não toca linha existente) |
| Normalização do Sprint 1 mudar número de KPI que o dono já conhece | a mudança É a correção; comunicar o que mudou e por quê |
| Remoção do Sprint 2 quebrar link não mapeado | confirmado que nada está no menu; rodar suíte + busca por referências |
| Sprint 5 aumentar invocations | ação sob demanda, sem cron; sinal usa o `health-alert` existente |
| Sprint 1 e 5 tocarem a mesma tela | Sprint 1 primeiro; 5 constrói sobre a regra já unificada |

---

## 7. Ordem e independência

Sprints 1→6 na ordem. Cada um é deployável sozinho e reversível por `git revert` (nenhum exige
migração de dado; o Sprint 3 mexe em `@default` do schema, que é aditivo).

**Se só um for feito:** Sprint 2, especificamente apagar a fatura fantasma — menor mudança, maior
impacto, porque hoje existe um caminho que parece cobrar o cliente e não cobra.

---

## 8. Nota do dono

Ao aprovar, o dono declarou que **trará ideias próprias depois de concluído este plano**, para
avaliarmos onde encaixam. Este documento é a base sobre a qual essas ideias serão posicionadas —
não um escopo fechado.
