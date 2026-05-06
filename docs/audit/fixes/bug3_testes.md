# Bug #3 — Testes manuais

## Setup
- Banco com migration aplicada (`creditLimit`, `creditLimitOverridden` em Customer)
- SystemRules de credit configuradas (rodar `fix-bug3-set-default-credit-limits.ts`)
- Cliente C1 sem AR aberto
- Cliente C2 com AR pendente vencido há 35 dias (R$ 200)
- Cliente C3 com AR pendente NO PRAZO (R$ 400)
- Cliente C4 com `creditLimit = 5000` individual
- Caixa aberto

## TESTE 1: Cliente sem AR aberto + dentro do limite → APROVA

1. PDV
2. Cliente C1
3. Produto R$ 200, STORE_CREDIT 2 parcelas

**Esperado:** ✅ Venda criada com sucesso. AR criadas.

## TESTE 2: Cliente inadimplente → BLOQUEIA

1. PDV
2. Cliente C2 (devedor há 35 dias)
3. Qualquer venda STORE_CREDIT

**Esperado:** ❌ Erro 400:
```
"Cliente possui débito vencido há 35 dias (Parcela ..., R$ 200.00). Regularize antes de nova compra a prazo."
```

## TESTE 3: Cliente com AR no prazo + nova venda excede limite → BLOQUEIA

1. Cliente C3 já tem R$ 400 em aberto (no prazo)
2. PDV: tenta vender R$ 200 STORE_CREDIT (total 600 > limite 500)

**Esperado:** ❌ Erro 400:
```
"Limite de crédito excedido. Limite: R$ 500.00. Em aberto: R$ 400.00. Disponível: R$ 100.00. Solicitado: R$ 200.00."
```

## TESTE 4: Cliente com creditLimit individual → usa o individual

1. Cliente C4 com `Customer.creditLimit = 5000`
2. C4 já tem R$ 400 em aberto
3. PDV: vender R$ 200 STORE_CREDIT (total 600 < limite individual 5000)

**Esperado:** ✅ Aprovado. Limite individual sobrepõe default da empresa.

## TESTE 5: Empresa com block_overdue_sales=false → permite mesmo com vencido

1. Em `/dashboard/configuracoes/regras` (ou SQL): setar `customers.block_overdue_sales` = false
2. Cliente C2 (inadimplente)
3. PDV STORE_CREDIT

**Esperado:** ✅ Bloqueio por inadimplência desabilitado. Mas o limite ainda é checado.

## TESTE 6: Conversão Quote → Sale com cliente inadimplente

1. Cliente C2 (inadimplente)
2. Criar Quote, aprovar
3. Tentar converter com STORE_CREDIT

