# Plano B — Motor de cobrança + cortesia explícita

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o sistema saber o que cada cliente deve por período, emitir a cobrança do próximo ciclo sozinho, e representar cortesia como concessão de primeira classe em vez do bypass `accessEnabled`.

**Architecture:** Uma tabela nova (`BillingObligation`) declara *"a assinatura X deve o valor V pelo período [início, fim)"*, com sequência contígua por assinatura e unicidade garantida por constraint. Outra (`SubscriptionCourtesy`) registra concessões com prazo, motivo e autor. Um motor com pernas puras (relógio de ciclo, cortesia, preço) decide; a camada de I/O reserva a obrigação sob constraint e, **fora da transação**, chama o gateway. O disparo entra como fase nova no cron `invoice-reminders`, que hoje varre zero assinaturas todo dia. Antes de emitir qualquer centavo, um **modo sombra** grava o que *teria* feito.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Prisma + Neon Postgres, Vitest.

**Environment notes:**
- **NUNCA rodar `prisma migrate dev`, `prisma db push` ou `prisma migrate deploy`.** `db push` está bloqueado por política em `.claude/settings.json` (herança do incidente de banco de produção zerado). O `.env` local aponta para **PRODUÇÃO**.
- A migração deste plano é **escrita, não executada** pelo implementador: `.sql` versionado em `prisma/migrations/` + script `.cjs` idempotente em `scripts/`, seguindo o padrão de `scripts/apply-admin-notification-period-key.cjs` (mostra o host antes de escrever, observa o estado antes de agir). **Quem executa é o dono.**
- **NUNCA `git push`.** Deploy é decisão do dono.
- **O gateway Asaas é produção real, sem sandbox.** Nenhuma task deste plano pode emitir cobrança de verdade. A emissão real é a etapa 4 do rollout, executada pelo dono.
- Spec: `docs/superpowers/specs/2026-07-29-recorrencia-cobranca-carencia-design.md`.
- Depende do **Plano A** (`feat/recorrencia-cobranca`) estar mergeado — este plano assume `hasDispatchedNotice`, `isWriteRestricted` e a régua corrigida.

---

## Contexto que o implementador precisa

Hoje o sistema não tem onde escrever a frase *"a MedFacil deve R$ 89,90 pelo período de 09/09 a 09/10"*. Existe fatura (que só nasce quando alguém cria) e `Subscription.currentPeriodEnd` (que só avança quando alguém paga). Entre os dois não há nada declarando **o que é devido** — e é por isso que o mês 2 nunca é cobrado.

Dado de produção que dimensiona o problema: **16 assinaturas, zero com `asaasSubscriptionId`**, 8 faturas em todo o histórico, e duas delas (`INV-000003`/`INV-000004`) são duplicatas do mesmo período — prova de que a idempotência por advisory lock já falhou.

E `accessEnabled = true` em 14 das 17 empresas não é bug: é **cortesia que o dono concede** sendo improvisada no único mecanismo disponível — um booleano que significa "ignore tudo sobre cobrança".

### As três invariantes que este plano precisa respeitar

| # | Invariante | Por quê |
|---|---|---|
| **I1** | Ninguém é restringido sem ter sido cobrado | O gatilho é uma obrigação **emitida e vencida**, nunca uma data. Impede punir o cliente por falha nossa (caso Óticas Ultra: 3 meses sem nunca ter recebido fatura). |
| **I2** | Vencimento **grava estado**, nunca só calcula | O trigger de revisão do entitlement só dispara quando **uma coluna muda**. Bloqueio calculado em memória publicaria com a revisão de ontem, o Domus rejeitaria por revisão não-crescente, e a clínica seguiria escrevendo prontuário. |
| **I3** | Não restringe sem aviso **despachado** | Entregue no Plano A. Aqui só não pode ser quebrada. |

