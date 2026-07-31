# Forja — I2: como o vencimento vira escrita de coluna

> Painel adversarial rodado em 2026-07-31, antes da Task 7. **3 criativos × 3 críticos**
> (o crítico de modelo de dados morreu por limite de sessão; os outros dois convergiram).
> Decisão do dono tomada sobre a síntese.

## O problema (provado por execução, não é hipótese)

A invariante **I2** diz: *"vencimento GRAVA ESTADO, nunca só calcula"*. Ela está violada por
construção: `dueAt` cruzar o passado é **o relógio andando, não coluna mudando**, e os 6
triggers de revisão de entitlement disparam só com `NEW.x IS DISTINCT FROM OLD.x`.

A função de restrição foi chamada 2× com o **mesmo estado de banco** (obrigação `ISSUED`,
`dueAt = 2026-08-09`, zero escrita entre as chamadas), variando só `now`:

```
now = 2026-08-08 → false
now = 2026-08-10 → true
```

A decisão flipou **sem uma única escrita**. Zero trigger, zero revisão nova, zero publicação.

Consequência quando o enforcement ligar: publicaria `writeAllowed:false` com a revisão de
ontem; o receptor **monotônico** do Domus **rejeita por revisão não-crescente**; a clínica
**segue escrevendo prontuário** com a tela do admin dizendo "bloqueado".

---

## 🔑 Os 3 fatos que eu verifiquei e que reordenaram o painel

**1. O trigger de `billing_obligations` JÁ observa `state`.** O `WHEN` do UPDATE
(`20260729180000_billing_obligations/migration.sql`) cobre `subscriptionId`, `state`,
`disposition`, `issuedAt`, `dueAt`, `paidAt`, `periodStart`, `periodEnd`.
➡️ Qualquer escrita que mude `state` **já bumpa a revisão hoje**, sem tocar em trigger nenhum.

**2. `src/lib/subscription.ts:262` é I2 violada em UMA LINHA, rodando em produção:**
```ts
const pastDueSince = subscription.pastDueSince ?? subscription.currentPeriodEnd ?? now;
```
O ramo `?? now` falha **a favor do cliente** (`daysOverdue = 0` → não restringe). O ramo
perigoso é o do **meio**: `?? currentPeriodEnd` restringe com base num campo que ninguém
carimbou como "início da inadimplência", e que tem 5+ escritores.

**3. 🚨 EXISTE UM ÚNICO ESCRITOR QUE CRIA INADIMPLÊNCIA NO SISTEMA INTEIRO:**
`src/app/api/webhooks/asaas/route.ts:643` — `{ status: "PAST_DUE", pastDueSince: new Date() }`.
Todos os outros caminhos apenas **zeram** `pastDueSince`.
➡️ Uma obrigação `COURTESY`/`INTERNAL`, ou cuja fatura **nunca foi ao gateway**, vence e
**ninguém nunca fica `PAST_DUE`**. **É o caso Óticas Ultra** — 3 meses sem cobrar, e o
sistema inteiro achando que estava tudo `ACTIVE`. Existe HOJE, com ou sem motor novo.

---

## As 3 abordagens e o que os críticos mataram

| Abordagem | Veredito | O que a matou |
|---|---|---|
| **A) MVP-first** — reusar `pastDueSince`, zero migração, zero cron | **SOBREVIVE com emendas** | Hospedar no `invoice-reminders` (10h) adiciona 22h de latência gratuita e fica gateado pela flag da tela de "E-mails" |
| **B) User-first** — `OVERDUE` no enum + `overdueAt`, cron `dunning` | **SÉRIO** | `daysUntilRestriction` no `EntitlementDTO` leva **dado financeiro para o banco de PHI** (minimização, LGPD art. 6º III). E hospedar **antes** do `findMany` do dunning permite vencer e restringir **no mesmo tick** — atravessando os 14 dias de régua numa execução |
| **C) Data-first** — `OVERDUE` + `overdueAt` no `WHEN` do trigger | **FATAL** | Índice parcial para tabela com **zero linhas**. `ALTER TYPE ADD VALUE` é **irreversível** (Postgres não tem `DROP VALUE`). E mexer no `WHEN` exige `DROP`+`CREATE` — **abre janela de I2 violada dentro da correção da I2** |

**O diagnóstico da (B) é o mais valioso das três** (o buraco do escritor único), mas sua
execução é a que eu rejeitaria mais rápido. Aproveitar o diagnóstico, descartar a execução.

---

## ⚖️ Decisão do dono (2026-07-31): fatiar — só o que já está quebrado em produção

O crítico de custo fez o argumento decisivo: **I2 é hoje uma invariante sobre um sistema que
não está ligado.** O motor é código morto (sem chamador), as 4 flags nascem desligadas,
`billing_obligations` está vazia, e o gate não lê obrigação. Construir o varredor agora é
construir para uma tabela vazia.

### ✅ FAZER AGORA (afeta clientes hoje)
1. **`subscription.ts:262`** — remover o `?? currentPeriodEnd`, **manter o `?? now`**.
   ⚠️ Direção importa: o `?? now` é fail-open a favor do cliente. Trocá-lo por algo mais
   estrito converteria fail-open em fail-closed **no gate que decide se um médico escreve
   prontuário**.
2. **Fechar o buraco do escritor único** — obrigação vencida passa a carimbar `pastDueSince`,
   não só o webhook do Asaas. É o que fecha o caso Óticas Ultra.

### ⏭️ FAZER DEPOIS (quando a etapa 5 for ligar)
3. Varredor hospedado no `dunning` (8h) — **depois** do `findMany` da linha 59, nunca antes,
   para que a transição só vire restrição no tick **seguinte**.
4. Gate atrás de `isEnforcementEnabledForCompany` (a flag já existe e nasce desligada).

**Zero migração, zero cron novo, reversível por `git revert`.**

---

## 🚨 Condições que o painel levantou e que valem para QUALQUER caminho futuro

- **`accessEnabled=true` em 14/17 empresas torna esta decisão inobservável.** `subscription.ts`
  devolve `allowed:true, readOnly:false` **antes** de ler a assinatura. Para 14 das 17, A, B e C
  produzem o **mesmo comportamento observável: nenhum**. Qualquer "validamos em produção" passa
  por vacuidade. **A coorte de teste precisa de `accessEnabled=false`.** (Plano C.)
- **Latência real até o Domus é de até 1 hora**, não imediata: o `drain-entitlement-outbox` roda
  `0 * * * *`. O flush inline do dunning só é alimentado nos ramos SUSPENDED/CANCELED. Nenhuma
  das 3 abordagens nomeou isso.
- **Reinício da régua por estorno**: `PAID` significa "houve pagamento", não "está quitada". Um
  cliente pode pagar → régua zera → estornar → vencer de novo → **mais 14 dias de escrita
  liberada**, repetível. Fechar antes de ligar enforcement para qualquer empresa.
- **`ALTER TYPE ADD VALUE` não roda dentro de transação** junto com uso do valor novo, e o
  preflight de `apply-billing-obligations.cjs` **exige** `BEGIN`/`COMMIT`. Uma migração de enum
  aplicada pelo caminho existente **falha ou aplica pela metade**.