**Esperado:** ❌ Mesma mensagem do TESTE 2 (Bug #1 fez `convertToSale` chamar `validateCreditLimit`).

## TESTE 7: SystemRule não existe → fallback para defaults hardcoded

1. Empresa novinha sem SystemRules
2. Tentar venda STORE_CREDIT

**Esperado:** ✅ Funciona com defaults R$ 500 / 30 dias / block=true (lógica usa fallback).

## TESTE 8: BALANCE_DUE — também passa por validateCreditLimit

> Decisão Matheus (2026-05-06): BALANCE_DUE é venda a prazo igual STORE_CREDIT —
> cliente inadimplente não deve burlar a validação só trocando o método.

### TESTE 8.1: BALANCE_DUE com cliente OK → APROVA

1. Cliente C1 (sem AR aberto, dentro do limite)
2. PDV: produto R$ 200, BALANCE_DUE

**Esperado:** ✅ Venda criada. AR de BALANCE_DUE criada com `dueDate = +30d`.

### TESTE 8.2: BALANCE_DUE com cliente inadimplente → BLOQUEIA

1. Cliente C2 (devedor há 35 dias, R$ 200 vencido)
2. PDV: tentar vender R$ 100 BALANCE_DUE

**Esperado:** ❌ Erro 400, **mesma mensagem** que STORE_CREDIT no TESTE 2:
```
"Cliente possui débito vencido há 35 dias (..., R$ 200.00). Regularize antes de nova compra a prazo."
```

### TESTE 8.3: BALANCE_DUE excede limite → BLOQUEIA

1. Cliente C3 já tem R$ 400 em aberto (no prazo)
2. PDV: tentar vender R$ 200 BALANCE_DUE (total 600 > limite 500)

**Esperado:** ❌ Erro 400 com mensagem de limite excedido (idêntica ao TESTE 3 com STORE_CREDIT).

### TESTE 8.4: Conversão Quote → Sale com BALANCE_DUE para cliente inadimplente

1. Cliente C2 (inadimplente)
2. Criar Quote, aprovar
3. Tentar converter com BALANCE_DUE

**Esperado:** ❌ Mesmo bloqueio do TESTE 6 (mas agora com BALANCE_DUE em vez de STORE_CREDIT).

### TESTE 8.5: BALANCE_DUE com `Customer.creditLimit` individual

1. Cliente C4 com `creditLimit = 5000` individual
2. C4 já tem R$ 400 em aberto
3. PDV BALANCE_DUE R$ 200 (total 600 < 5000)

**Esperado:** ✅ Aprovado. Limite individual sobrepõe default da empresa também para BALANCE_DUE.

### TESTE 8.6: BALANCE_DUE sem cliente → erro de validação

1. PDV: BALANCE_DUE sem cliente vinculado

**Esperado:** ❌ Erro 400: "Saldo a Receber exige um cliente vinculado".
(`validateCreditLimit` nem chega a ser chamado — bloqueio é anterior.)

## TESTE 9: Sem cliente (consumidor não cadastrado) → não chama validateCreditLimit

PDV CASH/PIX/DEBIT sem cliente → não passa por `validateCreditLimit` (só STORE_CREDIT requer customer obrigatório).

**Esperado:** ✅ Funciona normal.

## TESTE 10: SystemRule active=false → usa fallback default

1. Em SystemRule da empresa: setar `customers.default_credit_limit.active = false`
2. PDV STORE_CREDIT R$ 100 (cliente sem AR)

**Esperado:** ✅ Usa default hardcoded R$ 500. Aprovado.

## REGRESSÃO

### TESTE 11: Sale CASH/PIX/CARD (sem STORE_CREDIT/BALANCE_DUE) → não impactado
Vendas com métodos à vista ou cartão de crédito continuam funcionando exatamente igual. `validateCreditLimit` não é chamado nesses casos.

### TESTE 12: AccountReceivable com status RECEIVED ou CANCELED → ignorado
A função só conta AR com `status = PENDING`. Vendas pagas/canceladas não somam ao `totalOpen`.

### TESTE 13: Mix STORE_CREDIT + BALANCE_DUE em uma só venda
Cliente compra:
- R$ 200 em STORE_CREDIT (3x)
- R$ 100 em BALANCE_DUE

`validateCreditLimit` é chamado **duas vezes** no loop de payments (uma para cada método a prazo). Se o cliente atingir o limite no meio do loop, a segunda chamada bloqueia.

**Esperado:** se C3 tem R$ 400 em aberto (limite 500): a primeira chamada (STORE_CREDIT R$ 200) já reprova (400 + 200 > 500). Erro retornado.

## CHECKLIST FINAL

- [ ] TESTE 1-13 passam em dev
- [ ] `npx tsc --noEmit` sem erro
- [ ] Migration `add_customer_credit_limit` revisada
- [ ] Diff de código revisado
- [ ] `diagnose-bug3-credit-exposure.ts` rodado em PROD para baseline (quantos clientes serão afetados)
- [ ] Atendentes comunicados sobre nova mensagem de erro (BALANCE_DUE também bloqueia agora)
- [ ] (Opcional) UI para gerenciar `Customer.creditLimit` individual — fica como follow-up Fase 1C
