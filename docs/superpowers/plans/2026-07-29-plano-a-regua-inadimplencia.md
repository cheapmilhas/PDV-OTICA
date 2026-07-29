# Plano A — Régua de inadimplência honesta

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a régua de inadimplência cumprir o que promete — cliente continua gravando durante os avisos, é restringido só no marco final, e nunca é restringido sem que um aviso tenha sido efetivamente despachado.

**Architecture:** Três mudanças coordenadas em código puro, sem tabela nova e sem migração. (1) `checkSubscription` deixa de devolver `readOnly` no primeiro dia de `PAST_DUE`, passando a devolvê-lo só a partir do marco de restrição. (2) `nextDunningStage` deixa de pular marcos, exigindo execuções distintas. (3) O cron de dunning passa a registrar cada aviso em `DunningEvent` (tabela que já existe no banco e nunca foi usada) e só avança a régua quando o aviso foi de fato despachado.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Prisma + Neon Postgres, Vitest.

**Environment notes:**
- **NÃO** rodar `prisma migrate dev`, `prisma db push` nem qualquer comando que escreva no banco. O `.env` local aponta para **PRODUÇÃO**. Este plano não tem migração: `DunningEvent` já existe no banco desde a migração `20260326_sprint1_saas_admin_evolution`.
- **NÃO** fazer `git push`. Push na `main` dispara deploy de produção; é decisão do dono.
- Este plano altera comportamento de **clientes reais em produção** (as óticas ativas). Por isso ele é deployado sozinho, antes do motor de cobrança (Planos B e C).
- Spec: `docs/superpowers/specs/2026-07-29-recorrencia-cobranca-carencia-design.md` (§4.6).

---

## Contexto que o implementador precisa

Hoje, quando uma fatura vence, o webhook do Asaas move a assinatura para `PAST_DUE` e grava `pastDueSince`. A partir daí:

- `checkSubscription` (`src/lib/subscription.ts:204-218`) devolve `readOnly: true` **imediatamente**, e `requireWriteAccess` (`:272-286`) bloqueia toda escrita. O cliente para de trabalhar no dia do vencimento.
- O cron `dunning` (`src/app/api/cron/dunning/route.ts`, diário às 8h) envia avisos nos marcos 3/7/14 e suspende aos 14 — ou seja, **avisa alguém que já está travado**.
- `nextDunningStage` (`src/lib/dunning.ts:25-33`) devolve o **maior** marco atingido, não todos os pendentes. Se o cron encontra o cliente com 14 dias de atraso e nada avisado, manda **um** aviso e, na mesma iteração do loop, suspende (`route.ts:111` reatribui `lastStage` antes de `:145` lê).

O objetivo é inverter isso: **avisar enquanto o cliente ainda trabalha, e só restringir depois de ter avisado de verdade.**

Para clínica (`VIS_MEDICAL`), `readOnly` vira `writeAllowed: false` no Domus via `src/lib/entitlement-projection.ts:52` — então esta mudança também adia a perda de escrita de prontuário. A leitura nunca é afetada no Domus: `writeAllowed` é o único campo que o guard de lá lê.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/dunning.ts` | Régua pura: marcos, decisão de suspender/cancelar | Modificar |
| `src/lib/dunning.test.ts` | Testes da régua pura | Modificar (casos existentes mudam de expectativa) |
| `src/lib/subscription.ts` | Gate de acesso | Modificar (`:204-218`) |
| `src/lib/subscription.test.ts` | Caracterização de `LIVE_STATUSES` | Modificar (acrescentar casos) |
| `src/lib/__tests__/subscription.test.ts` | ⚠️ Trava o comportamento ANTIGO (`PAST_DUE ⇒ readOnly` no dia 2) | Modificar — 3 casos invertem de propósito |
| `src/lib/subscription-grace.ts` | **NOVO** — decisão pura "vencido há N dias já restringe?" | Criar |
| `src/lib/subscription-grace.test.ts` | **NOVO** — testes da decisão pura | Criar |
| `src/services/dunning-event.service.ts` | **NOVO** — grava a trilha de comunicação em `DunningEvent` | Criar |
| `src/services/dunning-event.service.test.ts` | **NOVO** — testes da trilha | Criar |
| `src/app/api/cron/dunning/route.ts` | Orquestra a régua | Modificar |

---

## Task 1: Decisão pura de restrição (`subscription-grace.ts`)

Extrai para função pura a pergunta "uma assinatura `PAST_DUE` com N dias de atraso já perde a escrita?". Hoje essa decisão está implícita (é sempre "sim"); vira explícita e testável.

**Files:**
- Create: `src/lib/subscription-grace.ts`
- Test: `src/lib/subscription-grace.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/subscription-grace.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isWriteRestricted, WRITE_RESTRICTION_DAY } from "./subscription-grace";

