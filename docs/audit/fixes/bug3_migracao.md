# Bug #3 — Script de migração

## Arquivo
`scripts/fix-bug3-set-default-credit-limits.ts`

## O que faz

Para cada empresa, garante que existem 3 SystemRules:
- `customers.default_credit_limit` = 500
- `customers.block_overdue_sales` = true
- `customers.overdue_days_to_block` = 30

Cria APENAS as que estão faltando (idempotente). Não sobrescreve regras existentes.

## O que NÃO faz

- Não altera `Customer.creditLimit` individual (todos ficam null = usa default)
- Não força recálculo de limites pra clientes existentes
- Não envia comunicação aos clientes inadimplentes

## Como rodar

```bash
# 1. Sempre dry-run primeiro
npx tsx scripts/fix-bug3-set-default-credit-limits.ts

# 2. Aplicar
npx tsx scripts/fix-bug3-set-default-credit-limits.ts --apply --i-know-what-im-doing

# 3. Filtrar uma empresa
npx tsx scripts/fix-bug3-set-default-credit-limits.ts --company-id <cuid>
```

## Idempotência

Sim. Antes de criar cada regra, verifica se já existe via `companyId_key @@unique`.

## Estimativa de tempo

Trivial. ~3 inserts por empresa.
- 100 empresas: <30s
- 1000 empresas: <2min

## Cuidados

- [ ] Aplicar a **migration Prisma** ANTES (`add_customer_credit_limit`) — senão o `validateCreditLimit` que tenta ler `Customer.creditLimit` pode falhar.

  Na verdade não — o helper só LÊ; se a coluna não existe, Prisma Client com client antigo pode dar erro. Por isso: ordem é **migration → deploy do código → script de regras**.

- [ ] **Comunicar atendentes** que após o deploy:
  - Vendas STORE_CREDIT podem ser bloqueadas se cliente devedor
  - Mensagem é clara em PT-BR
  - Para liberar caso individual: editar `Customer.creditLimit` via SQL (UI fica como follow-up)

## Rollback

Se precisar desfazer (ex: muitos clientes legítimos sendo bloqueados):

### Opção A: desativar a regra
```sql
UPDATE "SystemRule"
SET active = false
WHERE key = 'customers.block_overdue_sales';
```

### Opção B: aumentar o limite default da empresa
Via UI em `/dashboard/configuracoes/regras` (se acessível) ou SQL:
```sql
UPDATE "SystemRule"
SET value = '5000'::jsonb
WHERE key = 'customers.default_credit_limit'
  AND companyId = 'X';
```

### Opção C: setar limite individual
```sql
UPDATE "Customer"
SET "creditLimit" = 5000, "creditLimitOverridden" = true
WHERE id = 'cliente_x';
```
