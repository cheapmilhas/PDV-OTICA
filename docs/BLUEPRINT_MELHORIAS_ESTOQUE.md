# 📐 BLUEPRINT COMPLETO - Melhorias de Estoque

## ✅ STATUS DO SCHEMA PRISMA
- [x] 3 novos enums criados
- [x] 3 novas tabelas criadas
- [x] Relações atualizadas em Company, User, Product
- [x] Prisma Client gerado com sucesso

---

## 🗄️ **1. BANCO DE DADOS (PRISMA SCHEMA)**

### Novos Enums:
```prisma
enum StockAdjustmentType {
  DAMAGE, THEFT, SUPPLIER_RETURN, COUNT_ERROR,
  FREE_SAMPLE, EXPIRATION, INTERNAL_USE, OTHER
}

enum StockAdjustmentStatus {
  PENDING, APPROVED, REJECTED, AUTO_APPROVED
}

enum RuleCategory {
  STOCK, SALES, FINANCIAL, PRODUCTS, CUSTOMERS, REPORTS
}

enum BarcodeType {
  EAN13, CODE128, QRCODE
}
```

### Novas Tabelas:

#### **StockAdjustment** (Ajustes de Estoque)
- Registra todos os ajustes manuais de estoque
- Workflow de aprovação baseado em regras
- Auditoria completa (quem, quando, por quê, quanto)
- Anexos de fotos/documentos

#### **SystemRule** (Regras do Sistema)
- Configurações dinâmicas por empresa
- Chave-valor flexível (JSON)
- Categorizado por módulo
- Permite criar regras sem alterar código

#### **ProductBarcode** (Códigos de Barras)
- Múltiplos códigos por produto
- Tipos: EAN-13, Code128, QR Code
- Código principal (isPrimary)
- Rastreabilidade de quem criou

---

## 📦 **2. VALIDATION SCHEMAS (ZOD)**

### Arquivos a criar:

#### `/src/lib/validations/stock-adjustment.schema.ts`
```typescript
- createStockAdjustmentSchema
- approveStockAdjustmentSchema
- rejectStockAdjustmentSchema
- stockAdjustmentQuerySchema
- getStockAdjustmentTypeLabel()
- getStockAdjustmentStatusLabel()
```

#### `/src/lib/validations/system-rule.schema.ts`
```typescript
- createSystemRuleSchema
- updateSystemRuleSchema
- systemRuleQuerySchema
- getRuleCategoryLabel()
- getDefaultRules() // Regras padrão do sistema
```

#### `/src/lib/validations/barcode.schema.ts`
```typescript
- createBarcodeSchema
- barcodeQuerySchema
- generateEAN13()
- generateCode128()
- validateBarcode()
```

---

## 🔧 **3. SERVICES (BUSINESS LOGIC)**

### Arquivos a criar:

#### `/src/services/stock-adjustment.service.ts`
```typescript
class StockAdjustmentService {
  // CRUD
  create(data, companyId, userId): StockAdjustment
  list(query, companyId): PaginatedResult
  getById(id, companyId): StockAdjustment

  // Workflow
  approve(id, userId, companyId): StockAdjustment
  reject(id, userId, reason, companyId): StockAdjustment

  // Business Rules
  needsApproval(totalValue, companyId): boolean
  applyAdjustment(adjustment): void // Atualiza stockQty

  // Reports
  getAdjustmentsSummary(period, companyId): Summary
  getLossesByType(period, companyId): LossReport
}
```

#### `/src/services/system-rule.service.ts`
```typescript
class SystemRuleService {
  // CRUD
  upsert(key, value, companyId): SystemRule
  get(key, companyId): any // Retorna valor direto
  getByCategory(category, companyId): SystemRule[]
  delete(key, companyId): void

  // Helpers
  getStockRules(companyId): StockRules
  getSalesRules(companyId): SalesRules
  getFinancialRules(companyId): FinancialRules

  // Defaults
  seedDefaultRules(companyId): void
}
```

#### `/src/services/barcode.service.ts`
```typescript
class BarcodeService {
  // CRUD
  create(productId, type, userId, companyId): ProductBarcode
  list(productId): ProductBarcode[]
  setPrimary(barcodeId, productId): void
  delete(barcodeId): void

  // Generation
  generateEAN13(productId): string
  generateCode128(sku): string
  generateQRCode(productData): string

  // Lookup
  findProductByCode(code, companyId): Product | null
}
```

