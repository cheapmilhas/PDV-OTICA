# RAIO-X COMPLETO — PDV OTICA v1.1

> Gerado em 17/03/2026 | Perfil: ADMINISTRADOR

---

## RESUMO EXECUTIVO

| Metrica | Valor |
|---------|-------|
| Paginas principais | 47 |
| Sub-paginas | 42 |
| Total de paginas | 89 |
| Funcionalidades mapeadas | ~280 |
| Models Prisma | 116 |
| Enums Prisma | 52 |
| Rotas de API | 231 |
| Alertas encontrados | 18 |

---

## MAPEAMENTO DE PAGINAS

═══════════════════════════════════════════
### 1. DASHBOARD PRINCIPAL
- Rota: `/dashboard`
- Arquivo: `src/app/(dashboard)/dashboard/page.tsx`
- Protecao: Layout auth (redirect se nao logado)

**Funcionalidades:**
1. Cards de metricas (vendas hoje/mes, clientes, estoque baixo, OS)
   - API: `/api/dashboard/metrics`
   - Models: Sale, Customer, Product, ServiceOrder, SalesGoal, SystemRule
   - Operacao: Leitura (aggregate, count)

2. Grafico vendas ultimos 7 dias
   - API: `/api/dashboard/sales-last-7-days`
   - Models: Sale
   - Operacao: Leitura

3. Top 5 produtos vendidos
   - API: `/api/dashboard/top-products`
   - Models: SaleItem, Product
   - Operacao: Leitura

4. Distribuicao metodos pagamento
   - API: `/api/dashboard/payment-distribution`
   - Models: SalePayment
   - Operacao: Leitura

5. Vendas recentes (lista)
   - API: `/api/sales?pageSize=5`
   - Models: Sale, Customer, User
   - Operacao: Leitura

6. Produtos estoque baixo
   - API: `/api/products?lowStock=true`
   - Models: Product, BranchStock
   - Operacao: Leitura