⚠️ **I2 vale para as tabelas novas.** Os triggers existentes observam só `Company` e `Subscription`. Se o acesso passar a depender de obrigação/cortesia, mudanças nelas alterariam o acesso sem tocar coluna publicável — a falha de I2 reaparecendo por outra porta.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `prisma/schema.prisma` | Modelos `BillingObligation`, `SubscriptionCourtesy` | Modificar |
| `prisma/migrations/<ts>_billing_obligations/migration.sql` | DDL aditiva + triggers de revisão | Criar |
| `scripts/apply-billing-obligations.cjs` | Aplicação cirúrgica e idempotente (roda o DONO) | Criar |
| `src/lib/billing-clock.ts` | **puro** — próximo período, contiguidade, calendário UTC | Criar |
| `src/lib/billing-courtesy.ts` | **puro** — cortesia vigente? disposição da obrigação | Criar |
| `src/lib/billing-obligation.ts` | **puro** — preço congelado, decisão sobre cobrança existente | Criar |
| `src/lib/effective-subscription.ts` | **puro + I/O fino** — assinatura efetiva, fail-closed | Criar |
| `src/services/billing-obligation.service.ts` | I/O — reserva sob constraint, gateway fora da tx | Criar |
| `src/services/billing-shadow.service.ts` | I/O — grava decisões do modo sombra | Criar |
| `src/services/invoice-reminders.service.ts` | Ganha a fase de geração | Modificar |
| `src/app/api/webhooks/asaas/route.ts` | Marca obrigação como paga | Modificar |
| `src/app/admin/(painel)/financeiro/...` | Tela: obrigações, cortesias, receita não faturada | Criar |

Cada task abaixo é commitável e testável sozinha.

---

## Task 1: Assinatura efetiva (pré-requisito de tudo)

Sem isto, um motor que itere "cada assinatura elegível" **cobra a mesma empresa duas vezes** — `Subscription` não tem unique em `companyId`, e hoje cinco fluxos resolvem a ambiguidade de cinco jeitos diferentes.

**Files:**
- Create: `src/lib/effective-subscription.ts`
- Test: `src/lib/effective-subscription.test.ts`

- [ ] **Step 1: Mapear os resolvedores atuais antes de escrever**

Run: `grep -rn "subscription.findFirst\|subscription.findMany" src/lib src/services src/app/api --include=*.ts | grep -v test | head -20`

Ler cada um e anotar a política. Já conhecidos: `subscription.ts:116-127` (mais recente, inclusive CANCELED), `internal/domus/plan-change/route.ts:148` (recusa se >1), `trial-conversion-charge.service.ts:121` (recusa se >1), `billing/checkout/route.ts:100` (só ACTIVE/TRIAL), `internal/domus/billing/route.ts:127` (409 se >1 não-cancelada).

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/lib/effective-subscription.test.ts`. A função é **pura** — recebe a lista de assinaturas e devolve a decisão:

```typescript
import { describe, it, expect } from "vitest";
import { resolveEffectiveSubscription } from "./effective-subscription";

const sub = (over: Partial<{ id: string; status: string; createdAt: Date }> = {}) => ({
  id: over.id ?? "s1",
  status: (over.status ?? "ACTIVE") as never,
  createdAt: over.createdAt ?? new Date("2026-01-01"),
});

