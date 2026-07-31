# Forja — Task 10: a tela de obrigações, cortesias e receita não faturada

> Painel adversarial rodado em 2026-07-31. **3 criativos × 3 críticos**, todos completaram.
> As três abordagens levaram objeção grave; duas foram declaradas FATAL.

## 🚨🚨 O ACHADO QUE VALE MAIS QUE A TASK INTEIRA

**O painel financeiro do super admin HOJE não tem gate de papel nenhum.**

Verifiquei linha a linha:
- `src/lib/admin-session.ts:70-74` — `requireAdmin()` só confere que existe sessão. **Nunca compara papel.**
- `src/app/admin/(painel)/financeiro/page.tsx:13` — chama `requireAdmin()` puro. O mesmo em `faturas/`, `inadimplencia/` e `faturas/[id]/`.
- `prisma/schema.prisma:2865` — `role AdminRole @default(SUPPORT)`.
- O layout `(painel)/layout.tsx` não tem gate. O `AdminSidebar` não esconde link por papel. `src/proxy.ts` deixa passar qualquer token com `payload.isAdmin`.

➡️ **Um `SUPPORT` — o papel DEFAULT — lê hoje a receita consolidada, os nomes dos clientes e a posição financeira de toda a operadora.**

Nas palavras do crítico de segurança: as três abordagens estavam *"construindo um cofre com fechadura biométrica encostado numa parede que já não tem porta"*.

**Isto é independente da Task 10 e deve ser consertado primeiro.** `requireAdminRole` já existe (`admin-session.ts:76-80`), compara o papel de verdade, e já é usado em 7 telas de `configuracoes/` — **é adoção, não construção.**

---

## Vereditos

| Abordagem | Segurança | Custo | Dados | Resumo |
|---|---|---|---|---|
| **A) MVP-first** — página lista, cortesia inline, sombra em JSON | FATAL | MENOR | **FATAL** | O detector de estorno marca toda cortesia como estorno, e `periodStart` no mês esconde a Atacadão (anual) por 11 meses |
| **B) User-first** — agenda de cortesias vencendo | SÉRIO | SÉRIO | **FATAL** | A regra de estorno é **impossível de implementar** |
| **C) Data-first** — reconciliação com denúncia de cobertura | MENOR | FATAL p/ agora | SÉRIO | Único reparável sem reescrever |

### Por que a (B) é impossível, não só ruim

A regra dela é *"há fatura `REFUNDED` e nenhuma `PAID` **posterior ao estorno**"*. **Verifiquei: `Invoice` não tem `refundedAt`.** Tem `issuedAt`, `dueDate`, `paidAt` — e o webhook grava só `{ status: "REFUNDED" }`, deixando o `paidAt` antigo intacto. **Não existe "posterior ao estorno"** — o instante do estorno não é registrado em lugar nenhum.

### O falso positivo que derruba (A) e (C): o conjunto vazio

Obrigação isenta (`COURTESY`/`INTERNAL`/`LEGACY_WAIVED`) **nasce `PAID` sem fatura nenhuma** (decisão da Task 5). Em lógica, `[].some(PAID)` é `false` e `[].every(REFUNDED)` é `true`.

➡️ As regras de (A) e (C) marcam **toda isenção como estorno**. A abordagem que existe para separar "renúncia deliberada" de "perda silenciosa" **funde as duas na própria regra**.

### O erro de 12× no KPI anual

A Atacadão é **anual, R$ 1.499**. Se estiver em cortesia:
- **(A)** `periodStart` no mês → R$ 1.499 em março, **R$ 0,00 nos outros 11 meses**. O dono abre em julho, vê zero, conclui que não há cortesia — enquanto uma de R$ 1.499 corre debaixo do nariz dele.
- **(B)** interseção com preço cheio → **R$ 1.499 em TODOS os 12 meses**. Somando o ano: R$ 17.988 de renúncia declarada sobre um contrato de R$ 1.499.

Nenhuma das três respondeu a pergunta de fundo: o KPI é **competência** (rateio) ou **caixa** (valor inteiro no mês do vencimento)?