#### `/src/services/report.service.ts` (NOVO)
```typescript
class ReportService {
  // Curva ABC
  getABCCurve(companyId, filters): ABCCurveData

  // Giro de Estoque
  getStockTurnover(companyId, period): TurnoverData

  // Análise de Fornecedores
  getSuppliersAnalysis(companyId, period): SupplierAnalysis

  // Rupturas
  getStockRuptures(companyId, period): RuptureReport

  // Capital Imobilizado
  getImmobilizedCapital(companyId): CapitalReport
}
```

---

## 🛣️ **4. API ROUTES**

### Rotas a criar:

#### `/src/app/api/stock-adjustments/route.ts`
```typescript
GET    /api/stock-adjustments       // Listar ajustes (com filtros)
POST   /api/stock-adjustments       // Criar ajuste
```

#### `/src/app/api/stock-adjustments/[id]/route.ts`
```typescript
GET    /api/stock-adjustments/[id]  // Buscar ajuste
DELETE /api/stock-adjustments/[id]  // Cancelar ajuste (se pending)
```

#### `/src/app/api/stock-adjustments/[id]/approve/route.ts`
```typescript
POST   /api/stock-adjustments/[id]/approve  // Aprovar ajuste
```

#### `/src/app/api/stock-adjustments/[id]/reject/route.ts`
```typescript
POST   /api/stock-adjustments/[id]/reject   // Rejeitar ajuste
```

#### `/src/app/api/settings/rules/route.ts`
```typescript
GET    /api/settings/rules           // Listar regras (por categoria)
POST   /api/settings/rules           // Criar/atualizar regra
```

#### `/src/app/api/settings/rules/[key]/route.ts`
```typescript
GET    /api/settings/rules/[key]     // Buscar regra específica
DELETE /api/settings/rules/[key]     // Deletar regra
```

#### `/src/app/api/products/[id]/barcodes/route.ts`
```typescript
GET    /api/products/[id]/barcodes   // Listar códigos do produto
POST   /api/products/[id]/barcodes   // Criar novo código
```

#### `/src/app/api/products/[id]/barcodes/[barcodeId]/route.ts`
```typescript
PATCH  /api/products/[id]/barcodes/[barcodeId]  // Tornar primário
DELETE /api/products/[id]/barcodes/[barcodeId]  // Deletar código
```

#### `/src/app/api/products/search-by-barcode/route.ts`
```typescript
GET    /api/products/search-by-barcode?code=123  // Buscar por código
```

#### `/src/app/api/reports/abc-curve/route.ts`
```typescript
GET    /api/reports/abc-curve?period=...  // Curva ABC
```

#### `/src/app/api/reports/stock-turnover/route.ts`
```typescript
GET    /api/reports/stock-turnover?period=...  // Giro de estoque
```

#### `/src/app/api/reports/suppliers-analysis/route.ts`
```typescript
GET    /api/reports/suppliers-analysis?period=...  // Análise fornecedores
```

#### `/src/app/api/reports/stock-ruptures/route.ts`
```typescript
GET    /api/reports/stock-ruptures?period=...  // Rupturas
```

---

## 🎨 **5. COMPONENTES UI**

### Componentes a criar:

#### Ajustes de Estoque:
- `/src/components/estoque/modal-ajuste-estoque.tsx`
  - Form completo com validações
  - Upload de fotos
  - Cálculo automático do valor
  - Mensagem de aprovação necessária

- `/src/components/estoque/lista-ajustes.tsx`
  - Tabela de ajustes com filtros
  - Status badges
  - Ações (aprovar, rejeitar, detalhes)

- `/src/components/estoque/detalhes-ajuste.tsx`
  - Modal de detalhes completo
  - Timeline de aprovação
  - Fotos anexadas

#### Códigos de Barras:
- `/src/components/produtos/gerenciador-codigos.tsx`
  - Lista de códigos existentes
  - Botões para gerar EAN13/Code128/QRCode
  - Marcar como principal
  - Deletar código

- `/src/components/produtos/modal-gerar-codigo.tsx`
  - Escolher tipo (EAN13, Code128, QRCode)
  - Preview do código gerado
  - Imprimir etiqueta

- `/src/components/produtos/etiqueta-impressao.tsx`
  - Layout de etiqueta para impressão
  - Código de barras renderizado
  - Informações do produto

- `/src/components/shared/leitor-codigo-barras.tsx`
  - Scanner universal (USB + Webcam)
  - Feedback visual
  - Callback quando lê código

