# Bug #2 — Script de migração

## Arquivo
`scripts/fix-bug2-stock-drift.ts`

## O que faz

Para cada `Product` com `stockControlled=true`:
1. Calcula `truth = SUM(BranchStock.quantity WHERE productId = p.id)`
2. Se `Product.stockQty != truth`: atualiza `Product.stockQty = truth`

## O que NÃO faz

- Não recria `StockMovement` faltantes (risco de duplicar histórico)
- Não corrige `BranchStock` (assume que ele é a verdade)
- Não cria registro de auditoria do ajuste (decisão — script é one-shot)

## Como rodar

```bash
# 1. Dry-run (sempre primeiro)
npx tsx scripts/fix-bug2-stock-drift.ts

# 2. Aplicar
npx tsx scripts/fix-bug2-stock-drift.ts --apply --i-know-what-im-doing

# 3. Filtrar por empresa
npx tsx scripts/fix-bug2-stock-drift.ts --company-id <cuid>

# 4. Limitar
npx tsx scripts/fix-bug2-stock-drift.ts --limit 100
```

## Idempotência

Sim. Rodar 2× só refaz o cálculo — se já está sincronizado, pula.

## Estimativa de tempo

`Product.update` é simples (1 query por produto com drift).
- 100 produtos: ~5s
- 1.000 produtos: ~30s a 1min
- 10.000 produtos: ~5-10min

## Cuidados antes de aplicar

- [ ] Diagnóstico (`diagnose-bug2-stock-drift.ts`) rodado e revisado
- [ ] **Inventário físico recente?** Se a ótica fez contagem física há pouco, o resultado dela já deve estar refletido em `BranchStock`. O script vai apenas alinhar Product.stockQty com isso.
- [ ] **Inventário pendente?** Se está em meio a contagem, ESPERAR terminar antes de rodar.
- [ ] Preferir rodar em horário sem PDV ativo (evitar race com vendas em andamento)
- [ ] Backup recente (Neon point-in-time)

## Risco residual (dívida técnica documentada)

Mesmo após o fix:
- Sales/Refunds antigos que originaram drift **continuam sem rastro completo no `StockMovement`** para a parte de BranchStock.
- Auditoria histórica fica parcial.
- A partir do fix do código (Bug #2 corrigido), refunds futuros geram rastro completo.

Esta dívida técnica é **aceita** pela complexidade/risco de tentar reconstruir o histórico.