describe("isWriteRestricted", () => {
  it("no dia do vencimento (0 dias) → NÃO restringe: o cliente segue trabalhando", () => {
    expect(isWriteRestricted(0)).toBe(false);
  });

  it("durante os avisos (3, 7, 13 dias) → NÃO restringe", () => {
    expect(isWriteRestricted(3)).toBe(false);
    expect(isWriteRestricted(7)).toBe(false);
    expect(isWriteRestricted(13)).toBe(false);
  });

  it("no marco final (14 dias) → restringe", () => {
    expect(isWriteRestricted(14)).toBe(true);
  });

  it("depois do marco final → segue restrito", () => {
    expect(isWriteRestricted(30)).toBe(true);
  });

  it("dias negativos (relógio torto / webhook adiantado) → NÃO restringe", () => {
    expect(isWriteRestricted(-1)).toBe(false);
  });

  it("o marco de restrição é o mesmo da suspensão da régua (14)", () => {
    expect(WRITE_RESTRICTION_DAY).toBe(14);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/subscription-grace.test.ts`
Expected: FAIL — `Failed to resolve import "./subscription-grace"`.

- [ ] **Step 3: Implementar**

Criar `src/lib/subscription-grace.ts`:

```typescript
import { SUSPEND_DAYS } from "@/lib/dunning";

/**
 * Dia de atraso a partir do qual a ESCRITA é restrita.
 *
 * 🔑 É o mesmo marco da suspensão da régua (`SUSPEND_DAYS`), de propósito: são a
 * mesma decisão vista de dois lugares. Duplicar o número aqui faria a régua e o
 * gate divergirem no dia em que alguém mudasse só um dos dois.
 *
 * ANTES desta entrega o gate restringia no dia 0 (todo `PAST_DUE` era readOnly),
 * de modo que os avisos de 3/7/14 chegavam a quem já não conseguia trabalhar.
 * Ver spec 2026-07-29 §4.6.1.
 */
export const WRITE_RESTRICTION_DAY = SUSPEND_DAYS;

/**
 * A escrita já está restrita para quem está `daysOverdue` dias em atraso?
 *
 * Pura de propósito: é a regra de negócio que decide se um cliente inadimplente
 * pode continuar operando, e precisa ser testável sem banco.
 */
export function isWriteRestricted(daysOverdue: number): boolean {
  return daysOverdue >= WRITE_RESTRICTION_DAY;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/subscription-grace.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscription-grace.ts src/lib/subscription-grace.test.ts
git commit -m "feat(cobranca): decisao pura de restricao de escrita por dias de atraso"
```

---

## Task 2: `checkSubscription` para de restringir no vencimento

**Files:**
- Modify: `src/lib/subscription.ts:204-218`
- Test: `src/lib/subscription.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/subscription.test.ts`, acrescentar `resolvePastDueAccess` ao import que **já existe** no topo do arquivo (`import { LIVE_STATUSES } from "./subscription";` → `import { LIVE_STATUSES, resolvePastDueAccess } from "./subscription";`) e acrescentar o bloco ao final, mantendo o conteúdo atual:

```typescript
describe("resolvePastDueAccess", () => {
  it("recém-vencido (0 dias) → pode LER e ESCREVER, com aviso", () => {
    const r = resolvePastDueAccess(0);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("durante os avisos (7 dias) → ainda escreve", () => {
    expect(resolvePastDueAccess(7).readOnly).toBe(false);
  });

  it("no marco final (14 dias) → perde a escrita, mantém a leitura", () => {
    const r = resolvePastDueAccess(14);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(true);
  });

  it("a mensagem muda de tom entre avisar e restringir", () => {
    expect(resolvePastDueAccess(3).message).not.toBe(resolvePastDueAccess(14).message);
  });

  it("a mensagem sempre informa os dias de atraso", () => {
    expect(resolvePastDueAccess(9).message).toContain("9");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/subscription.test.ts`
Expected: FAIL — `resolvePastDueAccess is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Em `src/lib/subscription.ts`, adicionar o import no topo (junto dos outros):

```typescript
import { isWriteRestricted } from "@/lib/subscription-grace";
```

Adicionar a função pura logo ANTES de `export async function checkSubscription` (por volta da linha 40):

```typescript
/**
 * Decide o acesso de quem está em PAST_DUE, a partir dos dias de atraso.
 *
 * 🔑 MUDANÇA DE SEMÂNTICA (spec 2026-07-29 §4.6.1): antes, todo PAST_DUE era
 * `readOnly: true` já no dia do vencimento — os avisos de 3/7/14 chegavam a um
 * cliente que já não conseguia trabalhar. Agora a escrita sobrevive à janela de
 * avisos e cai só no marco final.
 *
 * A leitura NUNCA é cortada aqui: quem perde tudo é SUSPENDED, que é outro ramo.
 */
export function resolvePastDueAccess(daysOverdue: number): SubscriptionCheckResult {
  const restricted = isWriteRestricted(daysOverdue);
  const dias = `${daysOverdue} dia${daysOverdue === 1 ? "" : "s"}`;

  return {
    allowed: true,
    status: "PAST_DUE",
    readOnly: restricted,
    message: restricted
      ? `Pagamento pendente há ${dias}. O acesso de escrita está bloqueado até a regularização.`
      : `Pagamento pendente há ${dias}. Regularize para não perder o acesso de escrita.`,
    daysOverdue,
  };
}
```

Substituir o corpo do ramo `PAST_DUE` (hoje em `:204-218`) por:

```typescript
  if (subscription.status === "PAST_DUE") {
    const pastDueSince = subscription.pastDueSince ?? subscription.currentPeriodEnd ?? now;
    const daysOverdue = Math.ceil(
      (now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24)
    );

    return { ...resolvePastDueAccess(daysOverdue), planName };
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/subscription.test.ts`
Expected: PASS — os 3 testes de caracterização de `LIVE_STATUSES` seguem passando (esta mudança não altera quais status são "vivos") + os 5 novos.

- [ ] **Step 5: Atualizar os testes que travam o comportamento ANTIGO**

⚠️ Existe um **segundo** arquivo de teste de subscription — `src/lib/__tests__/subscription.test.ts` — que trava explicitamente o comportamento que esta task inverte. Ele vai falhar, e isso é **esperado**. Não "conserte" mudando o código de volta.

Run: `npx vitest run src/lib/__tests__/subscription.test.ts`
Expected: FAIL em 3 casos.

Atualizar cada um, preservando a intenção original (que era "o gate não suspende sozinho") e corrigindo só a expectativa de `readOnly`:

1. `"PAST_DUE recente (2d) → readOnly, NÃO suspende"` (linha ~49): renomear para `"PAST_DUE recente (2d) → AINDA ESCREVE, NÃO suspende"` e trocar `expect(r.readOnly).toBe(true)` por `expect(r.readOnly).toBe(false)`. Manter o `expect(subUpdateMany).not.toHaveBeenCalled()` — a propriedade "o gate não escreve status" continua valendo e é o ponto do teste.
2. `"PAST_DUE há MUITO tempo (40d) → continua PAST_DUE readOnly, NÃO suspende sozinho"` (linha ~59): 40 dias **passa** do marco de 14, então `readOnly` continua `true` aqui. Só ajustar o comentário para explicar que agora é a régua que decide, não o vencimento.
3. `"PAST_DUE (readOnly) BLOQUEIA escrita com 403"` (linha ~148, no bloco "contrato de segurança"): usa `mockPastDue(2)`. Trocar para `mockPastDue(20)` e renomear para `"PAST_DUE ALÉM do marco (20d) BLOQUEIA escrita com 403"`. **Acrescentar** o caso complementar, que é a nova garantia:

```typescript
  it("PAST_DUE dentro da janela de avisos (2d) PERMITE escrita", async () => {
    mockCompany();
    mockPastDue(2);
    await expect(requireWriteAccess("co1")).resolves.not.toThrow();
  });
```

- [ ] **Step 6: Verificar que nada mais quebrou**

Run: `npx vitest run src/lib/ src/services/`
Expected: PASS.
Se um teste de **entitlement** ou do **publisher** falhar, **pare e leia**: `writeAllowed` deriva de `readOnly`, então a mudança propaga para o cadeado do Domus por construção. É esperado que uma clínica recém-vencida passe a manter escrita até o marco — mas confirme que a falha é essa, e não outra coisa.

- [ ] **Step 7: Commit**

```bash
git add src/lib/subscription.ts src/lib/subscription.test.ts src/lib/__tests__/subscription.test.ts
git commit -m "feat(cobranca): PAST_DUE deixa de restringir escrita no vencimento

A restricao passa a valer so no marco final da regua (14 dias). Antes, os
avisos de 3/7/14 chegavam a um cliente que ja estava travado desde o dia 0.
Atualiza os testes que travavam o comportamento antigo."
```

---

## Task 3: A régua para de pular marcos

**Files:**
- Modify: `src/lib/dunning.ts:25-33`
- Test: `src/lib/dunning.test.ts`

⚠️ **Atenção:** os testes atuais em `dunning.test.ts` **documentam o pulo de marcos como comportamento esperado** ("PULA marcos: entrou com 10 dias, nada avisado → 7"). Eles vão ser reescritos: o comportamento antigo era o defeito.

- [ ] **Step 1: Reescrever os testes que mudam de expectativa**

Em `src/lib/dunning.test.ts`, **substituir** os dois casos de pulo:

```typescript
  it("PULA marcos: entrou com 10 dias, nada avisado → 7 (não 3)", () => {
    expect(nextDunningStage(10, null)).toBe(7);
  });

  it("PULA direto para 14: entrou com 20 dias, nada avisado → 14", () => {
    expect(nextDunningStage(20, null)).toBe(14);
  });
```

por:

```typescript
  it("NÃO pula marcos: entrou com 10 dias, nada avisado → 3 (o primeiro pendente)", () => {
    expect(nextDunningStage(10, null)).toBe(3);
  });

  it("NÃO pula marcos: entrou com 20 dias, nada avisado → 3, e sobe um por execução", () => {
    expect(nextDunningStage(20, null)).toBe(3);
    expect(nextDunningStage(20, 3)).toBe(7);
    expect(nextDunningStage(20, 7)).toBe(14);
    expect(nextDunningStage(20, 14)).toBeNull();
  });

  it("cliente que entra atrasado recebe os 3 avisos, um por execução do cron", () => {
    // Regressão da spec §4.6.2: antes, este cenário mandava UM aviso e suspendia
    // na mesma rodada. Agora exige 3 execuções antes de a régua permitir restringir.
    let last: number | null = null;
    const marcos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = nextDunningStage(40, last);
      if (s === null) break;
      marcos.push(s);
      last = s;
    }
    expect(marcos).toEqual([3, 7, 14]);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/dunning.test.ts`
Expected: FAIL — `expected 7 to be 3` no primeiro caso reescrito.

- [ ] **Step 3: Implementar**

Em `src/lib/dunning.ts`, substituir `nextDunningStage` (`:17-34`) por:

```typescript
/**
 * Próximo marco a notificar agora: o MENOR marco já atingido (`<= daysOverdue`)
 * que ainda não foi avisado (`> lastStage`). Retorna null se não há aviso novo.
 *
 * 🔑 NÃO pula marcos (spec 2026-07-29 §4.6.2). Antes devolvia o MAIOR marco
 * atingido, e um cliente encontrado já com 14 dias de atraso recebia UM aviso e
 * era suspenso na mesma execução do cron — a régua prometia três avisos e
 * entregava um. Agora cada execução sobe um degrau, então restringir exige
 * necessariamente execuções distintas.
 *
 * - Entrou com 10 dias e lastStage=0 → 3. Na execução seguinte → 7. Depois → 14.
 * - lastStage null trata-se como 0 (nenhum aviso ainda).
 */
export function nextDunningStage(daysOverdue: number, lastStage: number | null): number | null {
  const last = lastStage ?? 0;
  for (const stage of DUNNING_STAGES) {
    if (stage <= daysOverdue && stage > last) {
      return stage; // primeiro pendente — um degrau por execução
    }
  }
  return null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/dunning.test.ts`
Expected: PASS.

- [ ] **Step 5: Corrigir os testes do cron que semeiam 8 dias esperando o marco 7**

⚠️ `src/app/api/cron/dunning/route.test.ts` tem **três** casos que semeiam `pastDueSince: daysAgo(8)` com `lastDunningStage: null` e esperam `stage:7`. Com a régua nova, 8 dias sem nada avisado dá **stage 3**. Vão falhar, e é o comportamento correto.

Run: `npx vitest run src/app/api/cron/dunning/route.test.ts`
Expected: FAIL em ~3 casos, com `periodKey` recebendo `"stage:3"` onde se esperava `"stage:7"`.

Para cada um — `"aviso stage:7 → notifyCompany com INVOICE_OVERDUE..."` (~linha 122), `"notifyCompany lançando erro não quebra o cron"`, e o sub-caso A de `"todas as chamadas notifyCompany usam EXCLUSIVAMENTE channels:['email']"` — a correção é a mesma: para continuar exercitando o marco 7, semear `lastDunningStage: 3` (o marco anterior já avisado) em vez de `null`. Assim o cenário passa a ser "já avisou o 3, agora avisa o 7", que é o que a régua nova faz.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dunning.ts src/lib/dunning.test.ts src/app/api/cron/dunning/route.test.ts
git commit -m "fix(cobranca): regua de dunning para de pular marcos

Antes, cliente encontrado com 14 dias de atraso recebia UM aviso e era
suspenso na mesma rodada. Agora sobe um degrau por execucao, entao
restringir exige execucoes distintas."
```

---

## Task 4: Trilha de comunicação (`DunningEvent`)

`DunningEvent` existe no banco desde `20260326_sprint1_saas_admin_evolution` e **nenhum código a usa**. Ela passa a registrar cada tentativa de aviso, incluindo as que falharam ou foram suprimidas — é a evidência que autoriza restringir (invariante I3 da spec).

**Files:**
- Create: `src/services/dunning-event.service.ts`
- Test: `src/services/dunning-event.service.test.ts`

- [ ] **Step 1: Conferir o formato real do modelo (já verificado — confirme e siga)**

Run: `grep -n "model DunningEvent" -A 16 prisma/schema.prisma`
Expected: `companyId`, `invoiceId`, `ruleId?`, `action`, `channel`, `status`, `sentAt?`, `errorDetail?`, `createdAt`.

Run: `grep -n "enum DunningAction" -A 8 prisma/schema.prisma`
Expected exatamente: `REMINDER_EMAIL`, `REMINDER_WHATSAPP`, `WARNING_EMAIL`, `BLOCK_ACCESS`, `CANCEL_SUBSCRIPTION`.

🔑 **Não existe `NOTIFY`.** Os avisos da régua usam `REMINDER_EMAIL` nos marcos 3 e 7, e `WARNING_EMAIL` no marco 14 (o último aviso antes da restrição) — é o mapeamento que o código abaixo implementa. `BLOCK_ACCESS` fica reservado para quando a restrição de fato ocorre (fora desta task).

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/services/dunning-event.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordDunningNotice, hasDispatchedNotice, noticeActionFor } from "./dunning-event.service";

const create = vi.fn();
const findFirst = vi.fn();
const db = { dunningEvent: { create, findFirst } } as never;

beforeEach(() => {
  create.mockReset();
  findFirst.mockReset();
  create.mockResolvedValue({ id: "evt_1" });
});

describe("noticeActionFor", () => {
  it("marcos 3 e 7 são lembrete; o 14 é o último aviso antes de restringir", () => {
    expect(noticeActionFor(3)).toBe("REMINDER_EMAIL");
    expect(noticeActionFor(7)).toBe("REMINDER_EMAIL");
    expect(noticeActionFor(14)).toBe("WARNING_EMAIL");
  });
});

describe("recordDunningNotice", () => {
  it("aviso entregue → grava SENT com sentAt", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: true },
      { db }
    );
    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe("SENT");
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(data.companyId).toBe("c1");
  });

  it("aviso NÃO entregue → grava FAILED, sem sentAt", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: false, error: "smtp caiu" },
      { db }
    );
    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe("FAILED");
    expect(data.sentAt).toBeNull();
    expect(data.errorDetail).toBe("smtp caiu");
  });

  it("aviso suprimido → grava SKIPPED (não é falha, mas também não avisou)", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: false, skipped: true, error: "testMode" },
      { db }
    );
    expect(create.mock.calls[0][0].data.status).toBe("SKIPPED");
  });

  it("falha ao gravar a trilha NÃO derruba o cron", async () => {
    create.mockRejectedValue(new Error("banco fora"));
    await expect(
      recordDunningNotice({ companyId: "c1", invoiceId: "i1", stage: 3, delivered: true }, { db })
    ).resolves.toBe(false);
  });
});

describe("hasDispatchedNotice", () => {
  it("há evento SENT do marco → true", async () => {
    findFirst.mockResolvedValue({ id: "evt_1" });
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(true);
  });

  it("nenhum evento despachado → false (não pode restringir)", async () => {
    findFirst.mockResolvedValue(null);
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(false);
  });

  it("consulta exige status despachado, não qualquer evento", async () => {
    findFirst.mockResolvedValue(null);
    await hasDispatchedNotice("c1", 14, { db });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["SENT", "DELIVERED"] });
    expect(where.companyId).toBe("c1");
  });

  it("consulta o aviso DO MARCO pedido, não qualquer aviso", async () => {
    // Sem isto, um lembrete do dia 3 autorizaria a restrição do dia 14 —
    // I3 viraria "foi avisado alguma vez".
    findFirst.mockResolvedValue(null);
    await hasDispatchedNotice("c1", 14, { db });
    expect(findFirst.mock.calls[0][0].where.action).toBe("WARNING_EMAIL");

    findFirst.mockClear();
    await hasDispatchedNotice("c1", 3, { db });
    expect(findFirst.mock.calls[0][0].where.action).toBe("REMINDER_EMAIL");
  });

  it("erro de leitura → false (fail-closed: na dúvida, não restringe)", async () => {
    findFirst.mockRejectedValue(new Error("banco fora"));
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/services/dunning-event.service.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar**

Criar `src/services/dunning-event.service.ts`:

```typescript
import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "dunning-event" });

/**
 * Ação gravada na trilha, por marco da régua. Valores do enum `DunningAction`
 * (`prisma/schema.prisma:4693`): os marcos 3 e 7 são lembrete; o 14 é o ÚLTIMO
 * aviso antes de perder a escrita, e por isso é `WARNING_EMAIL`.
 */
export function noticeActionFor(stage: number): "REMINDER_EMAIL" | "WARNING_EMAIL" {
  return stage >= 14 ? "WARNING_EMAIL" : "REMINDER_EMAIL";
}

/** Status que provam que o aviso REALMENTE saiu. */
const DISPATCHED = ["SENT", "DELIVERED"] as const;

interface Deps {
  db?: {
    dunningEvent: {
      create: (args: never) => Promise<unknown>;
      findFirst: (args: never) => Promise<unknown>;
    };
  };
}

interface RecordInput {
  companyId: string;
  invoiceId: string;
  stage: number;
  delivered: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Registra uma tentativa de aviso da régua.
 *
 * 🔑 Grava TAMBÉM o que não foi entregue. A distinção entre `FAILED` (tentou e
 * falhou) e `SKIPPED` (nem tentou — modo de teste, sem destinatário, canal
 * desligado) é o que impede punir o cliente por problema nosso: foi exatamente o
 * caso da clínica MedFacil, cujo e-mail de cobrança foi redirecionado pelo modo
 * de teste e nunca chegou. Ver spec 2026-07-29 §4.6.2.
 *
 * Best-effort: falha ao gravar a trilha nunca derruba o cron — mas devolve
 * `false`, e quem chama decide (o cron NÃO avança a régua sem trilha).
 */
export async function recordDunningNotice(
  input: RecordInput,
  deps: Deps = {}
): Promise<boolean> {
  const db = deps.db ?? defaultPrisma;
  const status = input.delivered ? "SENT" : input.skipped ? "SKIPPED" : "FAILED";

  try {
    await db.dunningEvent.create({
      data: {
        companyId: input.companyId,
        invoiceId: input.invoiceId,
        action: noticeActionFor(input.stage),
        channel: "EMAIL",
        status,
        sentAt: input.delivered ? new Date() : null,
        errorDetail: input.error ?? null,
      },
    } as never);
    return true;
  } catch (error) {
    log.error("Falha ao gravar trilha de dunning", {
      companyId: input.companyId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Existe aviso EFETIVAMENTE DESPACHADO do marco `stage` para esta empresa?
 *
 * 🔑 O marco importa. `DunningEvent` não tem coluna `stage` (a spec §4.6.3 pediu
 * uma decisão aqui; sem migração nesta fatia, a resolução é a `action`): o marco
 * 14 grava `WARNING_EMAIL` e os marcos 3/7 gravam `REMINDER_EMAIL`. Consultar
 * "qualquer aviso" faria um lembrete do dia 3 autorizar a restrição do dia 14 —
 * I3 viraria "foi avisado alguma vez", que é bem mais fraco do que se pretende.
 *
 * 🔑 Fail-closed: erro de leitura devolve `false`. Na dúvida sobre ter avisado,
 * não se restringe o acesso do cliente.
 *
 * 📌 Limite aceito: sem `stage` nem unique na tabela, dois marcos que compartilham
 * a mesma `action` são indistinguíveis (hoje 3 e 7, ambos `REMINDER_EMAIL`) e uma
 * reexecução do cron grava linha duplicada. Nenhum dos dois afeta a decisão de
 * restringir, que só consulta `WARNING_EMAIL`. Coluna `stage` + unique
 * `(invoiceId, action, stage)` ficam para a fatia que carregar migração (Plano B).
 */
export async function hasDispatchedNotice(
  companyId: string,
  stage: number,
  deps: Deps = {}
): Promise<boolean> {
  const db = deps.db ?? defaultPrisma;

  try {
    const found = await db.dunningEvent.findFirst({
      where: {
        companyId,
        action: noticeActionFor(stage),
        status: { in: [...DISPATCHED] },
      },
      select: { id: true },
    } as never);
    return found !== null;
  } catch (error) {
    log.error("Falha ao ler trilha de dunning — assumindo NÃO avisado", {
      companyId,
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/services/dunning-event.service.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 6: Commit**

```bash
git add src/services/dunning-event.service.ts src/services/dunning-event.service.test.ts
git commit -m "feat(cobranca): trilha de comunicacao da regua em DunningEvent

Tabela existia no banco desde 2026-03 e nunca fora usada. Distingue
SENT/FAILED/SKIPPED: 'nem tentamos avisar' nao pode punir o cliente."
```

---

## Task 5: O cron passa a exigir aviso despachado antes de suspender

**Files:**
- Modify: `src/app/api/cron/dunning/route.ts`

- [ ] **Step 1: Ler o bloco atual antes de mexer**

Run: `sed -n '88,180p' src/app/api/cron/dunning/route.ts`

Identificar: o bloco de aviso (que chama `createCompanyNotification` e atualiza `lastDunningStage`) e o bloco de suspensão (guardado por `daysOverdue >= SUSPEND_DAYS && (lastStage ?? 0) >= SUSPEND_DAYS`).

- [ ] **Step 2: Registrar a trilha ao avisar**

No bloco de aviso, logo após o `if (ok) { ... }` que atualiza `lastDunningStage`, adicionar a gravação da trilha. O `invoiceId` sai da fatura vencida que originou o atraso — se o cron ainda não a carrega, buscar a mais antiga `PENDING`/`OVERDUE` não-manual da assinatura:

```typescript
            // Trilha de comunicação (spec §4.6.2): registra TAMBÉM o que não saiu.
            // `ok` vem de createCompanyNotification, que devolve booleano de
            // escrita real — este canal já era honesto e continua sendo a fonte.
            const overdueInvoice = await prisma.invoice.findFirst({
              where: {
                subscriptionId: sub.id,
                isManual: false,
                status: { in: ["PENDING", "OVERDUE"] },
                // `dueDate` é nullable no schema (:2735). Fatura sem vencimento
                // não pode ancorar trilha de ATRASO — não há do que estar
                // atrasada. (No Postgres, ASC já joga nulos para o fim, então o
                // filtro é sobre significado, não sobre ordenação.)
                dueDate: { not: null },
              },
              orderBy: { dueDate: "asc" },
              select: { id: true },
            });
            if (overdueInvoice) {
              await recordDunningNotice({
                companyId: sub.companyId,
                invoiceId: overdueInvoice.id,
                stage,
                delivered: ok,
                error: ok ? undefined : "createCompanyNotification retornou false",
              });
            }
```

Adicionar o import no topo do arquivo:

```typescript
import { recordDunningNotice, hasDispatchedNotice } from "@/services/dunning-event.service";
```

- [ ] **Step 3: Exigir trilha antes de suspender**

Alterar a condição do bloco de suspensão para consultar a trilha. Substituir:

```typescript
          if (
            daysOverdue >= SUSPEND_DAYS &&
            (lastStage ?? 0) >= SUSPEND_DAYS &&
            sub.status !== "SUSPENDED"
          ) {
```

por:

```typescript
          // I3 (spec §4.6.3): não restringe sem trilha de aviso DESPACHADO.
          // `lastDunningStage` sozinho não basta — ele avança com a notificação
          // in-app, e o cliente pode nunca ter recebido o e-mail (modo de teste,
          // provedor fora). Sem trilha, o cron adia e alerta, não pune.
          const podeRestringir =
            daysOverdue >= SUSPEND_DAYS &&
            (lastStage ?? 0) >= SUSPEND_DAYS &&
            sub.status !== "SUSPENDED";

          if (podeRestringir && !(await hasDispatchedNotice(sub.companyId, SUSPEND_DAYS))) {
            log.warn("Suspensão ADIADA: sem trilha de aviso despachado", {
              subscriptionId: sub.id,
              companyId: sub.companyId,
              daysOverdue,
            });
            summary.suspendDeferred++;
          } else if (podeRestringir) {
            // ⚠️ O corpo do `if` ORIGINAL (que suspende, audita e adiciona a
            // company em `toPublish`) entra AQUI, sem nenhuma alteração — só
            // muda a condição que o guarda. Não reescrever o corpo.
```

- [ ] **Step 4: Declarar o contador no resumo**

O `summary` é um **objeto literal** declarado em `src/app/api/cron/dunning/route.ts:69-76` (não uma interface). Acrescentar o campo junto do `cancelDeferred` que já existe, seguindo o padrão:

```typescript
      const summary = {
        total: overdue.length,
        noticeSent: 0,
        suspended: 0,
        suspendDeferred: 0,   // ← novo
        canceled: 0,
        cancelDeferred: 0,
        errors: 0,
      };
```

Com o campo inicializado em `0`, o uso vira `summary.suspendDeferred++` (sem o `?? 0` do trecho anterior). Ajustar o Step 3 conforme.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Estender o mock do Prisma no teste do cron (OBRIGATÓRIO — senão tudo quebra em silêncio)**

⚠️ O `vi.mock("@/lib/prisma")` em `src/app/api/cron/dunning/route.test.ts:18-30` mocka **apenas** `subscription` e `globalAudit`. A Task 5 acrescenta chamadas a `prisma.invoice.findFirst` e `prisma.dunningEvent.*`, que seriam `undefined` — o `try/catch` por assinatura engoliria o `TypeError`, virando `summary.errors++`, e os testes falhariam com mensagens que **não apontam para a causa**.

Substituir o corpo do mock por:

```typescript
  prisma: {
    subscription: {
      findMany: (...a: unknown[]) => subscriptionFindMany(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
    },
    globalAudit: {
      create: (...a: unknown[]) => globalAuditCreate(...a),
    },
    invoice: {
      findFirst: (...a: unknown[]) => invoiceFindFirst(...a),
    },
    dunningEvent: {
      create: (...a: unknown[]) => dunningEventCreate(...a),
      findFirst: (...a: unknown[]) => dunningEventFindFirst(...a),
    },
  },
```

Declarar os spies junto dos existentes, e dar default no `beforeEach` (fatura encontrada + aviso já despachado, que é o caminho feliz da maioria dos casos):

```typescript
const invoiceFindFirst = vi.fn();
const dunningEventCreate = vi.fn();
const dunningEventFindFirst = vi.fn();

// dentro do beforeEach existente:
invoiceFindFirst.mockResolvedValue({ id: "inv-1" });
dunningEventCreate.mockResolvedValue({ id: "evt-1" });
dunningEventFindFirst.mockResolvedValue({ id: "evt-1" }); // aviso já despachado
```

- [ ] **Step 7: Atualizar o teste de suspensão do cron**

`route.test.ts:189` (`"suspensão (>=14d, lastStage>=14) → ..."`) passa a depender da trilha. Com o default acima ele volta a passar sem mais edição.

E **acrescentar** o caso novo, que trava a invariante:

```typescript
it("sem trilha de aviso despachado → NÃO suspende, adia e contabiliza", async () => {
  // I3 (spec §4.6.3): 'nem tentamos avisar' não pode virar bloqueio.
  // Foi o caso da MedFacil — e-mail suprimido por testMode, cliente sem saber.
  prismaMock.dunningEvent.findFirst.mockResolvedValueOnce(null);
  // ...mesmo cenário do teste de suspensão (>=14d, lastStage>=14, PAST_DUE)
  const res = await GET(authedRequest());
  const body = await res.json();
  expect(body.suspended).toBe(0);
  expect(body.suspendDeferred).toBe(1);
});
```

Run: `npx vitest run src/app/api/cron/dunning/route.test.ts`
Expected: PASS, incluindo o caso novo.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/dunning/route.ts src/services/
git commit -m "feat(cobranca): cron so suspende com trilha de aviso despachado

Sem evidencia de que o aviso saiu, a suspensao e adiada e logada. Fecha o
caso MedFacil: email suprimido por testMode nao pode virar bloqueio."
```

---

## Task 6: Verificação completa (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Suíte completa**

Run: `npx vitest run`
Expected: todos passam.
⚠️ Este projeto tem falhas **pré-existentes** de testes de integração que exigem banco de teste. Para saber se uma falha é sua, compare com a baseline:

```bash
git stash -u && npx vitest run 2>&1 | tail -5 && git stash pop
```

🔑 O `-u` é obrigatório: sem ele os arquivos **novos** (`subscription-grace.ts`, `dunning-event.service.ts`) não são guardados, e a baseline falha por import não resolvido — dando a impressão de que a mudança quebrou tudo. Só falha NOVA conta.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 4: Verificação de sabotagem das invariantes**

Para cada uma, quebrar o código, confirmar que o teste falha, e desfazer:

1. Em `subscription-grace.ts`, trocar `>=` por `>` → `npx vitest run src/lib/subscription-grace.test.ts` deve FALHAR no caso de 14 dias.
2. Em `dunning.ts`, voltar `return stage` para o acúmulo em `candidate` → `npx vitest run src/lib/dunning.test.ts` deve FALHAR no caso "NÃO pula marcos".
3. Em `dunning-event.service.ts`, fazer `hasDispatchedNotice` devolver `true` no `catch` → `npx vitest run src/services/dunning-event.service.test.ts` deve FALHAR no caso fail-closed.

Confirmar a quebra **no símbolo real** (conferir com `grep` na linha alterada), não em comentário. Desfazer as três antes de seguir.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(cobranca): verificacao completa do plano A"
```

⚠️ **NÃO fazer `git push`.** O deploy desta fatia é decisão do dono, e ela muda comportamento de clientes reais.

---

## O que este plano NÃO faz

- Não cria tabela, não roda migração, não mexe em `accessEnabled`.
- Não cria obrigações de cobrança nem cortesia (Plano B).
- Não liga enforcement por coorte (Plano C).
- Não altera o webhook do Asaas.
- Não corrige o defeito de `nextDunningStage` para o caso de o cron ficar dias sem rodar: com a mudança, um cliente muito atrasado leva 3 execuções (3 dias) para chegar ao marco final. Isso é **desejado** — é o preço de garantir os três avisos.

## Efeito em clientes reais no dia do deploy (contar ao dono antes de subir)

Esta fatia sobe sozinha contra o parque de produção. O que muda para quem já está inadimplente:

| Situação atual | Antes | Depois |
|---|---|---|
| `PAST_DUE` há poucos dias | sem escrever | **volta a escrever** até o marco de 14 |
| `PAST_DUE` há mais de 14 dias, com `lastDunningStage = 14` | sem escrever | igual — segue restrito |
| `PAST_DUE` há mais de 14 dias, com `lastDunningStage` nulo | sem escrever, e seria suspenso na próxima rodada | **ganha ~3 dias** de trégua enquanto recebe os 3 avisos |
| Nunca cobrado (fatura nunca foi ao gateway) | — | sem mudança nesta fatia; é o Plano B que passa a cobrar |

Nenhum cliente **perde** acesso por causa deste deploy — o efeito é sempre no sentido de devolver escrita ou adiar restrição. É o lado seguro de errar.
