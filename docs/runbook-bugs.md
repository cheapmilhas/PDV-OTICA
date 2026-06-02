# Runbook — Sintoma → Causa → Ação

Documento VIVO para acelerar o diagnóstico de bugs. Quando um cliente reportar um
problema, procure o sintoma aqui antes de investigar do zero. Ao resolver um bug
novo, **adicione uma linha** — o runbook só vale se crescer.

## Como achar um erro reportado por cliente

1. Peça o **errorId** (formato `err_xxxxxxxx`). Toda resposta de erro 5xx o inclui
   desde a Fase 4. Busque-o no log da Vercel e no Sentry — o mesmo id liga os três.
2. Sem errorId? Use o **Sentry** filtrando por `companyId` (anexado a cada request
   autenticado desde a Fase 4.1) + janela de horário do relato.
3. Veja o `code` do erro (abaixo) para a categoria.

## Códigos de erro da API (ERROR_CODES)

| code | HTTP | Significado | Ação típica |
|------|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Zod rejeitou input | Ver `details[]` (campo+msg); corrigir o front que envia |
| `BUSINESS_RULE_VIOLATION` | 400 | Regra de negócio (ex.: estoque insuficiente sem override) | Esperado; orientar o usuário |
| `CREDIT_LIMIT_EXCEEDED` | 400 | Soma a prazo > limite do cliente (H2) | Esperado; pede override de gerente |
| `CUSTOMER_OVERDUE` | 400 | Cliente com débito vencido | Esperado; regularizar AR |
| `INSUFFICIENT_STOCK` | 400 | Estoque < pedido (produto controlado) | Override de gerente ou repor |
| `DISCOUNT_EXCEEDS_LIMIT` | 400 | Desconto acima do teto do papel (D) | Override de gerente |
| `PRICE_BELOW_COST` | 400 | Preço líquido < custo (D) | Override; ou promoção cadastrada (já autoriza) |
| `SUBSCRIPTION_BLOCKED` | 403 | Assinatura inadimplente/suspensa (F) | Regularizar pagamento |
| `UNAUTHORIZED` | 401 | Sem sessão / sessão sem companyId | Logout+login (JWT pode estar velho) |
| `FORBIDDEN` | 403 | Sem permissão de papel | Esperado |
| `NOT_FOUND` | 404 | Recurso inexistente OU de outro tenant | Ver se não é leak/erro de companyId |
| `DUPLICATE` | 409 | Unique constraint (P2002) | Ver `details.field`; registro já existe |
| `DATABASE_ERROR` | 5xx | Prisma inesperado (timeout P2024/P2028, etc.) | **Investigar via errorId** — pode ser carga/tx longa |
| `INTERNAL_ERROR` | 500 | Exceção não tratada | **Investigar via errorId** no Sentry |

## Sintomas conhecidos (semeado com achados do dogfood)

| Sintoma | Causa provável | Ação / referência |
|---------|----------------|-------------------|
| Estoque sobe ao cancelar venda de produto sem controle | Assimetria crédito/débito (T7) | CORRIGIDO — `shouldRestockOnCancel`. Se reaparecer, ver `stock-operation.ts` |
| Entrada de estoque não aparece no PDV da filial | branchId ausente OU crédito filtrava stockControlled (T9) | CORRIGIDO — `resolveStockOperation` + StockMovement grava branchId |
| Saldo de cashback negativo | Piso 0 ausente em ajuste (M9) ou expiração (M5) | CORRIGIDO — `cashback-math.ts` (applyCashbackAdjustment/expirableAmount) |
| Cliente fura limite de crédito com 2 métodos a prazo | Validação por pagamento isolado (H2) | CORRIGIDO — `sumOnCreditAmount` (soma tudo de uma vez) |
| Venda noturna cai no dia seguinte no relatório | Timezone UTC vs America/Sao_Paulo (M2) | CORRIGIDO — `localBoundary`/date-utils |
| Relatório não muda ao trocar de filial | Rota usava sessão, ignorava querystring (M3) | CORRIGIDO — `resolveReportBranchId` (só ADMIN/GERENTE trocam) |
| Dados de um cliente aparecem para outro | Query sem `where: companyId` | **Buscar no log `tenant-guard: query sem companyId`** — guard da Fase 1 detecta |
| Tela em branco em relatório/aba | `return null` sem dados (T13) | Empty state esperado; se persistir, ver fetch da aba |
| Promoção vendida pelo preço cheio | promoPrice não cadastrado OU PDV ignorava (H4) | CORRIGIDO — campo na UI de produto + PDV lê branchPromoPrice ?? promoPrice |
| Cobrança dupla no checkout | Duplo-clique cria 2 subscriptions (M14) | CORRIGIDO — advisory lock + idempotency-key Asaas |
| Erro 500 ao finalizar 2 vendas simultâneas sem caixa | Race auto-caixa P2002 (M1) | CORRIGIDO — rebusca shift OPEN no P2002 |

## Alertas (configurar no painel do Sentry)

O código já emite os sinais necessários (Fase 4.1: `companyId` vai como **tag** do
Sentry em todo request autenticado; erros 5xx têm `errorId`). Falta apenas LIGAR
os alertas no painel — uma vez, manualmente:

1. **Pico de erros 5xx geral** — Alert rule: "Number of errors > N em 1h" → notifica
   canal (Slack/email). Pega regressão ampla logo após um deploy.
2. **Cliente quebrado isolado** — Alert rule agrupada por **tag `companyId`**: "erros
   de um mesmo companyId > N em 1h". Detecta um cliente específico com problema
   ANTES da reclamação chegar (ex.: dados corrompidos só naquele tenant).
3. **tenant-guard disparando** — se ligar `TENANT_GUARD_SENTRY=1`, criar alerta para
   a mensagem "tenant-guard: query sem companyId" → indica rota sem isolamento
   (potencial leak entre clientes). Útil durante a fase de mapeamento.

Pré-requisito: `SENTRY_DSN` (server) e `NEXT_PUBLIC_SENTRY_DSN` (client) setados na
Vercel. Sem DSN, o Sentry é no-op (nada é enviado) e os alertas não têm dados.

## Ao corrigir um bug novo

1. Escreva um teste de regressão que falha ANTES do fix (princípio da Fase 2).
2. Adicione a linha "sintoma → causa → ação" aqui.
3. Se for lógica de decisão, extraia para função pura testável.
4. Se mexer em query, confirme o `companyId` (e olhe o log do tenant-guard).