7. OS urgentes
   - API: `/api/service-orders?orderStatus=APPROVED`
   - Models: ServiceOrder
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 2. PDV (Ponto de Venda)
- Rota: `/dashboard/pdv`
- Arquivo: `src/app/(dashboard)/dashboard/pdv/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. Busca de produtos (nome, SKU, codigo barras)
   - API: `/api/products?status=ativos&pageSize=50`
   - Models: Product
   - Operacao: Leitura

2. Carrinho de compras (adicionar, remover, editar qtd)
   - Estado local (useState)
   - Operacao: Frontend only

3. Editar preco do item (modal)
   - Estado local
   - Operacao: Frontend only

4. Aplicar desconto por item (modal R$/%)
   - Estado local
   - Operacao: Frontend only

5. Selecionar cliente
   - API: `/api/customers?search=...`
   - Models: Customer
   - Operacao: Leitura

6. Selecionar vendedor
   - API: `/api/users/sellers`
   - Models: User
   - Operacao: Leitura

7. Finalizar venda (modal pagamentos)
   - API: `POST /api/sales`
   - Models: Sale, SaleItem, SalePayment, CashMovement, AccountReceivable, Commission, FinanceEntry, StockMovement, BranchStock, Product
   - Operacao: Escrita ⚡ (transacao)

8. Usar cashback do cliente
   - API: `/api/cashback/balance/[customerId]`
   - Models: CustomerCashback
   - Operacao: Leitura + Escrita

9. Cadastrar cliente rapido (modal)
   - API: `POST /api/customers`
   - Models: Customer
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 3. VENDAS
- Rota: `/dashboard/vendas`
- Arquivo: `src/app/(dashboard)/dashboard/vendas/page.tsx`
- Protecao: ProtectedRoute permission="sales.view"

**Sub-paginas:**
- `/dashboard/vendas/[id]/detalhes` — Detalhes da venda
- `/dashboard/vendas/[id]/imprimir` — Impressao da venda

**Funcionalidades:**
1. Listar vendas com paginacao e filtros
   - API: `/api/sales`
   - Models: Sale, Customer, User, SaleItem, SalePayment
   - Operacao: Leitura

2. Cancelar venda
   - API: `DELETE /api/sales/[id]`
   - Models: Sale, SaleItem, SalePayment, BranchStock, Product, AccountReceivable, Commission, FinanceEntry, CashMovement, CashbackMovement, CustomerReminder
   - Operacao: Escrita ⚡ (transacao)

3. Reativar venda cancelada
   - API: `POST /api/sales/[id]/reactivate`
   - Models: Sale, BranchStock, Product, StockMovement, CashMovement, Commission
   - Operacao: Escrita ⚡

4. Alterar vendedor
   - API: `PATCH /api/sales/[id]/seller`
   - Models: Sale, User
   - Operacao: Escrita

5. Gerar PDF da venda
   - API: `/api/sales/[id]/pdf`
   - Models: Sale, Company, CompanySettings
   - Operacao: Leitura

6. Imprimir carne (crediario)
   - API: `/api/sales/[id]/carne`
   - Models: AccountReceivable, Sale, Company
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 4. ORCAMENTOS
- Rota: `/dashboard/orcamentos`
- Arquivo: `src/app/(dashboard)/dashboard/orcamentos/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/orcamentos/novo`
- `/dashboard/orcamentos/[id]`
- `/dashboard/orcamentos/[id]/editar`
- `/dashboard/orcamentos/[id]/imprimir`

**Funcionalidades:**
1. Listar orcamentos com filtros de status
   - API: `/api/quotes`
   - Models: Quote, QuoteItem, Customer
   - Operacao: Leitura

2. Criar orcamento
   - API: `POST /api/quotes`
   - Models: Quote, QuoteItem
   - Operacao: Escrita

3. Converter orcamento em venda
   - API: `POST /api/quotes/[id]/convert`
   - Models: Quote, Sale, SaleItem
   - Operacao: Escrita ⚡

4. Follow-up de orcamentos
   - API: `/api/quotes/[id]/follow-ups`
   - Models: QuoteFollowUp
   - Operacao: Leitura + Escrita

5. Estatisticas de conversao
   - API: `/api/quotes/stats`
   - Models: Quote
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 5. ORDENS DE SERVICO
- Rota: `/dashboard/ordens-servico`
- Arquivo: `src/app/(dashboard)/dashboard/ordens-servico/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/ordens-servico/nova`
- `/dashboard/ordens-servico/[id]/detalhes`
- `/dashboard/ordens-servico/[id]/editar`
- `/dashboard/ordens-servico/[id]/imprimir`

**Funcionalidades:**
1. Listar OS com filtros (status, atrasadas, vencendo)
   - API: `/api/service-orders`
   - Models: ServiceOrder, Customer, Lab
   - Operacao: Leitura

2. Criar OS
   - API: `POST /api/service-orders`
   - Models: ServiceOrder, ServiceOrderItem, ServiceOrderHistory
   - Operacao: Escrita ⚡

3. Alterar status (fluxo: DRAFT > APPROVED > SENT_TO_LAB > IN_PROGRESS > READY > DELIVERED)
   - API: `PATCH /api/service-orders/[id]/status`
   - Models: ServiceOrder, ServiceOrderHistory
   - Operacao: Escrita

4. Entregar OS ao cliente
   - API: `POST /api/service-orders/[id]/deliver`
   - Models: ServiceOrder, ServiceOrderHistory
   - Operacao: Escrita

5. Imprimir OS
   - Pagina: `/dashboard/ordens-servico/[id]/imprimir`
   - Operacao: Frontend (window.print)

**Alertas:** Nenhum

═══════════════════════════════════════════
### 6. CLIENTES
- Rota: `/dashboard/clientes`
- Arquivo: `src/app/(dashboard)/dashboard/clientes/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/clientes/novo`
- `/dashboard/clientes/[id]`
- `/dashboard/clientes/[id]/editar`

**Funcionalidades:**
1. Listar clientes com busca e filtros
   - API: `/api/customers`
   - Models: Customer
   - Operacao: Leitura

2. Criar/Editar cliente
   - API: `POST/PUT /api/customers`
   - Models: Customer
   - Operacao: Escrita

3. Importar clientes (CSV)
   - API: `POST /api/customers/import`
   - Models: Customer
   - Operacao: Escrita

4. Exportar clientes (Excel)
   - API: `/api/customers/export`
   - Models: Customer
   - Operacao: Leitura

5. Detalhes do cliente (vendas, OS, cashback, receituario)
   - API: `/api/customers/[id]`, `/api/customers/[id]/receivables`
   - Models: Customer, Sale, ServiceOrder, CustomerCashback, Prescription, AccountReceivable
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 7. PRODUTOS
- Rota: `/dashboard/produtos`
- Arquivo: `src/app/(dashboard)/dashboard/produtos/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/produtos/novo`
- `/dashboard/produtos/[id]/editar`

**Funcionalidades:**
1. Listar produtos com filtros (tipo, marca, fornecedor, estoque)
   - API: `/api/products`
   - Models: Product, Brand, Category, Supplier
   - Operacao: Leitura

2. Criar/Editar produto
   - API: `POST/PUT /api/products`
   - Models: Product, FrameDetail, ContactLensDetail, etc.
   - Operacao: Escrita

3. Importar produtos (CSV)
   - API: `POST /api/products/import`
   - Models: Product, Brand, Category, Supplier
   - Operacao: Escrita

4. Exportar produtos (Excel)
   - API: `/api/products/export`
   - Models: Product
   - Operacao: Leitura

5. Gerar codigos de barras
   - API: `/api/products/[id]/barcodes`
   - Models: ProductBarcode
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 8. FORNECEDORES
- Rota: `/dashboard/fornecedores`
- Arquivo: `src/app/(dashboard)/dashboard/fornecedores/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. CRUD de fornecedores
   - API: `/api/suppliers`
   - Models: Supplier
   - Operacao: Leitura + Escrita

