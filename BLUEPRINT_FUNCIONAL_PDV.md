# 🎯 BLUEPRINT FUNCIONAL - PDV ÓTICA

**Versão:** 1.0
**Data:** 04/02/2026
**Objetivo:** Documentar padrões únicos e plano de execução para implementação completa do sistema PDV Ótica

---

## 📋 ÍNDICE

1. [Padrão Único de UI](#1-padrão-único-de-ui)
2. [Padrão Único de Rotas (Frontend)](#2-padrão-único-de-rotas-frontend)
3. [Padrão Único de API (Backend)](#3-padrão-único-de-api-backend)
4. [Estrutura de Pastas](#4-estrutura-de-pastas)
5. [Autenticação e Permissões](#5-autenticação-e-permissões)
6. [Paginação, Busca e Erros](#6-paginação-busca-e-erros)
7. [Matriz Prisma](#7-matriz-prisma)
8. [Plano de Execução por Lotes](#8-plano-de-execução-por-lotes)
9. [Definition of Done](#9-definition-of-done)

---

## 1. PADRÃO ÚNICO DE UI

### ✅ DECISÃO: Opção A - "Novo/Editar" por ROTAS

**Padrão escolhido:** Navegação por rotas dedicadas para criação e edição de registros.

**Estrutura:**
- **Listagem:** `/dashboard/<entidade>`
- **Criar novo:** `/dashboard/<entidade>/novo`
- **Editar existente:** `/dashboard/<entidade>/[id]/editar`
- **Visualizar detalhes:** Modal/Sheet no mesmo contexto da listagem

### 🎯 JUSTIFICATIVA

| Critério | Rotas (Escolhido) | Modais |
|----------|-------------------|---------|
| **SEO e Deep Linking** | ✅ Permite URL única para cada ação | ❌ URL não reflete estado |
| **Navegação do Browser** | ✅ Botão voltar funciona nativamente | ⚠️ Requer controle manual |
| **Complexidade de Forms** | ✅ Melhor para formulários grandes | ⚠️ Modal pode ficar sobrecarregado |
| **Testabilidade** | ✅ Fácil testar cada rota | ⚠️ Requer simular abertura de modal |
| **UX Multi-etapas** | ✅ Wizard/Steps em página dedicada | ❌ Modal fica confuso |
| **Mobile** | ✅ Melhor uso de tela cheia | ⚠️ Modal pode ser pequeno |
| **Consistência** | ✅ Padrão REST tradicional | ⚠️ Padrão SPA moderno |

**Decisão final:** Para um sistema de gestão completo como PDV Ótica, com formulários complexos (Ordem de Serviço, Vendas com múltiplos itens, etc.), **rotas dedicadas** oferecem melhor experiência, manutenibilidade e escalabilidade.

### 📐 PADRÃO DE COMPONENTES

- **Listagem:** Página full com cards/tabela + filtros
- **Novo/Editar:** Página full com formulário estruturado
- **Visualização rápida:** Modal/Sheet para detalhes read-only (ex: detalhes do cliente, produto)
- **Ações rápidas:** Modal para ações simples (ex: sangria, reforço de caixa, cancelar venda)

---

## 2. PADRÃO ÚNICO DE ROTAS (FRONTEND)

### 📁 ESTRUTURA COMPLETA DE ROTAS

Todas as rotas seguirão o padrão App Router do Next.js:

```
src/app/(dashboard)/dashboard/
├── page.tsx                                    # Dashboard principal
├── clientes/
│   ├── page.tsx                                # Listagem
│   ├── novo/
│   │   └── page.tsx                            # Criar novo
│   ├── [id]/
│   │   └── editar/
│   │       └── page.tsx                        # Editar
│   └── importar/                               # Fase 2
│       └── page.tsx
├── produtos/
│   ├── page.tsx
│   ├── novo/
│   │   └── page.tsx
│   ├── [id]/
│   │   └── editar/
│   │       └── page.tsx
│   └── importar/
│       └── page.tsx
├── fornecedores/
│   ├── page.tsx
│   ├── novo/
│   │   └── page.tsx
│   └── [id]/
│       └── editar/
│           └── page.tsx
├── funcionarios/
│   ├── page.tsx
│   ├── novo/
│   │   └── page.tsx
│   └── [id]/
│       └── editar/
│           └── page.tsx
├── estoque/
│   ├── page.tsx                                # Listagem de movimentações
│   ├── entrada/
│   │   └── page.tsx                            # Nova entrada
│   ├── saida/
│   │   └── page.tsx                            # Nova saída
│   └── ajuste/
│       └── page.tsx                            # Ajuste manual
├── caixa/
│   ├── page.tsx                                # Listagem de turnos
│   ├── abrir/
│   │   └── page.tsx                            # Abrir caixa
│   └── [id]/
│       └── page.tsx                            # Detalhes do turno
├── vendas/
│   ├── page.tsx                                # Listagem de vendas
│   └── [id]/
│       └── page.tsx                            # Detalhes da venda
├── pdv/
│   └── page.tsx                                # Tela de PDV (carrinho)
├── ordens-servico/
│   ├── page.tsx
│   ├── novo/
│   │   └── page.tsx
│   ├── [id]/
│   │   ├── page.tsx                            # Visualizar
│   │   └── editar/
│   │       └── page.tsx
│   └── qualidade/
│       └── [id]/
│           └── page.tsx                        # Checklist de qualidade
├── financeiro/
│   ├── page.tsx                                # Dashboard financeiro
│   ├── contas-receber/
│   │   └── page.tsx
│   ├── contas-pagar/
│   │   └── page.tsx
│   └── dre/
│       └── page.tsx                            # DRE
├── relatorios/
│   ├── page.tsx                                # Hub de relatórios
│   ├── vendas/
│   │   └── page.tsx
│   ├── estoque/
│   │   └── page.tsx
│   ├── comissoes/
│   │   └── page.tsx
│   └── clientes/
│       └── page.tsx
├── configuracoes/
│   ├── page.tsx                                # Hub de configurações
│   ├── empresa/
│   │   └── page.tsx
│   ├── filiais/
│   │   └── page.tsx
│   ├── usuarios/
│   │   └── page.tsx
│   ├── comissoes/
│   │   └── page.tsx
│   └── fiscal/
│       └── page.tsx
└── metas/
    ├── page.tsx
    ├── novo/
    │   └── page.tsx
    └── [id]/
        └── editar/
            └── page.tsx
```

### 🔗 RESUMO DE ROTAS POR MÓDULO

| Módulo | Listagem | Novo | Editar | Detalhes | Importar |
|--------|----------|------|--------|----------|----------|
| **Clientes** | `/dashboard/clientes` | `/dashboard/clientes/novo` | `/dashboard/clientes/[id]/editar` | Modal | Fase 2 |
| **Produtos** | `/dashboard/produtos` | `/dashboard/produtos/novo` | `/dashboard/produtos/[id]/editar` | Modal | Fase 2 |
| **Fornecedores** | `/dashboard/fornecedores` | `/dashboard/fornecedores/novo` | `/dashboard/fornecedores/[id]/editar` | - | - |
| **Funcionários** | `/dashboard/funcionarios` | `/dashboard/funcionarios/novo` | `/dashboard/funcionarios/[id]/editar` | - | - |
| **Estoque** | `/dashboard/estoque` | Entrada/Saída/Ajuste | - | - | - |
| **Caixa** | `/dashboard/caixa` | `/dashboard/caixa/abrir` | - | `/dashboard/caixa/[id]` | - |
| **Vendas** | `/dashboard/vendas` | Via PDV | - | `/dashboard/vendas/[id]` | - |
| **PDV** | `/dashboard/pdv` | - | - | - | - |
| **Ordens de Serviço** | `/dashboard/ordens-servico` | `/dashboard/ordens-servico/novo` | `/dashboard/ordens-servico/[id]/editar` | `/dashboard/ordens-servico/[id]` | - |
| **Financeiro** | `/dashboard/financeiro` | - | - | - | - |
| **Relatórios** | `/dashboard/relatorios` | - | - | - | - |
| **Configurações** | `/dashboard/configuracoes` | Por submódulo | Por submódulo | - | - |
| **Metas** | `/dashboard/metas` | `/dashboard/metas/novo` | `/dashboard/metas/[id]/editar` | - | - |

---

## 3. PADRÃO ÚNICO DE API (BACKEND)

### 🔌 PADRÃO REST COMPLETO

Todas as APIs seguirão o padrão REST com os seguintes endpoints:

```
src/app/api/
├── <entidade>/
│   ├── route.ts                    # GET (list) + POST (create)
│   ├── [id]/
│   │   └── route.ts                # GET (getById) + PUT (update) + DELETE (delete)
│   ├── export/
│   │   └── route.ts                # GET (export CSV)
│   └── import/                     # Fase 2
│       └── route.ts                # POST (import CSV/Excel)
```

### 📊 MATRIZ COMPLETA DE ENDPOINTS

#### **1. CLIENTES** (`/api/customers`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/customers` | Listar clientes | `search`, `page`, `pageSize`, `status`, `city` | - | `{ data: Customer[], pagination: {...} }` |
| `POST` | `/api/customers` | Criar cliente | - | `CreateCustomerDTO` | `{ data: Customer }` |
| `GET` | `/api/customers/[id]` | Buscar por ID | - | - | `{ data: Customer }` |
| `PUT` | `/api/customers/[id]` | Atualizar cliente | - | `UpdateCustomerDTO` | `{ data: Customer }` |
| `DELETE` | `/api/customers/[id]` | Deletar cliente (soft) | - | - | `{ success: true }` |
| `GET` | `/api/customers/export` | Exportar CSV | Mesmos da lista | - | CSV File |
| `POST` | `/api/customers/import` | Importar CSV/Excel | - | `FormData` | `{ imported: number, errors: [] }` |

#### **2. PRODUTOS** (`/api/products`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/products` | Listar produtos | `search`, `page`, `pageSize`, `type`, `brandId`, `categoryId`, `inStock` | - | `{ data: Product[], pagination: {...} }` |
| `POST` | `/api/products` | Criar produto | - | `CreateProductDTO` | `{ data: Product }` |
| `GET` | `/api/products/[id]` | Buscar por ID | - | - | `{ data: Product }` |
| `PUT` | `/api/products/[id]` | Atualizar produto | - | `UpdateProductDTO` | `{ data: Product }` |
| `DELETE` | `/api/products/[id]` | Deletar produto | - | - | `{ success: true }` |
| `GET` | `/api/products/export` | Exportar CSV | Mesmos da lista | - | CSV File |
| `POST` | `/api/products/import` | Importar CSV/Excel | - | `FormData` | `{ imported: number, errors: [] }` |

#### **3. FORNECEDORES** (`/api/suppliers`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/suppliers` | Listar fornecedores | `search`, `page`, `pageSize`, `status` | - | `{ data: Supplier[], pagination: {...} }` |
| `POST` | `/api/suppliers` | Criar fornecedor | - | `CreateSupplierDTO` | `{ data: Supplier }` |
| `GET` | `/api/suppliers/[id]` | Buscar por ID | - | - | `{ data: Supplier }` |
| `PUT` | `/api/suppliers/[id]` | Atualizar fornecedor | - | `UpdateSupplierDTO` | `{ data: Supplier }` |
| `DELETE` | `/api/suppliers/[id]` | Deletar fornecedor | - | - | `{ success: true }` |
| `GET` | `/api/suppliers/export` | Exportar CSV | Mesmos da lista | - | CSV File |

#### **4. FUNCIONÁRIOS** (`/api/employees` → User)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/employees` | Listar funcionários | `search`, `page`, `pageSize`, `role`, `status` | - | `{ data: User[], pagination: {...} }` |
| `POST` | `/api/employees` | Criar funcionário | - | `CreateUserDTO` | `{ data: User }` |
| `GET` | `/api/employees/[id]` | Buscar por ID | - | - | `{ data: User }` |
| `PUT` | `/api/employees/[id]` | Atualizar funcionário | - | `UpdateUserDTO` | `{ data: User }` |
| `DELETE` | `/api/employees/[id]` | Desativar funcionário | - | - | `{ success: true }` |

#### **5. ESTOQUE** (`/api/stock`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/stock/movements` | Listar movimentações | `page`, `pageSize`, `type`, `productId`, `startDate`, `endDate` | - | `{ data: Movement[], pagination: {...} }` |
| `POST` | `/api/stock/entry` | Entrada de estoque | - | `StockEntryDTO` | `{ data: Movement }` |
| `POST` | `/api/stock/exit` | Saída de estoque | - | `StockExitDTO` | `{ data: Movement }` |
| `POST` | `/api/stock/adjust` | Ajuste manual | - | `StockAdjustDTO` | `{ data: Movement }` |
| `GET` | `/api/stock/products` | Estoque por produto | `page`, `pageSize`, `lowStock` | - | `{ data: ProductStock[], pagination: {...} }` |
| `GET` | `/api/stock/reservations` | Reservas ativas | `page`, `pageSize`, `status` | - | `{ data: Reservation[], pagination: {...} }` |

#### **6. CAIXA** (`/api/cash`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/cash/shifts` | Listar turnos | `page`, `pageSize`, `status`, `branchId`, `startDate`, `endDate` | - | `{ data: CashShift[], pagination: {...} }` |
| `POST` | `/api/cash/open` | Abrir caixa | - | `OpenCashShiftDTO` | `{ data: CashShift }` |
| `POST` | `/api/cash/close` | Fechar caixa | - | `CloseCashShiftDTO` | `{ data: CashShift }` |
| `POST` | `/api/cash/withdrawal` | Sangria | - | `CashMovementDTO` | `{ data: CashMovement }` |
| `POST` | `/api/cash/supply` | Reforço | - | `CashMovementDTO` | `{ data: CashMovement }` |
| `GET` | `/api/cash/current` | Caixa atual aberto | `branchId` | - | `{ data: CashShift \| null }` |
| `GET` | `/api/cash/shifts/[id]` | Detalhes do turno | - | - | `{ data: CashShift + movements }` |

#### **7. VENDAS** (`/api/sales`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/sales` | Listar vendas | `page`, `pageSize`, `status`, `customerId`, `sellerId`, `startDate`, `endDate` | - | `{ data: Sale[], pagination: {...} }` |
| `POST` | `/api/sales` | Criar venda (PDV) | - | `CreateSaleDTO` | `{ data: Sale }` |
| `GET` | `/api/sales/[id]` | Detalhes da venda | - | - | `{ data: Sale + items + payments }` |
| `PUT` | `/api/sales/[id]/cancel` | Cancelar venda | - | `{ reason: string }` | `{ data: Sale }` |
| `PUT` | `/api/sales/[id]/refund` | Estornar venda | - | `RefundDTO` | `{ data: Sale }` |
| `GET` | `/api/sales/export` | Exportar CSV | Mesmos da lista | - | CSV File |

#### **8. PDV** (`/api/pdv`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `POST` | `/api/pdv/cart` | Criar carrinho | - | `CreateCartDTO` | `{ data: Cart }` |
| `PUT` | `/api/pdv/cart/items` | Adicionar item | - | `AddItemDTO` | `{ data: Cart }` |
| `DELETE` | `/api/pdv/cart/items/[id]` | Remover item | - | - | `{ data: Cart }` |
| `POST` | `/api/pdv/checkout` | Finalizar venda | - | `CheckoutDTO` | `{ data: Sale }` |
| `POST` | `/api/pdv/calculate-discount` | Calcular desconto | - | `DiscountDTO` | `{ data: { total, discount } }` |

#### **9. ORDENS DE SERVIÇO** (`/api/service-orders`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/service-orders` | Listar OS | `page`, `pageSize`, `status`, `customerId`, `priority`, `startDate`, `endDate` | - | `{ data: ServiceOrder[], pagination: {...} }` |
| `POST` | `/api/service-orders` | Criar OS | - | `CreateServiceOrderDTO` | `{ data: ServiceOrder }` |
| `GET` | `/api/service-orders/[id]` | Detalhes da OS | - | - | `{ data: ServiceOrder + items + history }` |
| `PUT` | `/api/service-orders/[id]` | Atualizar OS | - | `UpdateServiceOrderDTO` | `{ data: ServiceOrder }` |
| `PUT` | `/api/service-orders/[id]/status` | Mudar status | - | `{ status, note }` | `{ data: ServiceOrder }` |
| `POST` | `/api/service-orders/[id]/quality` | Checklist qualidade | - | `QualityChecklistDTO` | `{ data: QualityChecklist }` |
| `DELETE` | `/api/service-orders/[id]` | Cancelar OS | - | - | `{ success: true }` |

#### **10. FINANCEIRO** (`/api/financial`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/financial/receivables` | Contas a receber | `page`, `pageSize`, `status`, `startDate`, `endDate` | - | `{ data: Payment[], pagination: {...} }` |
| `GET` | `/api/financial/payables` | Contas a pagar | `page`, `pageSize`, `status`, `startDate`, `endDate` | - | `{ data: Payment[], pagination: {...} }` |
| `GET` | `/api/financial/dre` | DRE do período | `month`, `year`, `branchId` | - | `{ data: DREReport }` |
| `POST` | `/api/financial/dre/generate` | Gerar DRE | - | `{ month, year, branchId }` | `{ data: DREReport }` |

#### **11. RELATÓRIOS** (`/api/reports`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/reports/sales` | Relatório de vendas | `startDate`, `endDate`, `branchId`, `sellerId` | - | `{ data: Report }` |
| `GET` | `/api/reports/stock` | Relatório de estoque | `type`, `lowStock` | - | `{ data: Report }` |
| `GET` | `/api/reports/commissions` | Relatório comissões | `month`, `year`, `userId` | - | `{ data: Report }` |
| `GET` | `/api/reports/customers` | Relatório clientes | `segment`, `startDate`, `endDate` | - | `{ data: Report }` |

#### **12. CONFIGURAÇÕES** (múltiplos endpoints)

| Módulo | Endpoint Base | Operações |
|--------|--------------|-----------|
| **Empresa** | `/api/settings/company` | GET, PUT |
| **Filiais** | `/api/settings/branches` | GET, POST, PUT, DELETE |
| **Usuários** | `/api/settings/users` | GET, POST, PUT, DELETE |
| **Comissões** | `/api/settings/commissions` | GET, POST, PUT, DELETE |
| **Fiscal** | `/api/settings/fiscal` | GET, PUT |

#### **13. METAS** (`/api/goals`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/goals` | Listar metas | `page`, `pageSize`, `period`, `userId` | - | `{ data: Goal[], pagination: {...} }` |
| `POST` | `/api/goals` | Criar meta | - | `CreateGoalDTO` | `{ data: Goal }` |
| `GET` | `/api/goals/[id]` | Detalhes da meta | - | - | `{ data: Goal + progress }` |
| `PUT` | `/api/goals/[id]` | Atualizar meta | - | `UpdateGoalDTO` | `{ data: Goal }` |
| `DELETE` | `/api/goals/[id]` | Deletar meta | - | - | `{ success: true }` |

#### **14. DASHBOARD** (`/api/dashboard`)

| Método | Endpoint | Descrição | Query Params | Body | Response |
|--------|----------|-----------|--------------|------|----------|
| `GET` | `/api/dashboard/metrics` | Métricas gerais | `period`, `branchId` | - | `{ data: Metrics }` |
| `GET` | `/api/dashboard/charts/sales` | Gráfico vendas | `period`, `branchId` | - | `{ data: ChartData }` |
| `GET` | `/api/dashboard/charts/revenue` | Gráfico receita | `period`, `branchId` | - | `{ data: ChartData }` |

---

## 4. ESTRUTURA DE PASTAS

### 🗂️ ARQUITETURA EM CAMADAS

Implementaremos uma arquitetura limpa com separação de responsabilidades:

```
src/
├── app/                                        # Next.js App Router
│   ├── (auth)/                                 # Rotas de autenticação
│   │   └── login/
│   ├── (dashboard)/                            # Rotas do dashboard
│   │   └── dashboard/
│   │       ├── <entidade>/                     # Páginas por módulo
│   └── api/                                    # API Routes
│       └── <entidade>/                         # Endpoints REST
│
├── components/                                 # Componentes React
│   ├── ui/                                     # Componentes Radix/shadcn
│   ├── layout/                                 # Layout components
│   ├── <entidade>/                             # Componentes específicos por módulo
│   │   ├── <entidade>-list.tsx
│   │   ├── <entidade>-form.tsx
│   │   └── <entidade>-details-modal.tsx
│   └── shared/                                 # Componentes compartilhados
│       ├── data-table.tsx
│       ├── search-bar.tsx
│       ├── pagination.tsx
│       └── empty-state.tsx
│
├── lib/                                        # Bibliotecas e utilitários
│   ├── prisma.ts                               # Prisma client singleton
│   ├── utils.ts                                # Funções utilitárias
│   ├── api-client.ts                           # Cliente HTTP padronizado
│   ├── error-handler.ts                        # Tratamento de erros global
│   ├── constants.ts                            # Constantes da aplicação
│   └── validations/                            # Schemas Zod
│       ├── customer.schema.ts
│       ├── product.schema.ts
│       ├── sale.schema.ts
│       └── ...
│
├── services/                                   # Camada de Negócio (Server-side)
│   ├── customer.service.ts
│   ├── product.service.ts
│   ├── sale.service.ts
│   ├── stock.service.ts
│   ├── cash.service.ts
│   ├── service-order.service.ts
│   └── ...
│
├── repositories/                               # Camada de Dados (opcional)
│   ├── customer.repository.ts                  # Abstração do Prisma
│   ├── product.repository.ts
│   └── ...
│
├── types/                                      # TypeScript types
│   ├── entities.ts                             # Tipos de entidades
│   ├── dtos.ts                                 # Data Transfer Objects
│   ├── api-responses.ts                        # Tipos de resposta da API
│   └── ...
│
├── hooks/                                      # React Hooks customizados
│   ├── use-toast.ts
│   ├── use-customers.ts                        # Hook para fetch de clientes
│   ├── use-products.ts
│   └── ...
│
├── middleware.ts                               # Middleware NextAuth + RBAC
└── auth.ts                                     # Configuração NextAuth
```

### 📄 ARQUIVOS INICIAIS A SEREM CRIADOS

#### **Validations (src/lib/validations/)**

1. `customer.schema.ts` - Schemas Zod para Customer (create, update)
2. `product.schema.ts` - Schemas Zod para Product (create, update)
3. `supplier.schema.ts` - Schemas Zod para Supplier
4. `employee.schema.ts` - Schemas Zod para User/Employee
5. `sale.schema.ts` - Schemas Zod para Sale
6. `service-order.schema.ts` - Schemas Zod para ServiceOrder
7. `stock.schema.ts` - Schemas Zod para Stock movements
8. `cash.schema.ts` - Schemas Zod para Cash operations
9. `goal.schema.ts` - Schemas Zod para Goal

#### **Services (src/services/)**

1. `customer.service.ts` - Lógica de negócio para Customers
2. `product.service.ts` - Lógica de negócio para Products
3. `supplier.service.ts` - Lógica de negócio para Suppliers
4. `employee.service.ts` - Lógica de negócio para Employees
5. `sale.service.ts` - Lógica de negócio para Sales
6. `service-order.service.ts` - Lógica de negócio para ServiceOrders
7. `stock.service.ts` - Lógica de negócio para Stock
8. `cash.service.ts` - Lógica de negócio para Cash
9. `goal.service.ts` - Lógica de negócio para Goals
10. `dashboard.service.ts` - Agregação de métricas

#### **Lib (src/lib/)**

1. `api-client.ts` - Cliente fetch padronizado com interceptors
2. `error-handler.ts` - Tratamento global de erros
3. `constants.ts` - Constantes (roles, status, payment methods, etc.)
4. `formatters.ts` - Formatação de CPF, CNPJ, telefone, moeda, etc.

#### **Types (src/types/)**

1. `entities.ts` - Tipos baseados nos models Prisma
2. `dtos.ts` - DTOs para create/update
3. `api-responses.ts` - Tipos de resposta padronizada

---

## 5. AUTENTICAÇÃO E PERMISSÕES

### 🔐 SITUAÇÃO ATUAL

**Confirmado no diagnóstico:**
- ✅ NextAuth está configurado (`src/auth.ts`, `/api/auth/[...nextauth]/route.ts`)
- ✅ Middleware básico existe (`src/middleware.ts`) e redireciona para `/login` se não autenticado
- ❌ **NÃO há checagem de role em UI**
- ❌ **NÃO há checagem de role em API**
- ❌ **NÃO há proteção de rotas sensíveis** (delete, edit de configurações, etc.)

### 🎯 IMPLEMENTAÇÃO (MVP - Fase 1)

#### **A. Middleware de Autenticação**

**Arquivo:** `src/middleware.ts`

**Responsabilidades:**
1. ✅ **Já implementado:** Redirecionar para `/login` se não autenticado
2. 🆕 **Adicionar:** Verificar role do usuário para rotas administrativas
3. 🆕 **Adicionar:** Bloquear acesso a `/dashboard/configuracoes/**` se não for ADMIN ou GERENTE
4. 🆕 **Adicionar:** Bloquear acesso a `/dashboard/financeiro/**` se não for ADMIN, GERENTE ou específico

**Exemplo de lógica:**
```typescript
// Rotas que requerem ADMIN ou GERENTE
const adminRoutes = ['/dashboard/configuracoes', '/dashboard/funcionarios']
const financeRoutes = ['/dashboard/financeiro']

if (adminRoutes.some(route => pathname.startsWith(route))) {
  if (!['ADMIN', 'GERENTE'].includes(user.role)) {
    return Response.redirect('/dashboard?error=unauthorized')
  }
}
```

#### **B. Proteção de APIs**

**Arquivo:** `src/lib/auth-helpers.ts`

**Funções utilitárias:**
1. `requireAuth()` - Retorna user ou lança erro 401
2. `requireRole(roles: UserRole[])` - Valida role ou lança erro 403
3. `getCompanyIdFromSession()` - Retorna companyId do usuário logado

**Exemplo:**
```typescript
// Em cada API route
import { requireAuth, requireRole } from '@/lib/auth-helpers'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  await requireRole(['ADMIN', 'GERENTE']) // 403 se não for ADMIN ou GERENTE

  // Lógica de delete
}
```

#### **C. Controle de UI baseado em Role**

**Componente:** `src/components/shared/can.tsx`

```typescript
// Uso:
<Can roles={['ADMIN', 'GERENTE']}>
  <Button onClick={deleteCustomer}>Deletar</Button>
</Can>
```

**Hooks:** `src/hooks/use-permissions.ts`

```typescript
const { can } = usePermissions()

if (can(['ADMIN', 'GERENTE'])) {
  // Mostrar botão
}
```

#### **D. Matriz de Permissões (MVP)**

| Ação | ADMIN | GERENTE | VENDEDOR | CAIXA | ATENDENTE |
|------|-------|---------|----------|-------|-----------|
| **Clientes** |  |  |  |  |  |
| Visualizar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar | ✅ | ✅ | ✅ | ⚠️ Próprios | ⚠️ Próprios |
| Deletar | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Produtos** |  |  |  |  |  |
| Visualizar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Deletar | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Vendas** |  |  |  |  |  |
| Criar (PDV) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Visualizar | ✅ | ✅ | ⚠️ Próprias | ⚠️ Próprias | ⚠️ Próprias |
| Cancelar | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Caixa** |  |  |  |  |  |
| Abrir | ✅ | ✅ | ⚠️ Com aprovação | ✅ | ⚠️ Com aprovação |
| Fechar | ✅ | ✅ | ❌ | ✅ | ❌ |
| Sangria | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Configurações** |  |  |  |  |  |
| Tudo | ✅ | ⚠️ Limitado | ❌ | ❌ | ❌ |
| **Financeiro** |  |  |  |  |  |
| Visualizar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar | ✅ | ⚠️ Limitado | ❌ | ❌ | ❌ |

**Legenda:**
- ✅ = Permitido total
- ❌ = Bloqueado
- ⚠️ = Permitido com restrições

### 🚀 ROADMAP DE IMPLEMENTAÇÃO

**Fase 1 (MVP):**
- ✅ Middleware bloqueia rotas administrativas
- ✅ APIs de DELETE e UPDATE requerem roles específicos
- ✅ Componente `<Can>` para esconder/mostrar botões
- ✅ Validação de `companyId` em todas as queries (multi-tenancy)

**Fase 2 (Futuro):**
- ⏳ Permissões granulares por recurso (ex: "pode deletar produto se estoque = 0")
- ⏳ Audit log de todas as ações sensíveis
- ⏳ 2FA para ADMIN
- ⏳ IP allowlist para operações financeiras

---

## 6. PAGINAÇÃO, BUSCA E ERROS

### 📄 PAGINAÇÃO PADRÃO

#### **Query Params (GET /api/<entidade>)**

| Param | Tipo | Padrão | Descrição | Exemplo |
|-------|------|--------|-----------|---------|
| `page` | number | 1 | Página atual | `?page=2` |
| `pageSize` | number | 20 | Itens por página (max: 100) | `?pageSize=50` |
| `search` | string | "" | Busca full-text | `?search=maria` |
| `sortBy` | string | "createdAt" | Campo para ordenar | `?sortBy=name` |
| `sortOrder` | "asc" \| "desc" | "desc" | Ordem | `?sortOrder=asc` |

**Filtros específicos por entidade:**
- **Customers:** `status`, `city`, `referralSource`
- **Products:** `type`, `brandId`, `categoryId`, `inStock`
- **Sales:** `status`, `customerId`, `sellerId`, `startDate`, `endDate`
- **ServiceOrders:** `status`, `priority`, `customerId`, `startDate`, `endDate`

#### **Response Padrão**

```typescript
{
  "data": [...],                    // Array de resultados
  "pagination": {
    "page": 1,                      // Página atual
    "pageSize": 20,                 // Itens por página
    "total": 150,                   // Total de registros
    "totalPages": 8,                // Total de páginas
    "hasNext": true,                // Tem próxima página?
    "hasPrevious": false            // Tem página anterior?
  }
}
```

#### **Implementação (Service Layer)**

```typescript
// src/services/base.service.ts
export async function paginatedQuery<T>(
  model: any,
  where: any,
  page: number,
  pageSize: number,
  orderBy: any
) {
  const skip = (page - 1) * pageSize
  const take = Math.min(pageSize, 100) // Max 100 itens

  const [data, total] = await Promise.all([
    model.findMany({ where, skip, take, orderBy }),
    model.count({ where })
  ])

  return {
    data,
    pagination: {
      page,
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take),
      hasNext: skip + take < total,
      hasPrevious: page > 1
    }
  }
}
```

### 🔍 BUSCA PADRÃO

#### **Estratégia de Busca por Entidade**

**Clientes:**
```typescript
where: {
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { cpf: { contains: search } },
    { phone: { contains: search } }
  ]
}
```

**Produtos:**
```typescript
where: {
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { sku: { contains: search, mode: 'insensitive' } },
    { barcode: { equals: search } },
    { brand: { name: { contains: search, mode: 'insensitive' } } }
  ]
}
```

### ⚠️ TRATAMENTO DE ERROS PADRÃO

#### **Status Codes Padronizados**

| Status | Uso | Exemplo |
|--------|-----|---------|
| `200` | Sucesso (GET, PUT) | Retornou dados |
| `201` | Criado (POST) | Registro criado |
| `204` | Sem conteúdo (DELETE) | Deletado com sucesso |
| `400` | Bad Request | Validação falhou |
| `401` | Unauthorized | Não autenticado |
| `403` | Forbidden | Sem permissão |
| `404` | Not Found | Recurso não existe |
| `409` | Conflict | CPF/email duplicado |
| `500` | Internal Server Error | Erro inesperado |

#### **Response de Erro Padrão**

```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",              // Código do erro
    "message": "Dados inválidos",            // Mensagem amigável
    "details": [                             // Detalhes (opcional)
      {
        "field": "email",
        "message": "Email já cadastrado"
      }
    ]
  }
}
```

#### **Error Codes Padronizados**

| Code | Status | Descrição |
|------|--------|-----------|
| `VALIDATION_ERROR` | 400 | Validação Zod falhou |
| `UNAUTHORIZED` | 401 | Usuário não autenticado |
| `FORBIDDEN` | 403 | Sem permissão |
| `NOT_FOUND` | 404 | Recurso não encontrado |
| `DUPLICATE` | 409 | Registro duplicado |
| `BUSINESS_RULE_VIOLATION` | 400 | Regra de negócio violada (ex: estoque insuficiente) |
| `INTERNAL_ERROR` | 500 | Erro inesperado |

#### **Implementação (Error Handler)**

**Arquivo:** `src/lib/error-handler.ts`

```typescript
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number,
    public details?: any[]
  ) {
    super(message)
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode }
    )
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        }
      },
      { status: 400 }
    )
  }

  // Erro inesperado
  console.error('Unexpected error:', error)
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } },
    { status: 500 }
  )
}
```

### 🎨 FEEDBACK NO FRONTEND

#### **Toast Padrão**

Usar `react-hot-toast` (já instalado) para feedback:

```typescript
import toast from 'react-hot-toast'

// Sucesso
toast.success('Cliente cadastrado com sucesso!')

// Erro
toast.error('Erro ao cadastrar cliente')

// Carregando
const loadingToast = toast.loading('Salvando...')
// Depois:
toast.dismiss(loadingToast)
toast.success('Salvo!')
```

#### **Estados de UI**

Cada listagem deve ter:
1. **Loading state** - Skeleton ou spinner
2. **Empty state** - Ilustração + CTA quando não há dados
3. **Error state** - Mensagem de erro + botão "Tentar novamente"
4. **Success state** - Dados carregados normalmente

---

## 7. MATRIZ PRISMA

### ✅ ENTIDADES QUE JÁ EXISTEM NO SCHEMA

| Entidade | Model Prisma | Status | Usado em |
|----------|--------------|--------|----------|
| **Clientes** | `Customer` | ✅ Completo | Vendas, PDV, OS |
| **Produtos** | `Product` | ✅ Completo | Vendas, PDV, Estoque |
| **Funcionários** | `User` | ✅ Completo | Autenticação, Vendas, Caixa |
| **Categorias** | `Category` | ✅ Completo | Produtos |
| **Marcas** | `Brand` | ✅ Completo | Produtos |
| **Cores** | `Color` | ✅ Completo | Produtos |
| **Formas** | `Shape` | ✅ Completo | Produtos (armações) |
| **Vendas** | `Sale` | ✅ Completo | PDV, Financeiro |
| **Itens de Venda** | `SaleItem` | ✅ Completo | Vendas |
| **Pagamentos** | `SalePayment` | ✅ Completo | Vendas, Caixa |
| **Caixa (Turno)** | `CashShift` | ✅ Completo | Caixa |
| **Movimentação Caixa** | `CashMovement` | ✅ Completo | Caixa |
| **Ordens de Serviço** | `ServiceOrder` | ✅ Completo | OS |
| **Itens de OS** | `ServiceOrderItem` | ✅ Completo | OS |
| **Histórico OS** | `ServiceOrderHistory` | ✅ Completo | OS |
| **Checklist Qualidade** | `QualityChecklist` | ✅ Completo | OS |
| **Reserva Estoque** | `StockReservation` | ✅ Completo | Estoque, OS, Vendas |
| **Receitas** | `Prescription` | ✅ Completo | OS, Clientes |
| **Médicos** | `Doctor` | ✅ Completo | Receitas |
| **Laboratórios** | `Lab` | ✅ Completo | OS, Produtos (lentes) |
| **Garantias** | `Warranty` | ✅ Completo | Vendas, OS |
| **Orçamentos** | `Quote` | ✅ Completo | Vendas |
| **Comissões** | `Commission` | ✅ Completo | Financeiro, Vendas |
| **Regras Comissão** | `CommissionRule` | ✅ Completo | Configurações |
| **Convênios** | `Agreement` | ✅ Completo | Vendas, Clientes |
| **Fidelidade** | `LoyaltyProgram` | ✅ Completo | Clientes |
| **Pontos Fidelidade** | `LoyaltyPoints` | ✅ Completo | Clientes |
| **Agendamentos** | `Appointment` | ✅ Completo | Clientes, OS |
| **DRE** | `DREReport` | ✅ Completo | Financeiro |
| **Empresa** | `Company` | ✅ Completo | Multi-tenancy |
| **Filial** | `Branch` | ✅ Completo | Multi-filial |
| **Auditoria** | `AuditLog` | ✅ Completo | Configurações |

### ❌ ENTIDADES QUE FALTAM

| Entidade | Necessário para | Prioridade | Solução |
|----------|-----------------|------------|---------|
| **Fornecedores (Supplier)** | Módulo Fornecedores, Entrada Estoque | 🔴 Alta | Criar model novo |
| **Metas (Goal)** | Módulo Metas | 🟡 Média | Criar model novo |
| **Movimentação Estoque** | Módulo Estoque (entrada/saída/ajuste) | 🔴 Alta | Usar `StockReservation` + criar novo model |

### 🆕 MODELS A CRIAR

#### **1. Supplier (Fornecedores)**

```prisma
model Supplier {
  id           String   @id @default(cuid())
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id])

  code         String?
  name         String
  tradeName    String?
  cnpj         String?  @unique

  contactPerson String?
  phone        String?
  email        String?
  website      String?

  address      String?
  city         String?
  state        String?
  zipCode      String?

  paymentTermDays Int @default(30)
  notes        String?

  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relações
  stockEntries StockMovement[]

  @@unique([companyId, code])
  @@index([companyId, name])
}
```

#### **2. Goal (Metas)**

```prisma
enum GoalType {
  SALES_REVENUE      // Meta de faturamento
  SALES_QUANTITY     // Meta de quantidade de vendas
  NEW_CUSTOMERS      // Meta de novos clientes
  SERVICE_ORDERS     // Meta de ordens de serviço
  CUSTOM             // Meta customizada
}

enum GoalPeriod {
  DAILY
  WEEKLY
  MONTHLY
  QUARTERLY
  YEARLY
}

model Goal {
  id           String     @id @default(cuid())
  companyId    String
  company      Company    @relation(fields: [companyId], references: [id])

  branchId     String?
  branch       Branch?    @relation(fields: [branchId], references: [id])

  userId       String?                        // Se for meta individual
  user         User?      @relation(fields: [userId], references: [id])

  type         GoalType
  period       GoalPeriod

  targetValue  Decimal    @db.Decimal(14,2)  // Valor da meta
  currentValue Decimal    @db.Decimal(14,2) @default(0)

  startDate    DateTime
  endDate      DateTime

  name         String
  description  String?

  active       Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([companyId, branchId, period])
  @@index([userId, active])
}
```

#### **3. StockMovement (Movimentações de Estoque)**

```prisma
enum StockMovementType {
  ENTRY          // Entrada (compra)
  EXIT           // Saída manual
  SALE           // Saída por venda
  ADJUSTMENT     // Ajuste (inventário)
  RETURN         // Devolução
  TRANSFER       // Transferência entre filiais
}

model StockMovement {
  id           String              @id @default(cuid())
  companyId    String
  branchId     String
  productId    String

  type         StockMovementType
  quantity     Int                           // Positivo ou negativo

  costPrice    Decimal?           @db.Decimal(12,2)
  totalCost    Decimal?           @db.Decimal(12,2)

  supplierId   String?
  supplier     Supplier?          @relation(fields: [supplierId], references: [id])

  saleId       String?
  sale         Sale?              @relation(fields: [saleId], references: [id])

  userId       String                        // Quem registrou
  user         User               @relation(fields: [userId], references: [id])

  reason       String?                       // Motivo (ajuste, devolução, etc.)
  notes        String?
  invoiceNumber String?

  createdAt    DateTime           @default(now())

  @@index([companyId, branchId, productId])
  @@index([type, createdAt])
}
```

### 🔄 RELACIONAMENTOS A ADICIONAR

Nos models existentes, adicionar:

```prisma
// Em Company
model Company {
  // ... campos existentes
  suppliers    Supplier[]
  goals        Goal[]
}

// Em Branch
model Branch {
  // ... campos existentes
  goals        Goal[]
}

// Em User
model User {
  // ... campos existentes
  goals              Goal[]
  stockMovements     StockMovement[]
}

// Em Sale
model Sale {
  // ... campos existentes
  stockMovements StockMovement[]
}
```

### 📝 MIGRATION PLAN

1. **Criar arquivo de migration:** `prisma/migrations/xxx_add_supplier_goal_stock_movement.sql`
2. **Rodar:** `npx prisma migrate dev --name add_supplier_goal_stock_movement`
3. **Gerar client:** `npx prisma generate`

---

## 8. PLANO DE EXECUÇÃO POR LOTES

### 🎯 ESTRATÉGIA

Dividir implementação em **4 lotes incrementais**, priorizando:
1. **CRUD base** (clientes + produtos) - fundação
2. **Operação** (estoque + caixa) - operação diária
3. **Core do negócio** (PDV + vendas) - geração de receita
4. **Gestão** (demais módulos) - gestão completa

Cada lote é **entregável, testável e implantável**.

---

### 📦 LOTE 1: CRUD BASE (Fundação)

**Objetivo:** Estabelecer padrão completo de CRUD que será replicado nos demais módulos.

#### ✅ Entidades

1. **Clientes** (Customer)
2. **Produtos** (Product)

#### 🔧 O que será implementado

**Infraestrutura:**
- ✅ Estrutura de pastas completa (services, validations, lib)
- ✅ `api-client.ts` - Cliente HTTP padronizado
- ✅ `error-handler.ts` - Tratamento global de erros
- ✅ `auth-helpers.ts` - Funções de autenticação/autorização
- ✅ Componente `<Can>` para RBAC na UI
- ✅ Hooks `use-permissions.ts`
- ✅ Componentes compartilhados: `<DataTable>`, `<Pagination>`, `<SearchBar>`, `<EmptyState>`

**Clientes:**
- ✅ Schema Zod (`customer.schema.ts`)
- ✅ Service (`customer.service.ts`)
- ✅ API completa:
  - `GET /api/customers` (list com paginação, busca, filtros)
  - `POST /api/customers` (create com validação)
  - `GET /api/customers/[id]` (getById)
  - `PUT /api/customers/[id]` (update com validação)
  - `DELETE /api/customers/[id]` (soft delete)
  - `GET /api/customers/export` (CSV)
- ✅ Páginas:
  - `/dashboard/clientes` - Listagem com filtros
  - `/dashboard/clientes/novo` - Formulário de criação
  - `/dashboard/clientes/[id]/editar` - Formulário de edição
- ✅ Componentes:
  - `<CustomerList>` - Tabela/cards
  - `<CustomerForm>` - Formulário (usado em novo + editar)
  - `<CustomerDetailsModal>` - Modal de detalhes
- ✅ Hook `use-customers.ts` para fetch/mutations

**Produtos:**
- ✅ Schema Zod (`product.schema.ts`)
- ✅ Service (`product.service.ts`)
- ✅ API completa (mesma estrutura de customers)
- ✅ Páginas completas
- ✅ Componentes completos
- ✅ Hook `use-products.ts`

#### 📋 Checklist "Pronto"

- [ ] Infraestrutura base criada e documentada
- [ ] Clientes: CRUD completo funcionando
  - [ ] Listagem com paginação (20 itens/página)
  - [ ] Busca funcional (nome, email, CPF, telefone)
  - [ ] Filtros aplicados (status, cidade)
  - [ ] Criar novo cliente (validação Zod + toast)
  - [ ] Editar cliente existente
  - [ ] Deletar cliente (soft delete, apenas ADMIN/GERENTE)
  - [ ] Exportar CSV
  - [ ] Botões de ação respeitam role do usuário
  - [ ] Network mostra requests reais (não mock)
- [ ] Produtos: CRUD completo funcionando
  - [ ] Mesmos critérios de clientes
  - [ ] Filtros específicos (tipo, marca, categoria, estoque baixo)
  - [ ] Controle de estoque ao criar/editar
- [ ] Sem erros no console
- [ ] Feedback visual para todas as ações (loading, success, error)
- [ ] Mobile responsivo
- [ ] Documentação de uso atualizada

#### ⏱️ Estimativa

- **Infraestrutura:** 4-6h
- **Clientes:** 6-8h
- **Produtos:** 6-8h
- **Testes + ajustes:** 4-6h
- **TOTAL:** ~20-28h

---

### 📦 LOTE 2: OPERAÇÃO (Dia a Dia)

**Objetivo:** Permitir operação diária da loja (controle de estoque e caixa).

#### ✅ Entidades

1. **Estoque** (StockMovement - **criar model**)
2. **Caixa** (CashShift + CashMovement)
3. **Fornecedores** (Supplier - **criar model**)

#### 🔧 O que será implementado

**Prisma:**
- ✅ Criar model `Supplier`
- ✅ Criar model `StockMovement`
- ✅ Rodar migrations

**Fornecedores:**
- ✅ CRUD completo (padrão Lote 1)
- ✅ Sem importação (fase 2)

**Estoque:**
- ✅ Schema Zod (`stock.schema.ts`)
- ✅ Service (`stock.service.ts`)
- ✅ API:
  - `GET /api/stock/movements` (listar movimentações)
  - `POST /api/stock/entry` (entrada - compra)
  - `POST /api/stock/exit` (saída manual)
  - `POST /api/stock/adjust` (ajuste de inventário)
  - `GET /api/stock/products` (estoque atual por produto)
  - `GET /api/stock/reservations` (reservas ativas)
- ✅ Páginas:
  - `/dashboard/estoque` - Listagem de movimentações + estoque atual
  - `/dashboard/estoque/entrada` - Registrar entrada
  - `/dashboard/estoque/saida` - Registrar saída
  - `/dashboard/estoque/ajuste` - Ajuste de inventário
- ✅ Componentes:
  - `<StockMovementList>` - Histórico
  - `<StockEntryForm>` - Formulário de entrada
  - `<StockExitForm>` - Formulário de saída
  - `<StockAdjustForm>` - Formulário de ajuste
  - `<ProductStockList>` - Estoque por produto (com alerta de estoque baixo)

**Caixa:**
- ✅ Schema Zod (`cash.schema.ts`)
- ✅ Service (`cash.service.ts`)
- ✅ API:
  - `GET /api/cash/shifts` (listar turnos)
  - `POST /api/cash/open` (abrir caixa)
  - `POST /api/cash/close` (fechar caixa)
  - `POST /api/cash/withdrawal` (sangria)
  - `POST /api/cash/supply` (reforço)
  - `GET /api/cash/current` (caixa atual aberto)
  - `GET /api/cash/shifts/[id]` (detalhes do turno)
- ✅ Páginas:
  - `/dashboard/caixa` - Listagem de turnos + status atual
  - `/dashboard/caixa/abrir` - Abrir novo turno
  - `/dashboard/caixa/[id]` - Detalhes do turno (movimentações)
- ✅ Componentes:
  - `<CashShiftList>` - Listagem de turnos
  - `<OpenCashShiftForm>` - Abrir caixa
  - `<CloseCashShiftForm>` - Fechar caixa (com conferência)
  - `<CashMovementForm>` - Sangria/Reforço (modal)
  - `<CashShiftDetails>` - Detalhes + movimentações

#### 📋 Checklist "Pronto"

- [ ] Models `Supplier` e `StockMovement` criados e migrados
- [ ] Fornecedores: CRUD completo
- [ ] Estoque:
  - [ ] Entrada de estoque atualiza `Product.stockQty`
  - [ ] Saída de estoque diminui `Product.stockQty`
  - [ ] Ajuste corrige discrepâncias
  - [ ] Listagem mostra histórico completo
  - [ ] Alerta visual para produtos com estoque baixo
  - [ ] Filtros por tipo, produto, período
- [ ] Caixa:
  - [ ] Abrir caixa registra valor inicial
  - [ ] Sangria/Reforço registram movimentações
  - [ ] Fechar caixa calcula diferença (esperado vs declarado)
  - [ ] Não é possível abrir 2 caixas ao mesmo tempo na mesma filial
  - [ ] Listagem mostra turnos com totais
  - [ ] Detalhes mostram todas as movimentações do turno
- [ ] Integração: Entrada de estoque pode ser vinculada a fornecedor
- [ ] Sem erros, feedback visual ok, mobile responsivo

#### ⏱️ Estimativa

- **Models + Migrations:** 2-3h
- **Fornecedores:** 6-8h
- **Estoque:** 8-10h
- **Caixa:** 8-10h
- **Testes + ajustes:** 4-6h
- **TOTAL:** ~28-37h

---

### 📦 LOTE 3: CORE DO NEGÓCIO (Geração de Receita)

**Objetivo:** Habilitar o core do negócio - vender.

#### ✅ Entidades

1. **PDV** (interface de vendas)
2. **Vendas** (Sale + SaleItem + SalePayment)

#### 🔧 O que será implementado

**PDV:**
- ✅ Schema Zod (`sale.schema.ts`)
- ✅ Service (`sale.service.ts`)
- ✅ API:
  - `POST /api/pdv/cart` (criar carrinho temporário)
  - `PUT /api/pdv/cart/items` (adicionar item)
  - `DELETE /api/pdv/cart/items/[id]` (remover item)
  - `POST /api/pdv/calculate-discount` (calcular desconto)
  - `POST /api/pdv/checkout` (finalizar venda)
- ✅ Página:
  - `/dashboard/pdv` - Interface completa de PDV
    - Busca de produtos (por nome, SKU, código de barras)
    - Carrinho com itens
    - Cálculo de subtotal, desconto, total
    - Seleção de cliente (ou venda sem cliente)
    - Seleção de vendedor
    - Aplicação de desconto (validar limite por role)
    - Seleção de formas de pagamento (split payment)
    - Finalizar venda (gera Sale + SaleItems + SalePayments)
- ✅ Componentes:
  - `<PDVCart>` - Carrinho
  - `<ProductSearch>` - Busca de produtos
  - `<CustomerSelector>` - Seletor de cliente
  - `<PaymentMethodSelector>` - Seletor de formas de pagamento (múltiplas)
  - `<CheckoutModal>` - Modal de finalização

**Vendas:**
- ✅ Service já existe (expandir)
- ✅ API:
  - `GET /api/sales` (listar vendas)
  - `GET /api/sales/[id]` (detalhes da venda)
  - `PUT /api/sales/[id]/cancel` (cancelar venda - ADMIN/GERENTE)
  - `PUT /api/sales/[id]/refund` (estornar venda - ADMIN/GERENTE)
  - `GET /api/sales/export` (CSV)
- ✅ Páginas:
  - `/dashboard/vendas` - Listagem de vendas
  - `/dashboard/vendas/[id]` - Detalhes da venda
- ✅ Componentes:
  - `<SaleList>` - Listagem
  - `<SaleDetails>` - Detalhes completos (items, payments, customer, status)
  - `<CancelSaleModal>` - Modal de cancelamento
  - `<RefundSaleModal>` - Modal de estorno

#### 📋 Checklist "Pronto"

- [ ] PDV:
  - [ ] Busca de produtos funcional (nome, SKU, barcode)
  - [ ] Adicionar/remover itens do carrinho
  - [ ] Quantidade e desconto por item
  - [ ] Desconto global
  - [ ] Validação de limite de desconto por role
  - [ ] Seleção de cliente (com busca rápida)
  - [ ] Split payment (múltiplas formas de pagamento)
  - [ ] Finalizar venda:
    - [ ] Cria `Sale` + `SaleItem[]` + `SalePayment[]`
    - [ ] Atualiza estoque (diminui `Product.stockQty`)
    - [ ] Registra movimentação de caixa (`CashMovement`)
    - [ ] Calcula comissão do vendedor (`Commission`)
  - [ ] Validação: não permite venda se estoque insuficiente
  - [ ] Validação: não permite venda se caixa não estiver aberto
  - [ ] Impressão de cupom (fase 2 - usar `window.print()` por ora)
- [ ] Vendas:
  - [ ] Listagem mostra todas as vendas
  - [ ] Filtros: status, cliente, vendedor, período
  - [ ] Detalhes mostram: items, pagamentos, cliente, comissão
  - [ ] Cancelar venda:
    - [ ] Atualiza status para `CANCELED`
    - [ ] Reverte estoque
    - [ ] Estorna movimentação de caixa (se ainda aberto)
    - [ ] Cancela comissão
  - [ ] Exportar CSV com filtros
- [ ] Sem erros, feedback visual ok, mobile responsivo

#### ⏱️ Estimativa

- **PDV:** 12-16h
- **Vendas:** 8-10h
- **Integração (estoque + caixa + comissão):** 6-8h
- **Testes + ajustes:** 6-8h
- **TOTAL:** ~32-42h

---

### 📦 LOTE 4: GESTÃO (Demais Módulos)

**Objetivo:** Completar o sistema com todos os módulos de gestão.

#### ✅ Entidades

1. **Funcionários** (User) - CRUD completo
2. **Ordens de Serviço** (ServiceOrder + ServiceOrderItem + ServiceOrderHistory + QualityChecklist)
3. **Financeiro** (DRE, contas a receber/pagar)
4. **Relatórios** (vendas, estoque, comissões, clientes)
5. **Configurações** (empresa, filiais, usuários, comissões, fiscal)
6. **Metas** (Goal - **criar model**)

#### 🔧 O que será implementado

**Prisma:**
- ✅ Criar model `Goal`
- ✅ Rodar migration

**Funcionários:**
- ✅ CRUD completo (padrão Lote 1)
- ✅ Gestão de senhas (hash bcrypt)
- ✅ Gestão de roles e permissões
- ✅ Vinculação a filiais (`UserBranch`)

**Ordens de Serviço:**
- ✅ Schema Zod (`service-order.schema.ts`)
- ✅ Service (`service-order.service.ts`)
- ✅ API completa (conforme matriz do item 3)
- ✅ Páginas:
  - `/dashboard/ordens-servico` - Listagem
  - `/dashboard/ordens-servico/novo` - Criar nova OS
  - `/dashboard/ordens-servico/[id]` - Visualizar OS
  - `/dashboard/ordens-servico/[id]/editar` - Editar OS
  - `/dashboard/ordens-servico/qualidade/[id]` - Checklist de qualidade
- ✅ Componentes:
  - `<ServiceOrderList>` - Listagem com filtros (status, prioridade, prazo)
  - `<ServiceOrderForm>` - Formulário de criação/edição
  - `<ServiceOrderDetails>` - Detalhes completos
  - `<ServiceOrderTimeline>` - Timeline de mudanças de status
  - `<QualityChecklistForm>` - Checklist de qualidade
- ✅ Funcionalidades:
  - Vincular receita (Prescription)
  - Adicionar itens (lentes, armação, serviços)
  - Selecionar laboratório
  - Calcular prazo de entrega
  - Mudança de status com histórico
  - Reserva de estoque automática
  - Conversão em venda ao entregar

**Financeiro:**
- ✅ Service (`financial.service.ts`)
- ✅ API (conforme matriz do item 3)
- ✅ Páginas:
  - `/dashboard/financeiro` - Dashboard financeiro
  - `/dashboard/financeiro/contas-receber` - Listagem
  - `/dashboard/financeiro/contas-pagar` - Listagem
  - `/dashboard/financeiro/dre` - DRE do período
- ✅ Componentes:
  - `<FinancialDashboard>` - Resumo (contas a receber, a pagar, fluxo)
  - `<ReceivablesList>` - Contas a receber
  - `<PayablesList>` - Contas a pagar
  - `<DREReport>` - Relatório DRE

**Relatórios:**
- ✅ Service (`reports.service.ts`)
- ✅ API (conforme matriz do item 3)
- ✅ Páginas:
  - `/dashboard/relatorios` - Hub de relatórios
  - `/dashboard/relatorios/vendas` - Relatório de vendas
  - `/dashboard/relatorios/estoque` - Relatório de estoque
  - `/dashboard/relatorios/comissoes` - Relatório de comissões
  - `/dashboard/relatorios/clientes` - Relatório de clientes
- ✅ Componentes:
  - `<ReportFilters>` - Filtros comuns (período, filial, etc.)
  - `<SalesReport>` - Gráficos + tabelas
  - `<StockReport>` - Relatório de movimentação/ABC
  - `<CommissionsReport>` - Relatório de comissões
  - `<CustomersReport>` - Segmentação de clientes

**Configurações:**
- ✅ APIs conforme matriz do item 3
- ✅ Páginas:
  - `/dashboard/configuracoes` - Hub de configurações
  - `/dashboard/configuracoes/empresa` - Dados da empresa
  - `/dashboard/configuracoes/filiais` - Gestão de filiais
  - `/dashboard/configuracoes/usuarios` - Gestão de usuários
  - `/dashboard/configuracoes/comissoes` - Regras de comissão
  - `/dashboard/configuracoes/fiscal` - Configurações fiscais (NF-e)
- ✅ Componentes específicos por submódulo

**Metas:**
- ✅ CRUD completo (padrão Lote 1)
- ✅ Dashboard de acompanhamento (barra de progresso)
- ✅ Cálculo automático de progresso (job diário ou trigger)

#### 📋 Checklist "Pronto"

- [ ] Model `Goal` criado e migrado
- [ ] Funcionários: CRUD completo com gestão de roles e filiais
- [ ] Ordens de Serviço:
  - [ ] CRUD completo
  - [ ] Mudança de status com histórico
  - [ ] Reserva de estoque automática
  - [ ] Checklist de qualidade
  - [ ] Conversão em venda ao entregar
- [ ] Financeiro:
  - [ ] Contas a receber listando `SalePayment` pendentes
  - [ ] Contas a pagar (implementação básica)
  - [ ] DRE gerado com dados reais
- [ ] Relatórios:
  - [ ] Relatório de vendas com gráficos
  - [ ] Relatório de estoque (curva ABC)
  - [ ] Relatório de comissões
  - [ ] Relatório de clientes (segmentação)
- [ ] Configurações:
  - [ ] Gestão de empresa/filiais
  - [ ] Gestão de usuários
  - [ ] Regras de comissão
  - [ ] Configurações fiscais (preparação para NF-e)
- [ ] Metas:
  - [ ] CRUD completo
  - [ ] Dashboard com progresso visual
  - [ ] Cálculo de progresso atualizado
- [ ] Sem erros, feedback visual ok, mobile responsivo

#### ⏱️ Estimativa

- **Model Goal + Migration:** 2h
- **Funcionários:** 6-8h
- **Ordens de Serviço:** 16-20h
- **Financeiro:** 10-12h
- **Relatórios:** 12-16h
- **Configurações:** 10-12h
- **Metas:** 6-8h
- **Testes + ajustes:** 8-10h
- **TOTAL:** ~70-88h

---

### 📊 RESUMO GERAL DO PLANO

| Lote | Módulos | Estimativa | Prioridade |
|------|---------|------------|------------|
| **Lote 1** | Clientes, Produtos | ~20-28h | 🔴 Crítico |
| **Lote 2** | Estoque, Caixa, Fornecedores | ~28-37h | 🔴 Crítico |
| **Lote 3** | PDV, Vendas | ~32-42h | 🔴 Crítico |
| **Lote 4** | Funcionários, OS, Financeiro, Relatórios, Configurações, Metas | ~70-88h | 🟡 Importante |
| **TOTAL** | - | **~150-195h** | - |

---

## 9. DEFINITION OF DONE

### ✅ CRITÉRIOS GLOBAIS

Um módulo/lote só é considerado **PRONTO** quando atende TODOS os critérios:

#### **1. Funcionalidade**

- [ ] **Botões têm handler real** - Toda ação dispara request HTTP visível no Network tab
- [ ] **CRUD completo funciona** - Create, Read, Update, Delete persistem no banco de dados
- [ ] **Validação ativa** - Formulários usam Zod e mostram erros de validação
- [ ] **Filtros e busca funcionam** - Aplicam-se corretamente e refletem na API
- [ ] **Paginação funciona** - Navega entre páginas, mostra total correto

#### **2. Qualidade**

- [ ] **Sem erros no console** - Nenhum erro JavaScript/TypeScript no console do browser
- [ ] **Sem warnings do Next.js** - Build e dev mode sem warnings
- [ ] **Sem dados mock** - Todos os dados vêm do banco via API real

#### **3. UX/Feedback**

- [ ] **Loading states** - Skeleton/spinner enquanto carrega
- [ ] **Empty states** - Mensagem/ilustração quando não há dados
- [ ] **Error states** - Mensagem de erro + botão "Tentar novamente"
- [ ] **Toast notifications** - Feedback visual para sucesso/erro em todas as ações
- [ ] **Confirmação de ações destrutivas** - Modal de confirmação antes de deletar

#### **4. Segurança e Permissões**

- [ ] **Autenticação obrigatória** - APIs retornam 401 se não autenticado
- [ ] **Autorização aplicada** - APIs retornam 403 se sem permissão
- [ ] **UI respeita roles** - Botões sensíveis escondidos para roles sem permissão
- [ ] **CompanyId validado** - Queries sempre filtram por `companyId` da sessão

#### **5. Responsividade**

- [ ] **Mobile funcional** - Telas funcionam bem em mobile (≥375px)
- [ ] **Tablet funcional** - Telas funcionam bem em tablet (≥768px)
- [ ] **Desktop funcional** - Telas funcionam bem em desktop (≥1024px)

#### **6. Documentação**

- [ ] **Rotas documentadas** - Arquivo README ou comentário lista rotas disponíveis
- [ ] **Endpoints documentados** - Comentário no código ou README lista endpoints + params
- [ ] **Schemas Zod documentados** - Comentários explicam campos obrigatórios/opcionais

#### **7. Performance (Básico)**

- [ ] **Paginação implementada** - Não carrega mais de 100 registros de uma vez
- [ ] **Queries otimizadas** - Uso de `select` e `include` do Prisma quando necessário
- [ ] **Imagens otimizadas** - Uso de `next/image` para imagens

---

### 🚫 NÃO É NECESSÁRIO (MVP)

Para considerarmos o módulo pronto no MVP, os seguintes itens **NÃO** são obrigatórios (podem ser fase 2):

- ❌ Testes automatizados (unit, integration, e2e)
- ❌ Storybook de componentes
- ❌ Documentação completa (Swagger/OpenAPI)
- ❌ Logs estruturados (Winston, Pino)
- ❌ Monitoramento (Sentry, LogRocket)
- ❌ CI/CD pipeline
- ❌ Cache (Redis)
- ❌ Rate limiting
- ❌ Websockets (real-time)
- ❌ Importação em massa (CSV/Excel) - marcado como "Fase 2" no blueprint

---

## 🎯 CONCLUSÃO

Este blueprint define:

✅ **Padrão único de UI:** Rotas dedicadas para novo/editar
✅ **Padrão único de Rotas:** Estrutura completa e consistente
✅ **Padrão único de API:** REST completo com todos os endpoints
✅ **Estrutura de Pastas:** Arquitetura em camadas bem definida
✅ **Autenticação e Permissões:** RBAC implementado em middleware, API e UI
✅ **Paginação, Busca e Erros:** Padrões globais documentados
✅ **Matriz Prisma:** Mapeamento completo do que existe e do que falta
✅ **Plano de Execução:** 4 lotes incrementais com estimativas
✅ **Definition of Done:** Critérios claros de conclusão

**Próximos passos:**
1. ✅ Validar este blueprint
2. ✅ Iniciar implementação do **Lote 1** (Clientes + Produtos)
3. ✅ Replicar padrão para demais lotes

---

**Data de criação:** 04/02/2026
**Última atualização:** 04/02/2026
**Versão:** 1.0