#### Regras do Sistema:
- `/src/components/configuracoes/editor-regras.tsx`
  - Formulário dinâmico por categoria
  - Inputs tipados (number, boolean, select, etc)
  - Descrição de cada regra
  - Valores padrão

- `/src/components/configuracoes/card-regra.tsx`
  - Visualização de uma regra
  - Edição inline
  - Toggle ativo/inativo

#### Relatórios:
- `/src/components/relatorios/grafico-curva-abc.tsx`
  - Gráfico de Pareto (Recharts)
  - Legenda A, B, C
  - Filtros

- `/src/components/relatorios/tabela-giro-estoque.tsx`
  - Tabela com produtos e suas métricas
  - Destaque para alto/baixo giro
  - Export Excel

- `/src/components/relatorios/analise-fornecedores.tsx`
  - Cards/tabela de fornecedores
  - Métricas (total comprado, prazo, etc)
  - Ranking

- `/src/components/relatorios/dashboard-rupturas.tsx`
  - Lista de produtos que ficaram sem estoque
  - Estimativa de vendas perdidas
  - Timeline

- `/src/components/relatorios/export-button.tsx`
  - Botão universal de exportação
  - Opções: Excel, PDF, CSV
  - Loading state

---

## 📄 **6. PÁGINAS**

### Páginas a criar:

#### Estoque:
- `/src/app/(dashboard)/dashboard/estoque/ajustes/page.tsx`
  - Dashboard de ajustes pendentes
  - Lista de todos os ajustes
  - Botão criar ajuste
  - Filtros e busca

#### Configurações:
- `/src/app/(dashboard)/dashboard/configuracoes/regras/page.tsx`
  - Tabs por categoria (Estoque, Vendas, Financeiro, etc)
  - Editor de regras em cada tab
  - Botão "Restaurar padrões"

#### Relatórios:
- `/src/app/(dashboard)/dashboard/relatorios/page.tsx`
  - Dashboard principal de relatórios
  - Cards clicáveis para cada tipo

- `/src/app/(dashboard)/dashboard/relatorios/curva-abc/page.tsx`
  - Gráfico + tabela de curva ABC
  - Filtros avançados
  - Export

- `/src/app/(dashboard)/dashboard/relatorios/giro-estoque/page.tsx`
  - Métricas de giro
  - Tabela de produtos
  - Export

- `/src/app/(dashboard)/dashboard/relatorios/fornecedores/page.tsx`
  - Análise detalhada de fornecedores
  - Gráficos comparativos
  - Export

- `/src/app/(dashboard)/dashboard/relatorios/rupturas/page.tsx`
  - Lista de rupturas
  - Timeline
  - Export

- `/src/app/(dashboard)/dashboard/relatorios/ajustes/page.tsx`
  - Relatório mensal de ajustes/perdas
  - Gráficos por tipo
  - Total de perdas

#### Produtos (atualização):
- Adicionar seção "Códigos" na página de detalhes do produto
- Botões para gerar códigos
- Lista de códigos existentes

---

## 🔄 **7. FLUXOS DE INTEGRAÇÃO**

### Fluxo 1: Criar Ajuste de Estoque
```
1. Usuário clica "Ajustar Estoque" em um produto
2. Modal abre com form
3. Usuário preenche tipo, quantidade, motivo
4. Sistema calcula valor total (qtd × custo)
5. Sistema consulta SystemRule para ver se precisa aprovação
6. Se valor > limite:
   - Status = PENDING
   - Notifica aprovador
7. Se valor <= limite:
   - Status = AUTO_APPROVED
   - Aplica ajuste imediatamente (atualiza stockQty)
8. Cria registro de StockAdjustment
9. Atualiza lista
```

### Fluxo 2: Aprovar Ajuste
```
1. Aprovador acessa dashboard de ajustes pendentes
2. Clica em "Detalhes" do ajuste
3. Vê todas as informações + fotos
4. Clica "Aprovar"
5. Sistema:
   - Atualiza status para APPROVED
   - Atualiza stockQty do produto
   - Registra approvedBy e approvedAt
   - Notifica quem criou
```

### Fluxo 3: Gerar Código de Barras
```
1. Usuário acessa produto
2. Clica "Gerar Código"
3. Modal abre com opções: EAN-13, Code128, QRCode
4. Usuário escolhe tipo
5. Sistema gera código:
   - EAN-13: Algoritmo padrão baseado em SKU + checksum
   - Code128: SKU alfanumérico
   - QRCode: JSON com dados do produto
6. Preview do código gerado
7. Usuário pode:
   - Salvar no banco (ProductBarcode)
   - Imprimir etiqueta
   - Cancelar
```