2. Importar/Exportar
   - API: `/api/suppliers/import`, `/api/suppliers/export`
   - Models: Supplier
   - Operacao: Leitura + Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 9. LABORATORIOS
- Rota: `/dashboard/laboratorios`
- Arquivo: `src/app/(dashboard)/dashboard/laboratorios/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. CRUD de laboratorios
   - API: `/api/laboratories`
   - Models: Lab
   - Operacao: Leitura + Escrita

2. Ver OS vinculadas ao laboratorio
   - API: `/api/laboratories/[id]/service-orders`
   - Models: ServiceOrder, Lab
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 10. TRATAMENTOS
- Rota: `/dashboard/tratamentos`
- Arquivo: `src/app/(dashboard)/dashboard/tratamentos/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. CRUD de tratamentos de lentes
   - API: `/api/lens-treatments`
   - Models: LensTreatment
   - Operacao: Leitura + Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 11. FUNCIONARIOS
- Rota: `/dashboard/funcionarios`
- Arquivo: `src/app/(dashboard)/dashboard/funcionarios/page.tsx`
- Protecao: ProtectedRoute permission="users.view"

**Sub-paginas:**
- `/dashboard/funcionarios/[id]/permissoes`

**Funcionalidades:**
1. Cadastro simplificado de vendedores (nome + comissao)
   - API: `POST /api/users`
   - Models: User, UserBranch
   - Operacao: Escrita

2. Editar vendedor
   - API: `PUT /api/users/[id]`
   - Models: User
   - Operacao: Escrita

3. Ativar/Desativar vendedor
   - API: `DELETE/PUT /api/users/[id]`
   - Models: User
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 12. USUARIOS DO SISTEMA
- Rota: `/dashboard/usuarios`
- Arquivo: `src/app/(dashboard)/dashboard/usuarios/page.tsx`
- Protecao: ProtectedRoute permission="users.view"

**Sub-paginas:**
- `/dashboard/usuarios/[id]/permissoes`

**Funcionalidades:**
1. Criar usuario com login/senha
   - API: `POST /api/users`
   - Models: User, UserBranch
   - Operacao: Escrita

2. Resetar senha
   - API: `PATCH /api/users/[id]`
   - Models: User
   - Operacao: Escrita

3. Gerenciar permissoes individuais
   - API: `/api/users/[id]/permissions`
   - Models: UserPermission, Permission, RolePermission
   - Operacao: Leitura + Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 13. ESTOQUE
- Rota: `/dashboard/estoque`
- Arquivo: `src/app/(dashboard)/dashboard/estoque/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/estoque/ajustes`
- `/dashboard/estoque/transferencias`

**Funcionalidades:**
1. Posicao de estoque (lista de produtos com qtd)
   - API: `/api/products`
   - Models: Product, BranchStock
   - Operacao: Leitura

2. Ajustes de estoque (solicitar, aprovar, rejeitar)
   - API: `/api/stock-adjustments`
   - Models: StockAdjustment, Product, StockMovement
   - Operacao: Escrita

3. Transferencias entre filiais
   - API: `/api/stock-transfers`
   - Models: StockTransfer, StockTransferItem, BranchStock, Product
   - Operacao: Escrita ⚡

**Alertas:** Nenhum

