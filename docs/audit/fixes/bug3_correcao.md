# Bug #3 — Correção do código

## Arquivos modificados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `prisma/schema.prisma` | schema | +2 campos em `Customer` (`creditLimit`, `creditLimitOverridden`) |
| `prisma/migrations/20260505_add_customer_credit_limit/migration.sql` | **NOVA migration** | ALTER TABLE add columns |
| `src/lib/installment-utils.ts` | implementação | substitui stub por lógica real |
| `src/lib/validations/system-rule.schema.ts` | defaults | R$ 1.000 → R$ 500, 15 dias → 30 dias |

## Migration Prisma

**Nome:** `20260505_add_customer_credit_limit`

**SQL:**
```sql
ALTER TABLE "Customer"
  ADD COLUMN "creditLimit" DECIMAL(12,2),
  ADD COLUMN "creditLimitOverridden" BOOLEAN NOT NULL DEFAULT false;
```

⚠️ **Migration NÃO foi aplicada.** Aguarda Matheus rodar `npx prisma migrate deploy`.

## Lógica de `validateCreditLimit`

Substitui o stub que sempre retornava `{ approved: true }`. Nova lógica:

```
1. Busca Customer (creditLimit, creditLimitOverridden)
2. Busca SystemRules (com fallback para defaults hardcoded):
   - customers.default_credit_limit (default R$ 500)
   - customers.block_overdue_sales (default true)
   - customers.overdue_days_to_block (default 30)
3. effectiveLimit = customer.creditLimit ?? rule default
4. Se block_overdue_sales:
   - Busca AccountReceivable PENDING vencido há > overdue_days_to_block
   - Se houver: REJEITA
5. totalOpen = SUM(AccountReceivable PENDING.amount)
6. Se (totalOpen + requestedAmount) > effectiveLimit: REJEITA
7. APROVADO
```

## Mensagens de erro (PT-BR)

### Cliente inadimplente
```
"Cliente possui débito vencido há 45 dias (Parcela 2/3 - Venda #abc12345, R$ 100.00).
 Regularize antes de nova compra a prazo."
```

### Limite excedido
```
"Limite de crédito excedido. Limite: R$ 500.00. Em aberto: R$ 350.00. Disponível: R$ 150.00.
 Solicitado: R$ 200.00."
```

### Cliente não encontrado
```
"Cliente não encontrado."
```

## Pontos de uso (já preparados antes do fix)

| Arquivo | Linha | Tratamento |
|---|---|---|
| `sale.service.ts:create` | linhas 310-321 | Já chamava — tratava `approved=false` como `AppError 400` |
| `quote.service.ts:convertToSale` | adicionado no Bug #1 | Idem |

Após o fix, ambos passam a **bloquear** vendas que antes passavam.

## Defaults atualizados em `system-rule.schema.ts`

Mudança:
- `customers.default_credit_limit`: 1.000 → **500**
- `customers.overdue_days_to_block`: 15 → **30**

⚠️ **Empresas NOVAS criadas após o deploy** vão receber esses defaults via `seedDefaultRules`.
**Empresas EXISTENTES** com regras já criadas não são afetadas. Use o script de migração para popular regras faltantes.

## Compilação
`npx tsc --noEmit` — **sem erros.**

## Riscos

### Risco baixo
- Implementação é defensiva (fallback hardcoded se SystemRule não existir)
- Sem mudança de assinatura do `validateCreditLimit` (mesma signature)

### Risco médio: clientes que antes podiam comprar e agora não podem
- Após o deploy, vendas STORE_CREDIT que antes passavam podem começar a falhar
- **Mitigação:**
  - Rodar `diagnose-bug3-credit-exposure.ts` antes do deploy para baseline
  - Comunicar atendentes que vão ver a mensagem de erro nova
  - Avaliar caso a caso: cliente realmente devedor → cobrança manual / regularização

### Risco baixo: clientes legítimos com limite muito baixo
- Default R$ 500 é conservador para óculos
- Solução: usar `Customer.creditLimit` individual via UI futura (não nesta fase)
- Workaround imediato: editar via SQL ou via SystemRule da empresa

## Dependências (deploy)

1. **Aplicar migration Prisma:**
   ```bash
   npx prisma migrate deploy
   ```
2. **Rodar script de SystemRule defaults** (em horário tranquilo):
   ```bash
   npx tsx scripts/fix-bug3-set-default-credit-limits.ts
   # validar dry-run
   npx tsx scripts/fix-bug3-set-default-credit-limits.ts --apply --i-know-what-im-doing
   ```
3. Sem o passo 2, validateCreditLimit usa hardcoded defaults (R$ 500, 30 dias). Funciona, mas as empresas não conseguem customizar via UI até as regras existirem.

## Follow-up — Fase 1C ou posterior

### TODO: UI para `Customer.creditLimit` individual

**Decisão Matheus (2026-05-06):** UI fica para fase futura. Por enquanto:
- Todos os clientes usam o default da empresa (R$ 500)
- Override individual é possível **apenas via SQL direto**:
  ```sql
  UPDATE "Customer"
  SET "creditLimit" = 5000, "creditLimitOverridden" = true
  WHERE id = '<customer_id>' AND "companyId" = '<company_id>';
  ```

### Especificação da UI futura (a implementar)

**Onde:** `/dashboard/clientes/[id]/editar`

**Campos a adicionar no formulário:**
- Campo numérico **"Limite de crédito (R$)"**
  - Placeholder: `"Deixe vazio para usar o default da empresa (R$ 500,00)"`
  - Aceita decimal com 2 casas
  - Mapeia para `Customer.creditLimit`
- Checkbox **"Limite individual configurado"**
  - Quando marcado: salva `creditLimitOverridden = true`
  - Quando desmarcado: salva `creditLimitOverridden = false` E zera `creditLimit` para null
  - Reage automaticamente: ao preencher o campo numérico, marca o checkbox

**Permissão:** sugerido `customers.edit` ou nova `customers.manage_credit_limit`

**Telas que devem mostrar o limite efetivo do cliente:**
- Detalhe do cliente: badge "Limite: R$ X (default da empresa)" ou "Limite: R$ Y (individual)"
- PDV ao selecionar cliente: tooltip com "Disponível: R$ Z" (calculado em tempo real)

**Relatórios sugeridos como follow-up:**
- `/dashboard/relatorios/credito-exposure` — listar clientes próximos do limite
- Gráfico de exposição total (soma de AR pendente por status)

**Dependências para implementar a UI:**
- Endpoint `/api/customers/[id]/credit-status` que retorna `{ effectiveLimit, totalOpen, totalOverdue, available }` (calculado no backend)
- Hook `useCustomerCreditStatus(customerId)` no front

⚠️ Não implementar agora. Documentado para a Fase 1C.