### Fluxo 4: Scanner de Código
```
1. Usuário clica "Buscar por Código"
2. Modal abre com input + botão camera
3. Opções:
   a) Leitor USB: Digita automaticamente no input
   b) Webcam: Abre câmera, detecta código com @zxing/library
4. Quando código é lido:
   - API busca produto: GET /api/products/search-by-barcode?code=XXX
   - Se encontrado: Redireciona para produto ou adiciona ao carrinho
   - Se não encontrado: Mensagem "Produto não encontrado"
```

### Fluxo 5: Configurar Regras
```
1. ADMIN acessa /dashboard/configuracoes/regras
2. Escolhe categoria (ex: STOCK)
3. Vê lista de regras dessa categoria
4. Para cada regra:
   - Input apropriado (number, boolean, select)
   - Descrição do que a regra faz
5. Ao salvar:
   - POST /api/settings/rules
   - Upsert no banco (by key)
6. Outras partes do sistema consultam essas regras via RuleService
```

---

## 📊 **8. ESTRUTURA DE REGRAS PADRÃO**

### Regras de Estoque (`STOCK`):
```json
{
  "stock.adjustment.approval_amount": 500,
  "stock.adjustment.require_photo_above": 1000,
  "stock.adjustment.min_reason_length": 20,
  "stock.allow_negative_stock": false,
  "stock.low_stock_alert_percent": 20,
  "stock.block_sale_without_stock": true
}
```

### Regras de Vendas (`SALES`):
```json
{
  "sales.discount.max_seller": 10,
  "sales.discount.max_manager": 30,
  "sales.discount.max_admin": 100,
  "sales.discount.approval_above": 15,
  "sales.cancel.max_days": 7,
  "sales.cancel.approval_above": 500,
  "sales.max_installments": 12
}
```

### Regras Financeiras (`FINANCIAL`):
```json
{
  "financial.payment.approval_amount": 5000,
  "financial.overdue.interest_percent": 2,
  "financial.overdue.fine_percent": 10,
  "financial.alert_days_before_due": 3
}
```

---

## 🎯 **9. PRIORIZAÇÃO DE IMPLEMENTAÇÃO**

### FASE 1 (Alta Prioridade) - 4-5 horas
1. ✅ Schema Prisma (CONCLUÍDO)
2. ⏳ Validation schemas (Zod)
3. ⏳ Services (business logic)
4. ⏳ API Routes básicas

### FASE 2 (Alta Prioridade) - 3-4 horas
5. ⏳ Modal de Ajuste de Estoque
6. ⏳ Dashboard de Ajustes
7. ⏳ Workflow de Aprovação

### FASE 3 (Média Prioridade) - 3-4 horas
8. ⏳ Central de Regras (ADMIN)
9. ⏳ Integração regras com ajustes

### FASE 4 (Média Prioridade) - 4-5 horas
10. ⏳ Sistema de Códigos de Barras
11. ⏳ Geração de códigos
12. ⏳ Scanner

### FASE 5 (Baixa Prioridade) - 5-6 horas
13. ⏳ Relatórios Avançados
14. ⏳ Exportação Excel/PDF

---

## 🔌 **10. BIBLIOTECAS NECESSÁRIAS**

```bash
# Já instaladas:
- recharts (gráficos)
- date-fns (datas)
- zod (validação)

# A instalar:
npm install jsbarcode qrcode @zxing/library xlsx jspdf jspdf-autotable
```

---

## ✅ **CHECKLIST DE IMPLEMENTAÇÃO**

### Banco de Dados
- [x] Schema Prisma criado
- [x] Prisma Client gerado
- [ ] Migration aplicada (produção)

### Backend
- [ ] Validation schemas (3 arquivos)
- [ ] Services (4 arquivos)
- [ ] API Routes (15 rotas)
- [ ] Helpers (barcode generation, rules engine)

### Frontend
- [ ] Componentes de Ajustes (3 componentes)
- [ ] Componentes de Códigos (4 componentes)
- [ ] Componentes de Regras (2 componentes)
- [ ] Componentes de Relatórios (5 componentes)
- [ ] Páginas (8 páginas)

### Testes
- [ ] Testar criação de ajuste
- [ ] Testar aprovação de ajuste
- [ ] Testar regras customizadas
- [ ] Testar geração de códigos
- [ ] Testar scanner
- [ ] Testar relatórios

---

**PRÓXIMO PASSO**: Criar validation schemas e services