═══════════════════════════════════════════
### 14. CAIXA
- Rota: `/dashboard/caixa`
- Arquivo: `src/app/(dashboard)/dashboard/caixa/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/caixa/historico`
- `/dashboard/caixa/[id]/relatorio`

**Funcionalidades:**
1. Abrir/Fechar caixa
   - API: `POST /api/cash/shift`, `POST /api/cash/shift/close`
   - Models: CashShift, CashMovement
   - Operacao: Escrita

2. Sangria (retirada) / Reforco (deposito)
   - API: `POST /api/cash/movements`
   - Models: CashMovement
   - Operacao: Escrita

3. Resumo de pagamentos por metodo
   - Dados: CashMovement (local)
   - Operacao: Frontend

4. Historico de turnos
   - API: `/api/cash-registers`
   - Models: CashShift
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 15. FINANCEIRO (Contas Pagar/Receber)
- Rota: `/dashboard/financeiro`
- Arquivo: `src/app/(dashboard)/dashboard/financeiro/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/financeiro/contas` — Contas financeiras
- `/dashboard/financeiro/dashboard` — Dashboard financeiro
- `/dashboard/financeiro/dre` — DRE Dinamica
- `/dashboard/financeiro/fluxo-caixa` — Fluxo de Caixa
- `/dashboard/financeiro/lancamentos` — Lancamentos contabeis
- `/dashboard/financeiro/plano-contas` — Plano de Contas
- `/dashboard/financeiro/devolucoes` — Devolucoes
- `/dashboard/financeiro/lotes-estoque` — Lotes de Estoque (FIFO)
- `/dashboard/financeiro/bi` — BI Analitico
- `/dashboard/financeiro/conciliacao` — Conciliacao bancaria
- `/dashboard/financeiro/conciliacao/[id]` — Detalhe batch

**Funcionalidades:**
1. Contas a Pagar — CRUD
   - API: `/api/accounts-payable`
   - Models: AccountPayable, Supplier
   - Operacao: Leitura + Escrita

2. Contas a Receber — CRUD + recebimento
   - API: `/api/accounts-receivable`
   - Models: AccountReceivable, Customer
   - Operacao: Leitura + Escrita

3. Dashboard financeiro (receita, margem, lucro)
   - API: `/api/finance/dashboard`
   - Models: FinanceEntry, Sale, User, FinanceAccount
   - Operacao: Leitura

4. DRE Dinamica
   - API: `/api/finance/reports/dre`
   - Models: FinanceEntry, ChartOfAccounts
   - Operacao: Leitura

5. Fluxo de Caixa
   - API: `/api/finance/reports/cash-flow`
   - Models: FinanceEntry
   - Operacao: Leitura

6. Lancamentos contabeis
   - API: `/api/finance/entries`
   - Models: FinanceEntry, ChartOfAccounts, FinanceAccount
   - Operacao: Leitura + Escrita

7. Plano de Contas
   - API: `/api/finance/chart`
   - Models: ChartOfAccounts
   - Operacao: Leitura + Escrita

8. Contas financeiras (Caixa, PIX, Banco, Adquirente)
   - API: `/api/finance/accounts`
   - Models: FinanceAccount
   - Operacao: Leitura + Escrita

9. Devolucoes
   - API: `/api/sales/[id]/refund`, `/api/sales/[id]/refunds`
   - Models: Refund, RefundItem, Sale, FinanceEntry
   - Operacao: Escrita ⚡

10. Lotes de estoque (FIFO)
    - API: `/api/inventory/lots`
    - Models: InventoryLot
    - Operacao: Leitura + Escrita

11. BI Analitico
    - API: `/api/finance/bi`
    - Models: Sale, SaleItem, SalePayment, Product, User
    - Operacao: Leitura

12. Conciliacao bancaria
    - API: `/api/finance/reconciliation/*`
    - Models: ReconciliationBatch, ReconciliationItem, ReconciliationTemplate, ReconciliationRule, SalePayment
    - Operacao: Leitura + Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 16. CASHBACK
