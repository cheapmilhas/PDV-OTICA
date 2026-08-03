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
| B | `paymentConfirmed === true` | coluna "Pago" da lista (`financeiro/faturas/page.tsx:290`), chips de etapa |
| C | `paidAt !== null` | "Pago em", coluna do CSV, janela dos KPIs de receita |
| D | união de C e B | guarda de cancelamento (`invoice-cancel-charge.service.ts:227`) |
| E | `paymentConfirmedAt === null` | seleção de lembretes (`invoice-reminders.service.ts:136`) |

**Choque visível:** `financeiro/faturas/page.tsx:279` (Status, usa A) e `:290` (Pago, usa B) na
MESMA linha → badge "Paga" ao lado de ícone "não pago". Atinge toda fatura legada, porque
`paymentConfirmed` tem `@default(false)`.

**Chip "Aguardando NF"** (`:104`) filtra `paymentConfirmed: true` **sem filtro de status** → conta
faturas canceladas/estornadas. Nunca fecha com o KPI "Faturas Pagas" (`:100`).

A divergência NÃO vem das escritas (webhook e `mark_paid` gravam os 4 campos juntos e coerentes) —
vem das **leituras não normalizadas** + dados legados.

### 2.2 Caminhos que enganam

- **`/admin/financeiro/faturas/nova`** cria fatura **sem falar com o Asaas, sem PIX e sem e-mail**
  ("fatura fantasma") e **sem gate de papel**. Não está no menu, mas é acessível por URL.
  O caminho correto é o botão "Nova Cobrança" (`/api/admin/charges` → `manual-charge.service.ts:78`).
- **Não existe "conferir ESTA fatura no Asaas"** — só um sync global.
- **PIX truncado em 30 chars** (`faturas/[id]/page.tsx:262`), sem QR e sem copiar → inútil na prática.

### 2.3 Defaults perigosos (bomba-relógio de contratação)

- `AdminUser.role @default(SUPPORT)` (`schema.prisma:2865`) + `scopeAllCompanies @default(true)`
  (`:2867`) → **conta nova enxerga a carteira inteira**.
- Sem gate de papel: `GET /api/admin/clientes`, `GET /api/admin/company-users` (dado pessoal de
  todos os tenants), `mark_paid` (`faturas/[id]/workflow/route.ts:31`).
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
| `/admin/assinaturas` | tela inteira **sem nenhuma ação**; redundante com `/clientes?status=`; não está no menu (só se auto-linka) |
| `/admin/financeiro/faturas/nova` | fatura fantasma (2.2); não está no menu |
| `relatorios/export-buttons.tsx` | componente **órfão**, não importado; duplica os ExportCards |
| toggle de usuário | existe em 2 telas com **2 APIs distintas** → risco de divergência de regra |
| `/admin/suporte` | só um redirect |
| rotas de fatura | 2 famílias: `/api/admin/faturas/*` e `/api/admin/invoices/*` |

### 2.6 O que já é bom — NÃO mexer

Impersonation (motivo obrigatório, 30min, expira, audita inclusive negativas); ficha do cliente
product-aware; wizard de onboarding com draft; **o dado clínico do Domus não é exposto**
(`clinic-usage/route.ts:46,80` devolve só agregados); health score; "O Pulso".

---

## 3. Decisões

**D1 — Normalizar leitura, não escrita.** As escritas já são coerentes. Criar uma função única de
derivação de estado e trocar os pontos de LEITURA. Não migrar dado, não alterar schema.

**D2 — Remover em vez de consertar** o que é esqueleto ou duplicata (§2.5). Aprovado pelo dono:
*"pode remover se for ficar melhor"*. Confirmado que nenhuma das telas removidas está no menu.

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

### Sprint 1 — Uma só verdade sobre "pago"

Função pura única (ex.: `deriveInvoicePaymentState`) como fonte de verdade; aplicada em todas as
telas, KPIs, chips e no CSV; correção do chip "Aguardando NF"; revisão das 8 faturas históricas
contra o Asaas.

**Pronto:** a mesma fatura mostra o mesmo estado em toda tela; chip e KPI fecham entre si; as 8
faturas batem com o gateway. Teste de mutação prova que a regra está travada.

### Sprint 2 — Podar o que engana

Remover: `/financeiro/faturas/nova` **e o endpoint** `/api/admin/faturas/create` (esconder link não
basta); `/admin/assinaturas`; `relatorios/export-buttons.tsx`; o toggle duplicado (manter uma API);
o redirect vazio `/admin/suporte`.

**Pronto:** não existe caminho para criar fatura sem cobrança; suíte verde; nenhum link quebrado.

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

### Sprint 5 — Ver o que o Asaas diz

Botão **"Conferir no Asaas"** por fatura (1 clique = 1 chamada, `payments.get`); PIX completo com QR
e botão copiar; sinal de saúde do webhook no `health-alert` existente (último evento recebido /
processado / erro), alertando só após janela real de silêncio.

**Pronto:** qualquer fatura é conferida em um clique; se o webhook parar, chega alerta sem ninguém
olhar log. **Nenhum cron novo.**

### Sprint 6 — Operação comercial

Desconto pós-venda (hoje só na criação — `clientes/create/route.ts:342`); estender trial com N dias
(hoje fixo +7 — `company-actions.tsx:194`); exibir último acesso (`lastLoginAt` já existe no schema,
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

| risco | mitigação |
|---|---|
| Gate do Sprint 3 trancar o próprio dono | verificar contas contra o banco ANTES de aplicar; precedente de 2026-07-31 |
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