---

## ✅ A REGRA DE ESTORNO CORRETA (melhor que as três — do crítico de dados)

**Perna 1 — divergência com vínculo:**
```
state = PAID
  E disposition = CHARGE           ← mata o falso positivo do conjunto vazio
  E existe ≥1 fatura vinculada     ← mata mark_paid e isenção
  E existe ≥1 fatura REFUNDED      ← evidência POSITIVA, não só ausência
  E NENHUMA fatura vinculada PAID  ← a reemissão legítima sai daqui
```
🔑 A diferença crítica: exigir evidência **positiva** de estorno, não só ausência de pagamento. E **não precisa de ordenação temporal** — logo não precisa do `refundedAt` inexistente.

**Perna 2 — estorno órfão (invisível às três):** fatura `REFUNDED` com `billingObligationId = null` e `isManual = false`. São as 8 históricas e tudo que o `updateMany` por `asaasPaymentId` tocar. **Nunca aparecem numa query que parte de `BillingObligation`.**

**Terceiro balde — indeterminado:** `PAID` + `CHARGE` + tem fatura + nenhuma `REFUNDED` + nenhuma `PAID`. É `mark_paid`, ponteiro torto. Rótulo honesto: *"quitada sem fatura paga — verificar"*.

**E o valor é por FATURA, não por obrigação:** uma obrigação com reemissão perdeu o valor de **uma** fatura, não o `priceCents` inteiro.

---

## Outros achados que valem para qualquer caminho

- **`COURTESY` grava PREÇO CHEIO, ignorando desconto** (`billing-obligation.ts:201-209`). `CHARGE` aplica `discountPercent`; `COURTESY` não. Cliente com 40% de desconto → o painel infla a renúncia em **67%**.
- **`_sum` vazio devolve `null`, e o repo inteiro usa `|| 0`** (`metrics/route.ts:273`, `finance/aggregate/route.ts:61`). Com o bootstrap pendente, a tela abriria dizendo **"Receita não faturada: R$ 0,00"** — afirmação positiva e **falsa**. O certo é *"sem obrigações apuradas neste período"*.
- **Lente de produto**: toda tela sob `/admin/financeiro` é product-aware (`getProductContext()` + `buildDashboardFilters()`). `billing_obligations` **não tem `companyId`** — o filtro tem que ir por `subscription.company`, e não existe fragmento pronto para isso.
- **`VOID` fora das somas.** Período anulado não renunciou receita.
- 🚨 **A REVOGAÇÃO é tão perigosa quanto a concessão, e nenhuma das três a tratou.** Revogar grava `revokedAt` → `resolveObligationDisposition` devolve `CHARGE` → `sweepOverdueObligations` carimba `pastDueSince` → `projectEntitlement` fecha `writeAllowed` no Domus. **Um clique pode parar prontuário médico em andamento.** Hoje `isEnforcementEnabledForCompany` exige allowlist explícita, então a bala está na agulha — mas é uma env var, e no dia em que for ligada, a revogação vira esse botão.
- **Nunca houve server action neste repo** (`grep '"use server"'` → zero arquivos). Toda a maquinaria de gate, teste e `GlobalAudit` é construída em route handlers.

---

## 💡 A proposta do crítico de custo (que eu considero a mais forte)

**A ordem está invertida.** O bootstrap está bloqueado; `billing_obligations` tem **0 linhas**. Construir a tela antes significa que cada decisão de UI é um **chute sobre dado que ninguém viu** — quantas obrigações por assinatura, se a `LEGACY_WAIVED` domina a lista, se a renúncia é R$ 300 ou R$ 3.000.

E o lugar certo talvez já exista: `clientes/[id]` **já tem uma aba "Assinatura"** que renderiza período e histórico. Obrigação é o período de uma assinatura. A pergunta *"a MedFacil está em cortesia até quando?"* é sobre a MedFacil — o dono já vai estar na tela dela.

Custo de um bloco na aba existente: **1 arquivo tocado, 0 rotas novas, 0 gates novos.**