describe("resolveEffectiveSubscription", () => {
  it("uma assinatura viva → é a efetiva", () => {
    const r = resolveEffectiveSubscription([sub()]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.subscription.id).toBe("s1");
  });

  it("ignora CANCELED ao escolher", () => {
    const r = resolveEffectiveSubscription([
      sub({ id: "morta", status: "CANCELED", createdAt: new Date("2026-06-01") }),
      sub({ id: "viva", status: "ACTIVE", createdAt: new Date("2026-01-01") }),
    ]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.subscription.id).toBe("viva");
  });

  it("nenhuma assinatura viva → none (não é erro, é ausência)", () => {
    expect(resolveEffectiveSubscription([sub({ status: "CANCELED" })]).kind).toBe("none");
  });

  it("DUAS vivas → ambíguo, NUNCA escolhe", () => {
    // Escolher "a mais recente" cobraria a assinatura errada, com valor e
    // plano errados. Fail-closed: não cobra e alerta o operador.
    const r = resolveEffectiveSubscription([
      sub({ id: "a", status: "ACTIVE" }),
      sub({ id: "b", status: "PAST_DUE" }),
    ]);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.ids.sort()).toEqual(["a", "b"]);
  });

  it("lista vazia → none", () => {
    expect(resolveEffectiveSubscription([]).kind).toBe("none");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/lib/effective-subscription.test.ts` → módulo não encontrado.

- [ ] **Step 4: Implementar**

Definir "viva" reusando `LIVE_STATUSES` de `src/lib/subscription.ts:26` — já verificado: é exatamente `["TRIAL","ACTIVE","PAST_DUE"]`, exportado, e travado por teste de caracterização que exige comprimento 3. Bate com os casos de teste acima (`PAST_DUE` viva, `CANCELED` morta). Reusar, não duplicar.

Retorno discriminado: `{kind:"ok",subscription} | {kind:"none"} | {kind:"ambiguous",ids}`.

- [ ] **Step 5: Rodar e ver passar.** `npx tsc --noEmit` limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/effective-subscription.ts src/lib/effective-subscription.test.ts
git commit -m "feat(cobranca): assinatura efetiva fail-closed em ambiguidade"
```

---

## Task 2: Relógio de ciclo (`billing-clock.ts`)

**Files:**
- Create: `src/lib/billing-clock.ts`
- Test: `src/lib/billing-clock.test.ts`

A aritmética atual (`src/lib/trial-conversion-charge.ts:59-74`) usa `setMonth`, que **desloca 31/01 para março**. Este módulo corrige isso e garante contiguidade.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { nextPeriod, isContiguous } from "./billing-clock";

const d = (s: string) => new Date(s + "T00:00:00.000Z");

describe("nextPeriod", () => {
  it("mensal: encadeia a partir do FIM do período anterior, nunca de now", () => {
    const p = nextPeriod({ previousEnd: d("2026-08-09"), cycle: "MONTHLY" });
    expect(p.periodStart.toISOString()).toBe(d("2026-08-09").toISOString());
    expect(p.periodEnd.toISOString()).toBe(d("2026-09-09").toISOString());
  });

  it("anual: um período de 12 meses, não 12 mensais", () => {
    const p = nextPeriod({ previousEnd: d("2026-02-24"), cycle: "YEARLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2027-02-24").toISOString());
  });

  it("fim de mês: 31/01 + 1 mês = 28/02 (não 03/03)", () => {
    // setMonth() ingênuo estoura para março. A âncora do ciclo é preservada.
    const p = nextPeriod({ previousEnd: d("2026-01-31"), cycle: "MONTHLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2026-02-28").toISOString());
  });

  it("ano bissexto: 31/01/2028 + 1 mês = 29/02/2028", () => {
    const p = nextPeriod({ previousEnd: d("2028-01-31"), cycle: "MONTHLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2028-02-29").toISOString());
  });

  it("intervalo é semiaberto: o fim de um é o começo do próximo", () => {
    const p1 = nextPeriod({ previousEnd: d("2026-03-15"), cycle: "MONTHLY" });
    const p2 = nextPeriod({ previousEnd: p1.periodEnd, cycle: "MONTHLY" });
    expect(p2.periodStart.toISOString()).toBe(p1.periodEnd.toISOString());
  });
});

describe("isContiguous", () => {
  it("detecta buraco na sequência", () => {
    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
      { periodStart: d("2026-02-01"), periodEnd: d("2026-03-01") },
    ])).toBe(true);

    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
      { periodStart: d("2026-02-05"), periodEnd: d("2026-03-05") }, // buraco
    ])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Tudo em UTC (`Date.UTC`, `getUTC*`). Para a regra de fim de mês: se o dia-âncora não existe no mês destino, usar o **último dia** desse mês. Não usar `setMonth` cru.
- [ ] **Step 4: Rodar e ver passar.** Se algum caso de calendário falhar, **o teste está certo e a implementação errada** — não relaxar a expectativa.
- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-clock.ts src/lib/billing-clock.test.ts
git commit -m "feat(cobranca): relogio de ciclo contiguo, UTC e fim de mes"
```

---

## Task 3: Cortesia e disposição (`billing-courtesy.ts`)

**Files:**
- Create: `src/lib/billing-courtesy.ts`
- Test: `src/lib/billing-courtesy.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Cobrir, no mínimo:

| Caso | Esperado |
|---|---|
| cortesia vigente no `periodStart` | disposição `COURTESY` |
| cortesia expirada antes do `periodStart` | `CHARGE` |
| cortesia começa no meio do período | `CHARGE` — avaliada contra o `periodStart`, vale o período inteiro (spec §4.3) |
| plano com `priceMonthly = 0` | `INTERNAL` — **não** `COURTESY` (conta interna ≠ cortesia comercial; misturar faria a conta do dono virar "receita perdida") |
| sem cortesia, plano pago | `CHARGE` |
| cortesia sem data de fim | vigente (permanente, ex.: a ótica do dono) |

- [ ] **Step 2-4: Falhar, implementar, passar.**
- [ ] **Step 5: Commit** — `feat(cobranca): disposicao da obrigacao (cobrar/cortesia/interno)`

---

## Task 4: Migração — tabelas, constraints e triggers

⚠️ **Você ESCREVE a migração. Você NÃO a executa.** Quem roda é o dono.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_billing_obligations/migration.sql`
- Create: `scripts/apply-billing-obligations.cjs`

- [ ] **Step 1: Ler o padrão obrigatório**

Run: `sed -n '1,60p' scripts/apply-admin-notification-period-key.cjs`

O script novo **precisa** ter: `require("dotenv").config()`, impressão do **host** antes de qualquer escrita, verificação do estado ANTES (idempotência observada, não suposta), uso de `$executeRawUnsafe` via `PrismaClient` (o repo **não** tem o driver `pg`, e não há `psql` na máquina), e `IF NOT EXISTS` em tudo.

- [ ] **Step 2: Modelos no `schema.prisma`**

`BillingObligation`: `id`, `subscriptionId`, `sequence Int`, `periodStart`, `periodEnd`, `planId`, `cycle`, `priceCents Int`, `disposition` (CHARGE|COURTESY|INTERNAL|LEGACY_WAIVED), `state` (PLANNED|ISSUED|PAID|VOID), `voidReason String?`, `issuedAt DateTime?`, `dueAt DateTime?`, `paidAt DateTime?`, `invoiceId String?`, timestamps.
- `@@unique([subscriptionId, sequence])`
- `@@index([subscriptionId, state])`, `@@index([periodEnd])`

`SubscriptionCourtesy`: `id`, `subscriptionId`, `startsAt`, `endsAt DateTime?`, `reason String`, `grantedBy String`, `revokedAt DateTime?`, timestamps. `@@index([subscriptionId, startsAt])`.

`BillingShadowDecision` (**a terceira tabela — sem ela a Task 6 não tem onde escrever**): `id`, `subscriptionId`, `companyId`, `runAt`, `wouldCharge Boolean`, `wouldRestrict Boolean`, `periodStart`, `periodEnd`, `priceCents Int`, `disposition`, `note String?`. Descartável por natureza (`DROP` a qualquer momento) — é diagnóstico, não registro contábil. `@@index([runAt])`.

`Invoice.billingObligationId String?` — coluna **nullable** na tabela existente. **A Task 8 precisa dela** para achar a obrigação a partir da fatura paga. Aditiva, sem reescrever linha.

⚠️ **Dois eixos separados** (`disposition` × `state`), não um enum só — misturá-los torna "emitida e vencida" (a base de I1) não consultável.

- [ ] **Step 2b: As quatro flags do rollout (decidir AQUI, não na Task 7)**

O rollout (§7 da spec) tem quatro chaves independentes: **geração de obrigação**, **modo sombra**, **emissão real** e **enforcement**. Elas precisam existir antes da Task 7 tentar usá-las.

⚠️ **Não** reusar `invoiceGenerationEnabled` (`schema.prisma:4822`, default `false`, mora em `SaasEmailConfig`, editada numa tela chamada "E-mails"). E atenção ao detalhe que decide o desenho: `runInvoiceReminders` **retorna cedo** quando essa flag é falsa (`invoice-reminders.service.ts:32-36`). Se a fase nova ficar depois desse `return`, o motor inteiro fica gateado justamente pela flag que este plano rejeita.

Decidir entre acrescentar 4 booleanos a `SaasEmailConfig` (mesma migração) ou usar env vars, seguindo o precedente que já existe (`ENFORCE_SUSPENSION`, `SUBSCRIPTION_BYPASS_COMPANY_IDS`). Registrar a escolha no `.sql` ou no código, e **posicionar a fase nova ANTES do early return**.

- [ ] **Step 3: Triggers de revisão do entitlement (I2 — NÃO ESQUECER)**

Sem isto, mudar obrigação/cortesia altera o acesso **sem** bumpar a revisão, e o Domus rejeita a publicação por revisão não-crescente. O `.sql` precisa criar triggers nas duas tabelas chamando `bump_entitlement_revision(companyId)`.

⚠️ `BillingObligation` não tem `companyId` — a função precisa resolvê-lo via `subscriptionId`. Ler `prisma/migrations/20260719140000_entitlement_revision/migration.sql` e seguir o mesmo estilo.

- [ ] **Step 4: As dívidas de `DunningEvent` que o Plano A parcelou para cá**

Esta é a **única migração** dos três planos, então o que o Plano A adiou "para a fatia que carregar migração" vence aqui:

1. `@@index([companyId, action, status])` — a consulta de `hasDispatchedNotice` (que hoje roda no gate de ~15 rotas) não tem índice que a cubra.
2. **Coluna `stage Int?` + `@@unique([invoiceId, action, stage])`** — a spec §4.6.3 chama isso de "preferível" e o docblock de `hasDispatchedNotice` promete explicitamente esta fatia. Sem ela: os marcos 3 e 7 gravam ambos `REMINDER_EMAIL` e ficam **indistinguíveis para sempre**, e uma reexecução do cron grava linha duplicada sem nada para impedir.
   ⚠️ Nullable porque as linhas já gravadas pelo Plano A não têm `stage`. O unique parcial precisa tolerar isso (no Postgres, NULLs não colidem — o que aqui é conveniente, mas registre a consequência).
   ⚠️ Depois de criar a coluna, **atualizar `recordDunningNotice`** para gravá-la, e considerar apertar `hasDispatchedNotice` para consultar por `stage` em vez de por `action` (mais preciso; a `action` era o substituto na ausência da coluna).
3. Declarar os 3 índices que existem **fisicamente** desde 2026-03 (`companyId_createdAt`, `invoiceId`, `status`) e nunca entraram no modelo — o schema está dessincronizado do banco, e uma introspecção futura acusaria drift.

- [ ] **Step 5: Escrever o script de aplicação**

Idempotente, com verificação ANTES e DEPOIS, e **duas provas em transação com `ROLLBACK`** — o script é o único lugar onde elas podem existir, porque mock de Prisma não executa constraint nem trigger:

1. **Prova da unicidade:** inserir duas linhas com o mesmo `(subscriptionId, sequence)`, exigir que a segunda falhe.
2. **Prova da I2 (a mais importante):** ler a revisão de entitlement de uma empresa, inserir/alterar uma obrigação dela, reler a revisão e **exigir que tenha aumentado**. Sem isso, o trigger é suposto e não provado — e I2 falhando em silêncio significa clínica escrevendo prontuário achando-se bloqueada.

Ambas dentro de transação revertida, para não deixar lixo em produção. (Precedente: o script da migração `0050` do Domus provou a imutabilidade da trilha exatamente assim.)

- [ ] **Step 6: Gerar os tipos do Prisma (necessário para as tasks seguintes)**

Run: `npx prisma generate`
Expected: exit 0.

🔑 **Isto NÃO toca o banco.** `prisma generate` lê apenas o `schema.prisma` e escreve o client tipado — verificado neste repo. É o que permite às Tasks 5-8 compilar e testar contra `BillingObligation`/`SubscriptionCourtesy` **antes** de a migração ser aplicada: os testes usam mocks, e mock não precisa que a tabela exista. Sem este passo, as tasks seguintes não compilam.

⚠️ Corolário: enquanto a migração não for aplicada pelo dono, qualquer código que **realmente consulte** essas tabelas falha em runtime contra o banco. Por isso o motor nasce desligado por flag (Task 7) e o modo sombra (Task 6) vem antes da emissão real.

- [ ] **Step 7: Verificar que NÃO executou nada no banco**

Run: `git status --short` e confirmar que só há arquivos novos/modificados. **Não rode `scripts/apply-billing-obligations.cjs`.**

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ scripts/apply-billing-obligations.cjs
git commit -m "feat(cobranca): migracao das obrigacoes e cortesias (NAO aplicada)

Aditiva: 2 tabelas novas, indices, e triggers de revisao de entitlement
nas duas (I2 — senao o Domus rejeita a publicacao por revisao antiga).
Aplicacao e do dono, via script cirurgico."
```

---

## Task 5: Serviço de obrigação

**Files:**
- Create: `src/services/billing-obligation.service.ts`
- Test: `src/services/billing-obligation.service.test.ts`

Padrão de duas fases, já provado em `trial-conversion-charge.service.ts`: **fase 1** decide e reserva sob transação; **fase 2** fala com o gateway **fora** da transação.

- [ ] **Step 1: Ler o precedente** — `sed -n '80,290p' src/services/trial-conversion-charge.service.ts`.

- [ ] **Step 2: Testes** cobrindo:

| Caso | Esperado |
|---|---|
| assinatura sem obrigação nenhuma | cria a `sequence = 1` |
| já existe obrigação do período | **não** cria outra (idempotente pela constraint) |
| duas execuções concorrentes | **uma** obrigação (simular `P2002` e tratar como "já existe") |
| cortesia vigente | obrigação `COURTESY`, **nenhuma** chamada ao gateway, nenhum e-mail |
| plano de preço zero | `INTERNAL`, sem cobrança |
| empresa ambígua | não cobra, sinaliza (fail-closed) |
| falha do gateway | obrigação permanece `PLANNED`, não vira `ISSUED` |

- [ ] **Step 3-4: Falhar, implementar, passar.**

⚠️ Reusar `resolveConversionPriceCents` e `decideOnExistingCharge` de `src/lib/trial-conversion-charge.ts`. ⚠️ **Não** reemitir sozinho cobrança `CANCELED`/`REFUNDED` — sinalizar ao operador (spec §4.2).
⚠️ **Armadilha herdada:** `ensureInvoiceCharge` roda o sync nativo quando existe `asaasSubscriptionId` e, se o sync não produzir `paymentUrl`, **cai no caminho standalone e cria uma segunda cobrança** (`invoice-charge.service.ts:73-85`). O motor deve **excluir** assinaturas com `asaasSubscriptionId`.

- [ ] **Step 5: Commit** — `feat(cobranca): servico de obrigacao com idempotencia por constraint`

---

## Task 6: Modo sombra

**Files:**
- Create: `src/services/billing-shadow.service.ts`
- Test: correspondente

Sem sandbox no gateway, esta é a única forma honesta de validar o motor. Grava em **artefato próprio e descartável** (`BillingShadowDecision`) — **nunca** em `BillingObligation`, senão o modo sombra congelaria preço, plano e sequência reais, e ao ligar a emissão o sistema cobraria decisões tomadas dias antes.

- [ ] Registrar por assinatura: o que teria sido criado (período, valor, disposição) e o que teria sido restringido.
- [ ] Assumir honestamente o que **não** prova: gateway, e-mail, webhook e concorrência só são exercitados na emissão real.
- [ ] Commit — `feat(cobranca): modo sombra grava decisoes sem emitir nada`

---

## Task 7: Ligar no cron

**Files:**
- Modify: `src/services/invoice-reminders.service.ts`

- [ ] **Step 1:** Acrescentar a fase de geração **antes** das fases atuais, para que a fatura recém-criada já seja pega pelo lembrete do mesmo tick.
- [ ] **Step 2:** Teto de **uma obrigação por assinatura por rodada** (recuperação de backlog gradual e observável, não avalanche).
- [ ] **Step 3: Flags separadas** — geração, sombra, emissão real e enforcement são chaves **independentes**, cada uma ligando/desligando sozinha. **Não** pendurar em `invoiceGenerationEnabled`: ela tem default `false`, mora em `SaasEmailConfig` e é editada numa tela intitulada "E-mails" — usá-la transformaria um botão de e-mail em "desligar o faturamento".
- [ ] **Step 4:** Detector de descontinuidade (buraco na sequência = alarme), usando `isContiguous` da Task 2.
- [ ] **Step 5: Commit** — `feat(cobranca): motor de obrigacoes no cron invoice-reminders`

---

## Task 8: Webhook marca a obrigação como paga

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`

- [ ] Ao confirmar pagamento, marcar a obrigação correspondente como `PAID` com `paidAt`.
- [ ] **Arbitragem de evento atrasado:** o webhook hoje rebaixa por qualquer fatura não-manual vencida (`route.ts:497`). Com várias tentativas por obrigação, um `PAYMENT_OVERDUE` atrasado de tentativa cancelada pode rebaixar quem já pagou. → Arbitrar **pelo estado da obrigação**: tentativa cancelada ou obrigação quitada não controla acesso.
- [ ] Teste de evento fora de ordem.
- [ ] Commit — `fix(cobranca): webhook arbitra pelo estado da obrigacao`

---

## Task 9: Recalcular obrigação não emitida quando o contrato muda

Spec §4.1.2 e §4.1.3. Sem isto, a emissão antecipada cria janelas de incoerência.

**Files:**
- Modify: `src/app/api/admin/clientes/[id]/actions/route.ts` (troca de plano em `:130`, extensão de trial em `:84`)
- Modify: `src/lib/domus-plan-change/deps.ts` (`:324`)

- [ ] **Troca de plano:** obrigação ainda `PLANNED` é **recalculada** (preço e plano novos). Obrigação já `ISSUED` é anulada e reemitida, **ou** mantida com o preço antigo por decisão explícita registrada em `voidReason`. "Preço congelado" vale a partir da **emissão**, não da criação.
- [ ] **Extensão de trial:** hoje só altera `trialEndsAt`, sem tocar em fatura. Se a obrigação do período seguinte já foi emitida, a extensão passaria a cobrar dias que voltaram a ser gratuitos → **recalcular ou anular** a obrigação não paga do período afetado.
- [ ] Testes dos dois caminhos, incluindo o caso "já emitida" (que exige decisão, não recálculo silencioso).
- [ ] Commit — `fix(cobranca): contrato que muda recalcula obrigacao nao emitida`

> Correção factual para quem for implementar: a troca de plano **não** emite cobrança imediata — faz `PUT /subscriptions/{id}` no Asaas, afetando só cobranças futuras (`domus-plan-change/deps.ts:230`, `lib/asaas.ts:95`), e downgrade hoje é recusado com 501 (`internal/domus/plan-change/route.ts:189`).

---

## Task 10: Tela de cobrança e cortesia

⚠️ **Esta task é a menos especificada do plano.** Se ao chegar aqui as decisões abaixo ainda estiverem abertas, **pare e planeje a tela separadamente** em vez de improvisar — é a única task que expõe dado financeiro e permite conceder benefício.

**Files:**
- Create: rota sob `src/app/admin/(painel)/financeiro/` (definir o caminho exato antes de codar)

- [ ] **Step 1: Decidir o gate ANTES de escrever a tela.** 🚨 `requireSupportScope` **não checa papel** — `AdminUser.role` tem default `SUPPORT` e `scopeAllCompanies` default `true`. Uma tela que mostra receita e **concede cortesia** (ou seja, dá dinheiro) precisa de gate próprio de papel, não do gate de escopo. Ver a memória `admin-gates-scope-vs-role`. Escolher e justificar no código.
- [ ] **Step 2: Ler a estrutura existente** — `ls src/app/admin/\(painel\)/financeiro/` e seguir o padrão de uma tela vizinha (server component + client component, `AdminStatusBadge`, etc.).
- [ ] **Step 3:** Obrigações por assinatura: período, disposição, estado, valor.
- [ ] **Step 4:** Conceder/revogar cortesia com **prazo, motivo e autor**. A interface **arredonda a data para o limite do ciclo** e mostra a data efetiva antes de confirmar (spec §4.3) — cortesia parcial de período está fora de escopo.
- [ ] **Step 5:** **Receita não faturada** somada — responde "quanto de cortesia eu dei este mês".
- [ ] **Step 6:** Relatório do modo sombra.
- [ ] ⚠️ As telas leem a **obrigação**, não `currentPeriodEnd` (que diverge em cortesia e em `mark_paid` — dívida assumida na spec §8.2).
- [ ] Commit — `feat(cobranca): tela de obrigacoes, cortesias e receita nao faturada`

---

## Task 11: Verificação completa (OBRIGATÓRIA)

- [ ] `npx tsc --noEmit` → 0 erros.
- [ ] `npx vitest run` → tudo verde. Baseline com `git stash -u` (o `-u` é obrigatório: sem ele os arquivos novos não são guardados e a baseline falha por import não resolvido).
- [ ] `npm run build` → **exit code 0**. ⚠️ O log emite um erro de pré-renderização (`/api/dashboard/onboarding-status` usa `headers`) que é **ruído pré-existente** — confirme pelo exit code, não pelo texto.
- [ ] **Sabotagem de cada invariante**, conferindo no símbolo real com `grep` antes de concluir:
  1. Remover o `&& noticeDispatched` do gate → teste de "sem aviso" falha.
  2. Trocar `novoPeriodStart = periodEnd anterior` por `now` → teste de contiguidade falha.
  3. Fazer cortesia emitir fatura → teste de cortesia falha.
  4. Escolher a assinatura "mais recente" em vez de falhar na ambiguidade → teste de `resolveEffectiveSubscription` falha.

⚠️ **A I2 não é sabotável por teste unitário** — mock de Prisma não executa trigger. A prova dela vive na sonda em transação revertida dentro de `scripts/apply-billing-obligations.cjs` (Task 4, Step 5), e só roda quando o **dono** executa o script. Registrar isso no resumo em vez de fingir cobertura.
- [ ] Commit final.

⚠️ **NÃO fazer `git push`.** ⚠️ **NÃO rodar a migração.**

---

## O que este plano NÃO faz

- Não liga enforcement por coorte nem aposenta `accessEnabled` (Plano C).
- Não liga a recorrência nativa do Asaas — bloqueada por três defeitos próprios (período não avança sem Invoice local; o sync inventa mês-calendário até para ciclo anual; e só importa `PENDING`/`OVERDUE`, ignorando pagamento confirmado).
- Não unifica `currentPeriodEnd` com o ledger (dívida assumida, spec §8.2) — o campo **vai divergir** da obrigação em cortesia (não cria fatura, ninguém avança o campo) e em `mark_paid` (ativa sem renovar período). O gate fica correto; telas antigas e o canal do Domus podem exibir período vencido para cliente em dia. Por isso a Task 10 lê a obrigação.
- Não faz proration nem cortesia parcial de período (§4.3: arredonda para o limite do ciclo).
- Não emite nenhuma cobrança real: a emissão é a etapa 4 do rollout, executada pelo dono.
- Não corrige o "adiado para sempre" silencioso herdado do Plano A (assinatura sem fatura-âncora nunca vira suspensível e ninguém é avisado). Verificado em prod 2026-07-29: cenário inexistente hoje (0 faturas sem `dueDate`, 0 assinaturas em atraso).
