# Bug #3 — Diagnóstico

## Sintoma

`src/lib/installment-utils.ts:67-75`:

```ts
export async function validateCreditLimit(
  customerId: string,
  requestedAmount: number,
  companyId: string
): Promise<{ approved: boolean; message?: string }> {
  // TODO: Implementar se houver regra de limite de crédito por cliente
  // Por enquanto, sempre aprova
  return { approved: true };
}
```

**Sempre aprova.** Quem chama:
- `sale.service.ts:310-321` (PDV direto, STORE_CREDIT)
- `quote.service.ts:convertToSale` (após Bug #1, também chama)

Resultado: cliente devedor há meses pode comprar a prazo sem qualquer impedimento.

## Infraestrutura já existente no banco

`SystemRule` tem 3 chaves prontas (mas não consultadas em runtime):

| Chave | Valor default no schema (`system-rule.schema.ts:259-280`) | Uso esperado |
|---|---|---|
| `customers.default_credit_limit` | R$ 1.000 | Limite global (sobreposto por Customer.creditLimit individual) |
| `customers.block_overdue_sales` | `true` | Bloqueia vendas se cliente inadimplente |
| `customers.overdue_days_to_block` | 15 dias | Dias de atraso para considerar "inadimplente" |

**🟠 Decisão Matheus** (revisar valores defaults):
- `customers.default_credit_limit` → R$ **500** (era R$ 1.000)
- `customers.overdue_days_to_block` → **30** dias (era 15)
- `customers.block_overdue_sales` → mantém `true`

## Schema — adições necessárias

`Customer` precisa de campos para limite individual:

```prisma
model Customer {
  // ... campos existentes
  creditLimit               Decimal?  @db.Decimal(12, 2)  // null = usa SystemRule default
  creditLimitOverridden     Boolean   @default(false)     // marca override manual
  // ...
}
```

**Por quê:**
- `creditLimit` `null` = usa o default do SystemRule (regra global da empresa)
- `creditLimit != null` = usa esse valor (override individual)
- `creditLimitOverridden` = marca explícita para UI mostrar "limite manual"

## Lógica proposta para `validateCreditLimit`

```
1. Buscar Customer (creditLimit, creditLimitOverridden)
2. Buscar SystemRules:
   - default_credit_limit (default R$ 500)
   - block_overdue_sales (default true)
   - overdue_days_to_block (default 30)
3. Determinar effectiveLimit:
   - Se creditLimit != null → creditLimit
   - Senão → default_credit_limit
4. Se block_overdue_sales:
   - Buscar AccountReceivable do cliente onde:
     - status = PENDING
     - dueDate < now() - overdue_days_to_block
   - Se houver: REJEITAR com mensagem clara
5. Buscar totalOpen = sum(AccountReceivable PENDING.amount) do cliente
6. Se (totalOpen + requestedAmount) > effectiveLimit: REJEITAR
7. Senão: APROVAR
```

## Diagnóstico read-only proposto

Script `scripts/diagnose-bug3-credit-exposure.ts`:

Para cada `Customer` com AR em aberto:
- `totalOpen = SUM(AccountReceivable.amount WHERE customerId AND status=PENDING)`
- `totalOverdue = idem mas só os com dueDate < now)`
- `oldestOverdueDays = max(now - dueDate) entre os vencidos`
- `recentSalesCount = COUNT(Sale WHERE customerId AND createdAt > now-30d AND payment STORE_CREDIT)`

Listar TOP 50 por `totalOverdue`, mostrando:
- Empresa, customerId
- Nome (mascarado)
- CPF (mascarado: `123.***.***-45`)
- `totalOpen`, `totalOverdue`, `oldestOverdueDays`
- Quantas vendas STORE_CREDIT recentes desse cliente

Para Matheus avaliar a "exposição": "X clientes devem R$ Y vencido há Z dias e mesmo assim continuaram comprando a prazo."

## Migration de schema

`prisma migrate dev --create-only --name add_customer_credit_limit`

Adiciona:
- `Customer.creditLimit Decimal(12,2)?` (nullable)
- `Customer.creditLimitOverridden Boolean @default(false)`

**Migration NÃO seta valores** — todos os clientes ficam com `creditLimit=null` (usa default da SystemRule).

## Migration de dados — SystemRule defaults

Script `scripts/fix-bug3-set-default-credit-limits.ts`:

Para cada empresa que NÃO tem as 3 SystemRules de credit:
1. Cria `customers.default_credit_limit` = 500
2. Cria `customers.block_overdue_sales` = true
3. Cria `customers.overdue_days_to_block` = 30

**Não altera empresas que já têm as regras** (idempotente).

## Decisões

1. **Valores default** (Matheus): R$ 500 + 30 dias
2. **Sem UI** de gestão de limite individual nesta fase — fica como follow-up
3. **Mensagem de erro** quando bloqueado deve ser clara, em PT-BR, mostrar o limite e o débito
4. **Update do `system-rule.schema.ts`** para refletir os novos defaults (R$ 500, 30 dias) — afeta apenas empresas NOVAS criadas após o fix