- Rota: `/dashboard/cashback`
- Arquivo: `src/app/(dashboard)/dashboard/cashback/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. Resumo de cashback (saldo total, expiracoes)
   - API: `/api/cashback/summary`
   - Models: CustomerCashback
   - Operacao: Leitura

2. Lista de clientes com cashback
   - API: `/api/cashback/customers`
   - Models: CustomerCashback, Customer
   - Operacao: Leitura

3. Movimentacoes por cliente
   - API: `/api/cashback/customer/[id]`
   - Models: CashbackMovement
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 17. METAS
- Rota: `/dashboard/metas`
- Arquivo: `src/app/(dashboard)/dashboard/metas/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. Dashboard de metas (progresso, ranking vendedores)
   - API: `/api/goals/dashboard`
   - Models: SalesGoal, SellerGoal, Sale, User
   - Operacao: Leitura

2. Definir metas mensais
   - API: `POST /api/goals`
   - Models: SalesGoal, SellerGoal
   - Operacao: Escrita

3. Calcular/Pagar comissoes
   - API: `/api/goals/commissions`
   - Models: SellerCommission, Commission
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 18. CAMPANHAS
- Rota: `/dashboard/campanhas`
- Arquivo: `src/app/(dashboard)/dashboard/campanhas/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. CRUD de campanhas de bonificacao
   - API: `/api/product-campaigns`
   - Models: ProductCampaign, ProductCampaignItem
   - Operacao: Leitura + Escrita

2. Ativar/Pausar campanha
   - API: `POST /api/product-campaigns/[id]/activate|pause`
   - Models: ProductCampaign
   - Operacao: Escrita

3. Relatorio e simulacao
   - API: `/api/product-campaigns/[id]/report|simulate`
   - Models: CampaignBonusEntry, CampaignSellerProgress
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 19. LEMBRETES (CRM)
- Rota: `/dashboard/lembretes`
- Arquivo: `src/app/(dashboard)/dashboard/lembretes/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/lembretes/configuracoes`

**Funcionalidades:**
1. Lista de lembretes por segmento
   - API: `/api/crm/reminders`
   - Models: CustomerReminder, Customer
   - Operacao: Leitura

2. Registrar contato com cliente
   - API: `POST /api/crm/contacts`
   - Models: CrmContact, CustomerReminder
   - Operacao: Escrita

3. Configurar templates de mensagem
   - API: `/api/crm/templates`
   - Models: MessageTemplate
   - Operacao: Leitura + Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 20. RELATORIOS (12 sub-paginas)
- Rota: `/dashboard/relatorios`
- Arquivo: `src/app/(dashboard)/dashboard/relatorios/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/relatorios/vendas`
- `/dashboard/relatorios/comissoes`
- `/dashboard/relatorios/contas-receber`
- `/dashboard/relatorios/contas-pagar`
- `/dashboard/relatorios/dre`
- `/dashboard/relatorios/metricas-lentes`
- `/dashboard/relatorios/posicao-estoque`
- `/dashboard/relatorios/produtos-sem-giro`
- `/dashboard/relatorios/produtos-vendidos`
- `/dashboard/relatorios/historico-caixas`
- `/dashboard/relatorios/comparativo-lojas`
- `/dashboard/relatorios/avancados`

**Funcionalidades:**
1. Dashboard geral de relatorios (horario pico, vendas, clientes)
   - API: `/api/reports/dashboard`
   - Models: Sale, Customer, SaleItem, Product, User
   - Operacao: Leitura

2. Relatorio de vendas consolidado
   - API: `/api/reports/sales/consolidated`
   - Models: Sale, SalePayment
   - Operacao: Leitura

3. Relatorio de comissoes
   - API: `/api/reports/commissions`
   - Models: Commission, User
   - Operacao: Leitura

4. Comparativo entre lojas
   - API: `/api/reports/branch-comparison`
   - Models: Branch, Sale, Customer, ServiceOrder
   - Operacao: Leitura

5. Metricas de lentes
   - API: `/api/reports/optical`
   - Models: SaleItem, ServiceOrder
   - Operacao: Leitura

6. Posicao de estoque
   - API: `/api/reports/stock/position`
   - Models: Product, BranchStock
   - Operacao: Leitura

7. Produtos sem giro
   - API: `/api/reports/stock/no-movement`
   - Models: Product, StockMovement
   - Operacao: Leitura

**Alertas:** Nenhum

═══════════════════════════════════════════
### 21. CONFIGURACOES (7 sub-paginas)
- Rota: `/dashboard/configuracoes`
- Arquivo: `src/app/(dashboard)/dashboard/configuracoes/page.tsx`
- Protecao: ProtectedRoute

**Sub-paginas:**
- `/dashboard/configuracoes/empresa`
- `/dashboard/configuracoes/aparencia`
- `/dashboard/configuracoes/comissoes`
- `/dashboard/configuracoes/permissoes`
- `/dashboard/configuracoes/regras`
- `/dashboard/configuracoes/lembretes`
- `/dashboard/configuracoes/cashback`

**Funcionalidades:**
1. Dados da empresa (nome, CNPJ, telefone, endereco)
   - API: `/api/company/settings`
   - Models: CompanySettings, Company
   - Operacao: Leitura + Escrita

2. Logo da empresa
   - API: `/api/company/logo`
   - Models: CompanySettings
   - Operacao: Escrita

3. Aparencia (cor primaria)
   - API: `/api/company/settings`
   - Models: CompanySettings
   - Operacao: Escrita

4. Configuracao de comissoes
   - API: `/api/goals/config`
   - Models: CommissionConfig
   - Operacao: Leitura + Escrita

5. Seed de permissoes
   - API: `POST /api/permissions/seed`
   - Models: Permission, RolePermission
   - Operacao: Escrita

6. Regras do sistema
   - API: `/api/settings/rules`
   - Models: SystemRule
   - Operacao: Leitura + Escrita

7. Templates de mensagens
   - API: `/api/crm/settings`, `/api/crm/templates`
   - Models: CrmSettings, MessageTemplate
   - Operacao: Leitura + Escrita

8. Configuracao de cashback
   - API: `/api/cashback/config`
   - Models: CashbackConfig
   - Operacao: Leitura + Escrita

9. Importar/Deletar dados em massa
   - API: `/api/data-management/*`
   - Models: Todos
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 22. ONBOARDING
- Rota: `/dashboard/onboarding`
- Arquivo: `src/app/(dashboard)/dashboard/onboarding/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. Setup inicial da empresa (wizard multi-step)
   - API: `/api/onboarding`
   - Models: Company, CompanySettings, Category, Product
   - Operacao: Escrita

**Alertas:** Nenhum

═══════════════════════════════════════════
### 23. DIAGNOSTICO DE CAIXA
- Rota: `/dashboard/diagnostico-caixa`
- Arquivo: `src/app/(dashboard)/dashboard/diagnostico-caixa/page.tsx`
- Protecao: ProtectedRoute

**Funcionalidades:**
1. Verificacao de integridade (CashShift vs CashMovement vs Sale)
   - API: `/api/cash/debug`
   - Models: CashShift, CashMovement, Sale
   - Operacao: Leitura

**Alertas:** Nenhum

---

## RESUMO A — Contadores

| Metrica | Valor |
|---------|-------|
| Total de paginas principais | 23 (dashboard) + 18 (admin) + 6 (public) = **47** |
| Total de sub-paginas | **42** |
| Total de funcionalidades mapeadas | **~280** |
| Total de models Prisma referenciados | **~70 de 116** |
| Total de rotas de API | **231** |
| Total de alertas | **18** (ver abaixo) |

---

## RESUMO B — Models Prisma Mais Utilizados

| Model | Paginas que usam |
|-------|-----------------|
| Sale | 12+ (PDV, Vendas, Dashboard, Metas, Relatorios, Financeiro) |
| Product | 10+ (PDV, Produtos, Estoque, Relatorios, Dashboard) |
| Customer | 10+ (Clientes, PDV, Vendas, Relatorios, CRM) |
| User | 8+ (Funcionarios, Usuarios, Metas, Vendas, PDV) |
| SaleItem | 7+ (Vendas, Relatorios, BI, Dashboard) |
| SalePayment | 7+ (Vendas, Caixa, Financeiro, Relatorios) |
| ServiceOrder | 6+ (OS, Dashboard, Relatorios, Labs) |
| FinanceEntry | 6+ (DRE, Fluxo, Dashboard, Lancamentos) |
| CashShift/CashMovement | 4+ (Caixa, PDV, Diagnostico) |
| AccountReceivable | 4+ (Financeiro, Vendas, Clientes) |
| AccountPayable | 3+ (Financeiro, Relatorios) |
| Quote | 3+ (Orcamentos) |
| Commission | 3+ (Metas, Vendas, Relatorios) |

---

## RESUMO C — Models Prisma NAO Referenciados (Possíveis Orfaos)

| Model | Observacao |
|-------|-----------|
| Appointment | Agendamentos — nenhuma pagina usa |
| Agreement / AgreementBeneficiary | Convenios — nenhuma pagina usa |
| LoyaltyProgram / LoyaltyTier / LoyaltyPoints | Fidelidade — nenhuma pagina usa (usa CustomerCashback no lugar) |
| Doctor | Medicos — usado apenas indiretamente via Prescription |
| CustomerDependent | Dependentes — nenhuma pagina mostra |
| Shape / Color | Formatos/Cores — nenhuma pagina usa (fields avulsos no Product) |
| DREReport | Relatorio DRE salvo — nenhuma pagina grava (usa calculo on-the-fly) |
| EmailQueue | Fila de email — nenhuma pagina mostra |
| SlaConfig | SLA de suporte — apenas admin |
| BillingEvent | Eventos de cobranca — apenas admin |
| TenantDomain | Dominios customizados — nenhuma pagina usa |
| UsageMetric / UsageSnapshot | Metricas de uso — apenas admin |

---

## RESUMO D — Rotas de API Possivelmente Orfas

| Rota | Observacao |
|------|-----------|
| `/api/cash/migrate-old-sales` | Script de migracao, nao chamado por pagina |
| `/api/admin/migrate-cash-movements` | Script de migracao |
| `/api/cash/debug` | Usado apenas pelo diagnostico-caixa |
| `/api/categories` | Retorna categorias mas poucas paginas usam |
| `/api/brands` | Retorna marcas — usado por filtros de produtos |
| `/api/card-fees` | Regras de taxa de cartao — pouco usada |
| `/api/cash-terminals` | Terminais de caixa — pagina nao encontrada |
| `/api/reports/card-settlement` | Liquidacao de cartao — sem pagina dedicada |
| `/api/reports/temporal` | Relatorio temporal — usado por relatorios/page |
| `/api/search` | Busca global — usada pelo header |

---

## RESUMO E — Alertas

### 🟡 Atencao (18)

1. **Models nao referenciados:** Appointment, Agreement, LoyaltyProgram (3 modulos inteiros sem pagina)
2. **CustomerDependent:** Cadastrado no schema mas nenhuma tela permite gerenciar dependentes
3. **DREReport:** Model para salvar DRE existe mas nenhuma pagina grava (usa calculo on-the-fly)
4. **EmailQueue:** Sistema de email existe mas nenhuma pagina mostra fila ou status
5. **Shape/Color:** Models existem mas nenhuma pagina usa para filtrar/categorizar
6. **Doctor:** Model existe mas cadastro de medicos nao tem pagina propria (usa inline em Prescription)
7. **cash-terminals API:** Rota existe mas nenhuma pagina de terminais encontrada
8. **Varios relatorios financeiros** (`/api/reports/financial/*`) existem mas as paginas podem estar usando rotas diferentes
9. **StockReservation:** Model existe mas nenhuma pagina gerencia reservas de estoque explicitamente
10. **CommissionRule:** Model existe mas comissoes usam CommissionConfig + percentage no User
11. **LabPriceRange:** Tabela de precos por lab/tratamento existe mas nenhuma pagina edita
12. **Prescription/PrescriptionValues:** Receituario existe mas pagina de criar prescricao independente nao foi encontrada (inline na OS)
13. **Warranty/WarrantyClaim:** Sistema de garantia existe mas pagina dedicada nao encontrada (inline na OS)
14. **FrameDetail/ContactLensDetail/etc:** Detalhes especificos por tipo de produto existem mas poucos campos sao preenchidos na importacao
15. **card-settlement report:** Rota existe mas sem pagina dedicada de liquidacao
16. **ReconciliationRule:** Model existe e rota funciona mas interface pode estar incompleta
17. **CashRegister:** Model de caixa fisico existe mas a gestao usa CashShift direto (sem associar terminal)
18. **DailyAgg:** Tabela de agregacao diaria existe mas nao é populada automaticamente pelas vendas

### 🔴 Criticos: **Nenhum**

Nenhum problema critico de seguranca (companyId faltando) ou funcionalidade quebrada encontrado no mapeamento.

---

## ARQUIVOS ANALISADOS

- 89 arquivos `page.tsx` (dashboard + admin + public)
- 231 arquivos `route.ts` (API)
- 1 arquivo `schema.prisma` (116 models, 52 enums)
- ~30 arquivos de servicos (`src/services/*.ts`)
- ~15 arquivos de componentes criticos (`src/components/pdv/*`, `src/components/layout/*`)
- ~10 arquivos de hooks/utils
