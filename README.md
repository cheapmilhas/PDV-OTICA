<div align="center">
  <img src="docs/assets/logo-pdv-otica.png" alt="PDV Ótica Logo" width="200"/>

# 🏪 PDV Ótica - Sistema Completo para Óticas

**[🚀 Instalação](#%EF%B8%8F-setup-local)** • **[📖 Documentação](#-documentação)** • **[📡 API Reference](#-api-reference)** • **[🎯 Features](#-funcionalidades-implementadas)** • **[🐛 Troubleshooting](#-troubleshooting)** • **[❓ FAQ](#-faq)**

</div>

---

Sistema de gestão empresarial (ERP) completo desenvolvido especificamente para o segmento óptico. Gerencia vendas (PDV), ordens de serviço para lentes de grau, controle de estoque, gestão de caixa, comissões, convênios, receitas médicas, programa de fidelidade e relatórios gerenciais. Suporta multi-filial com isolamento seguro de dados (multi-tenant).

**Diferenciais**: Split payment nativo, fluxo completo de ordens de serviço (receita → laboratório → entrega), controle de garantias, agendamentos e stack moderna 100% type-safe.

---

## 🚀 Stack Tecnológica

| Camada | Tecnologia | Versão | Finalidade |
|--------|------------|--------|------------|
| **Framework** | Next.js | 16.1.6 | App Router, SSR, API Routes |
| **Linguagem** | TypeScript | 5.9.3 | Type safety end-to-end |
| **UI Library** | React | 19.2.4 | Interface moderna |
| **ORM** | Prisma | 5.22.0 | Type-safe database queries |
| **Database** | PostgreSQL | 14+ | ACID, relacional, robusto |
| **Autenticação** | NextAuth.js | 5.0.0-beta | JWT sessions, credentials |
| **Validação** | Zod | 4.3.6 | Runtime + compile-time |
| **State** | Zustand | 5.0.11 | Estado global leve |
| **UI Components** | shadcn/ui | - | Radix UI + Tailwind |
| **Styling** | Tailwind CSS | 3.3.0 | Utility-first CSS |
| **Icons** | Lucide React | 0.563.0 | Ícones modernos |
| **Charts** | Recharts | 3.7.0 | Dashboards e relatórios |
| **Dates** | date-fns | 4.1.0 | Manipulação de datas |
| **Notifications** | react-hot-toast | 2.6.0 | Toast notifications |
| **Deploy** | Vercel | - | Serverless, edge, CI/CD |

---

## 🏗️ Arquitetura do Sistema

### Visão Geral da Arquitetura

```mermaid
graph TB
    subgraph "Frontend - Next.js App Router"
        A[Browser/Client]
        B[React Components]
        C[Zustand State]
    end

    subgraph "Backend - Next.js API Routes"
        D[API Routes]
        E[NextAuth Middleware]
        F[Service Layer]
    end

    subgraph "Data Layer"
        G[Prisma ORM]
        H[(PostgreSQL)]
    end

    subgraph "External"
        I[Vercel Edge]
    end

    A -->|HTTP/HTTPS| I
    I -->|SSR/Route| B
    B -->|Client State| C
    B -->|API Calls| D
    D -->|Auth Check| E
    E -->|Business Logic| F
    F -->|Type-safe Queries| G
    G -->|SQL| H

    style A fill:#e1f5ff
    style H fill:#ff9999
    style F fill:#99ff99
    style I fill:#ffcc99
```

### Fluxo de Venda (PDV)

```mermaid
sequenceDiagram
    participant C as Cliente
    participant P as PDV UI
    participant A as API /sales
    participant S as SaleService
    participant DB as PostgreSQL

    C->>P: Seleciona produtos
    P->>P: Valida estoque local
    C->>P: Escolhe formas de pagamento
    P->>P: Valida soma = total
    P->>A: POST /api/sales
    A->>A: Valida sessão (companyId)
    A->>S: create(data, companyId, userId)
    S->>S: Valida regras de negócio
    S->>DB: BEGIN TRANSACTION
    DB->>DB: Cria Sale
    DB->>DB: Cria SaleItems
    DB->>DB: Atualiza stockQty
    DB->>DB: Cria Payments
    DB->>DB: Cria CashMovements
    DB->>DB: Cria Commission
    DB->>DB: COMMIT
    DB-->>S: Sale completa
    S-->>A: {sale, items, payments}
    A-->>P: 201 Created
    P-->>C: Comprovante/Recibo
```

### Modelo de Dados (Principais Entidades)

```mermaid
erDiagram
    Company ||--o{ Branch : tem
    Company ||--o{ User : possui
    Company ||--o{ Customer : pertence
    Company ||--o{ Product : gerencia

    Branch ||--o{ User : trabalha
    Branch ||--o{ Sale : registra
    Branch ||--o{ CashShift : opera
    Branch ||--o{ ServiceOrder : cria

    User ||--o{ Sale : realiza
    User ||--o{ CashShift : gerencia

    Customer ||--o{ Sale : compra
    Customer ||--o{ ServiceOrder : solicita
    Customer ||--o{ Prescription : possui

    Sale ||--o{ SaleItem : contém
    Sale ||--o{ Payment : recebe
    Sale ||--o{ CashMovement : gera
    Sale ||--o| Commission : resulta

    Product ||--o{ SaleItem : vendido
    Product ||--o{ StockMovement : movimenta

    ServiceOrder ||--|| Prescription : baseada
    ServiceOrder ||--o{ ServiceOrderItem : possui

    CashShift ||--o{ CashMovement : registra

    Company {
        string id PK
        string name
        string cnpj UK
        datetime createdAt
    }

    Branch {
        string id PK
        string companyId FK
        string name
        string code UK
    }

    User {
        string id PK
        string companyId FK
        string branchId FK
        string email UK
        enum role
    }

    Customer {
        string id PK
        string companyId FK
        string name
        string cpf UK
    }

    Product {
        string id PK
        string companyId FK
        string sku UK
        decimal price
        int stockQty
    }

    Sale {
        string id PK
        string companyId FK
        string branchId FK
        string userId FK
        string customerId FK
        decimal total
        enum status
    }

    CashShift {
        string id PK
        string branchId FK
        string userId FK
        enum status
        decimal openingFloat
        decimal closingBalance
    }

    ServiceOrder {
        string id PK
        string companyId FK
        string branchId FK
        string customerId FK
        string prescriptionId FK
        enum status
    }
```

---

## 📋 Pré-requisitos

- **Node.js** 18+ (recomendado 20 LTS)
- **PostgreSQL** 14+ (local ou cloud: Supabase, Neon, Railway)
- **npm** ou **pnpm**

---

## ⚙️ Setup Local

### 1. Clonar e Instalar

```bash
git clone <repository-url>
cd "PDV OTICA"
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie o arquivo `.env` na raiz do projeto com as seguintes variáveis:

#### Tabela de Variáveis

| Variável | Obrigatório | Padrão | Descrição | Onde Obter |
|----------|-------------|--------|-----------|------------|
| `DATABASE_URL` | ✅ | - | String de conexão PostgreSQL via pooler (PgBouncer) | Supabase Dashboard → Settings → Database → Connection Pooling |
| `DIRECT_URL` | ✅ | - | String de conexão direta (para migrations) | Supabase Dashboard → Settings → Database → Connection String |
| `NEXTAUTH_SECRET` | ✅ | - | Chave secreta para criptografia JWT (32+ chars) | Gerar com: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | `http://localhost:3000` | URL base da aplicação | `http://localhost:3000` (dev) / `https://your-domain.vercel.app` (prod) |
| `AUTH_MOCK` | ❌ | `false` | Usar credenciais mock (apenas dev) | `true` ou `false` |
| `NODE_ENV` | ❌ | `development` | Ambiente de execução | `development`, `production`, `test` |

#### Arquivo `.env` Completo (Exemplo)

```env
# ===========================
# DATABASE (PostgreSQL)
# ===========================
# Pooler connection (usado pela aplicação)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (usado apenas para migrations)
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

# ===========================
# NEXTAUTH (Autenticação)
# ===========================
# Gere com: openssl rand -base64 32
NEXTAUTH_SECRET="gkZ8vN3jR9qL4wX2mP7sT1fY6hU5nK0c"

# URL base da aplicação
NEXTAUTH_URL="http://localhost:3000"

# ===========================
# DEVELOPMENT (Opcional)
# ===========================
# Usar credenciais mock para login sem banco (dev only)
AUTH_MOCK="false"

# ===========================
# PRODUCTION (Opcional)
# ===========================
# Não necessário definir manualmente, Vercel/Node define automaticamente
# NODE_ENV="production"
```

#### Opções de Banco de Dados por Provider

##### 🟢 Supabase (Recomendado)

**Por que?** Pooler nativo (PgBouncer), backups automáticos, painel visual, plano gratuito generoso.

```env
# Connection Pooling (Transaction Mode) - para aplicação
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct Connection - para migrations (prisma migrate, db push)
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

**Como obter:**
1. Acesse [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá em **Settings** → **Database**
3. Copie:
   - **Connection Pooling** → `DATABASE_URL`
   - **Connection String** (URI) → `DIRECT_URL`

##### 🟣 Neon.tech

**Por que?** Serverless PostgreSQL, scale-to-zero, branching de banco (dev/staging/prod).

```env
DATABASE_URL="postgresql://user:pass@ep-xxx-yyy-zzz.us-east-2.aws.neon.tech/neondb"
DIRECT_URL="postgresql://user:pass@ep-xxx-yyy-zzz.us-east-2.aws.neon.tech/neondb"
```

**Como obter:**
1. Acesse [Neon Dashboard](https://console.neon.tech/)
2. Selecione seu projeto
3. Copie **Connection String** (mesma para ambas as variáveis)

##### 🐘 PostgreSQL Local

**Por que?** Desenvolvimento offline, controle total, testes locais.

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/pdv_otica"
DIRECT_URL="postgresql://postgres:password@localhost:5432/pdv_otica"
```

**Como configurar:**
```bash
# macOS (Homebrew)
brew install postgresql@14
brew services start postgresql@14
psql postgres -c "CREATE DATABASE pdv_otica;"

# Linux (Ubuntu/Debian)
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE DATABASE pdv_otica;"

# Docker
docker run --name pdv-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pdv_otica -p 5432:5432 -d postgres:14
```

#### Como Gerar `NEXTAUTH_SECRET`

```bash
# Método 1: OpenSSL (Linux/macOS)
openssl rand -base64 32

# Método 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Método 3: Online (apenas dev, não use em produção)
# https://generate-secret.vercel.app/32
```

#### Verificação de Variáveis

Após configurar o `.env`, valide:

```bash
# Testar conexão com banco
npx prisma db pull

# Visualizar variáveis carregadas (Next.js)
npm run dev
# Abra http://localhost:3000 e verifique logs
```

### 3. Configurar Banco de Dados

```bash
# Gerar Prisma Client
npx prisma generate

# Aplicar schema ao banco
npx prisma db push

# (Opcional) Popular com dados de exemplo
npm run seed:mock
```

### 4. Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

Acesse: **http://localhost:3000**

---

## 🔐 Credenciais de Teste

```
Email: admin@pdvotica.com
Senha: admin123
```

*(Funciona apenas com `AUTH_MOCK=true` ou após executar seed)*

---

## 📁 Estrutura do Projeto

```
PDV OTICA/
├── prisma/
│   ├── schema.prisma          # Schema do banco (49 models, 23 enums)
│   └── seed-mock.ts           # Dados de exemplo
├── src/
│   ├── app/
│   │   ├── (auth)/login       # Login page
│   │   ├── (dashboard)/       # Rotas protegidas
│   │   │   └── dashboard/
│   │   │       ├── pdv/                  # Ponto de Venda
│   │   │       ├── vendas/               # Histórico de vendas
│   │   │       ├── caixa/                # Controle de caixa
│   │   │       ├── ordens-servico/       # Ordens de Serviço
│   │   │       ├── clientes/             # CRUD Clientes
│   │   │       ├── produtos/             # CRUD Produtos
│   │   │       ├── estoque/              # Movimentações
│   │   │       ├── financeiro/           # Contas a pagar/receber
│   │   │       ├── fornecedores/         # CRUD Fornecedores
│   │   │       ├── funcionarios/         # CRUD Usuários
│   │   │       ├── relatorios/           # Dashboards
│   │   │       ├── metas/                # Comissões e metas
│   │   │       └── configuracoes/        # Settings
│   │   └── api/               # API Routes (50 endpoints)
│   │       ├── auth/
│   │       ├── sales/
│   │       ├── cash/
│   │       ├── customers/
│   │       ├── products/
│   │       ├── service-orders/
│   │       ├── users/
│   │       ├── suppliers/
│   │       ├── accounts-payable/
│   │       ├── accounts-receivable/
│   │       ├── stock-movements/
│   │       ├── dashboard/
│   │       ├── reports/
│   │       └── goals/
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── layout/            # Header, Sidebar
│   │   ├── shared/            # Reutilizáveis
│   │   ├── pdv/               # PDV específicos
│   │   ├── caixa/             # Modais de caixa
│   │   └── clientes/          # Modais de clientes
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client
│   │   ├── auth-helpers.ts    # Helpers de autenticação
│   │   ├── api-response.ts    # Response padronizados
│   │   ├── error-handler.ts   # Tratamento de erros
│   │   └── validations/       # Zod schemas
│   ├── services/              # Lógica de negócio
│   │   ├── sale.service.ts
│   │   ├── cash.service.ts
│   │   ├── customer.service.ts
│   │   ├── product.service.ts
│   │   ├── service-order.service.ts
│   │   ├── user.service.ts
│   │   ├── supplier.service.ts
│   │   └── stock-movement.service.ts
│   ├── auth.ts                # NextAuth config
│   ├── middleware.ts          # Auth middleware
│   └── types/                 # TypeScript types
└── DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md  # Documentação técnica completa

```

---

## 📡 API Reference

Base URL (Local): `http://localhost:3000/api`

### Autenticação

Todas as rotas (exceto `/api/auth/*`) exigem autenticação via NextAuth session. O `companyId` e `branchId` são extraídos automaticamente da sessão.

### Endpoints Disponíveis

#### 🔐 Autenticação

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth endpoints (signin, signout, session) | - |

#### 💰 Vendas (Sales)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/sales` | Criar nova venda (PDV) | ✅ |
| GET | `/api/sales` | Listar vendas da empresa | ✅ |
| GET | `/api/sales/:id` | Detalhes de uma venda | ✅ |
| PATCH | `/api/sales/:id` | Atualizar status da venda | ✅ |
| DELETE | `/api/sales/:id` | Cancelar venda (se permitido) | ✅ |

**POST /api/sales - Exemplo de Body:**
```json
{
  "customerId": "cm3abc123",
  "items": [
    {
      "productId": "cm3prod456",
      "quantity": 2,
      "unitPrice": 150.00,
      "discount": 10.00
    }
  ],
  "payments": [
    {
      "method": "CREDIT_CARD",
      "amount": 290.00
    }
  ],
  "total": 290.00,
  "discount": 10.00,
  "notes": "Cliente preferencial"
}
```

#### 💵 Caixa (Cash)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/cash/shifts/open` | Abrir turno de caixa | ✅ |
| POST | `/api/cash/shifts/close` | Fechar turno de caixa | ✅ |
| GET | `/api/cash/shifts/current` | Turno de caixa atual (OPEN) | ✅ |
| GET | `/api/cash/shifts` | Histórico de turnos | ✅ |
| POST | `/api/cash/movements` | Registrar sangria/suprimento | ✅ |
| GET | `/api/cash/movements` | Movimentações do caixa | ✅ |

#### 👥 Clientes (Customers)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/customers` | Criar cliente | ✅ |
| GET | `/api/customers` | Listar clientes | ✅ |
| GET | `/api/customers/:id` | Detalhes do cliente | ✅ |
| PATCH | `/api/customers/:id` | Atualizar cliente | ✅ |
| DELETE | `/api/customers/:id` | Deletar cliente | ✅ |

#### 📦 Produtos (Products)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/products` | Criar produto | ✅ |
| GET | `/api/products` | Listar produtos | ✅ |
| GET | `/api/products/:id` | Detalhes do produto | ✅ |
| PATCH | `/api/products/:id` | Atualizar produto | ✅ |
| DELETE | `/api/products/:id` | Deletar produto | ✅ |

#### 📋 Ordens de Serviço (Service Orders)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/service-orders` | Criar ordem de serviço | ✅ |
| GET | `/api/service-orders` | Listar ordens | ✅ |
| GET | `/api/service-orders/:id` | Detalhes da ordem | ✅ |
| PATCH | `/api/service-orders/:id` | Atualizar status/dados | ✅ |
| DELETE | `/api/service-orders/:id` | Cancelar ordem | ✅ |

#### 👤 Usuários (Users)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/users` | Criar usuário | ✅ (Admin) |
| GET | `/api/users` | Listar usuários | ✅ |
| GET | `/api/users/:id` | Detalhes do usuário | ✅ |
| PATCH | `/api/users/:id` | Atualizar usuário | ✅ (Admin) |
| DELETE | `/api/users/:id` | Deletar usuário | ✅ (Admin) |

#### 🏭 Fornecedores (Suppliers)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/suppliers` | Criar fornecedor | ✅ |
| GET | `/api/suppliers` | Listar fornecedores | ✅ |
| GET | `/api/suppliers/:id` | Detalhes do fornecedor | ✅ |
| PATCH | `/api/suppliers/:id` | Atualizar fornecedor | ✅ |
| DELETE | `/api/suppliers/:id` | Deletar fornecedor | ✅ |

#### 💳 Contas a Pagar (Accounts Payable)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/accounts-payable` | Criar conta a pagar | ✅ |
| GET | `/api/accounts-payable` | Listar contas a pagar | ✅ |
| GET | `/api/accounts-payable/:id` | Detalhes da conta | ✅ |
| PATCH | `/api/accounts-payable/:id/pay` | Pagar conta | ✅ |

#### 💰 Contas a Receber (Accounts Receivable)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/accounts-receivable` | Criar conta a receber | ✅ |
| GET | `/api/accounts-receivable` | Listar contas a receber | ✅ |
| GET | `/api/accounts-receivable/:id` | Detalhes da conta | ✅ |
| PATCH | `/api/accounts-receivable/:id/receive` | Receber conta | ✅ |

#### 📊 Estoque (Stock Movements)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/stock-movements` | Registrar movimentação | ✅ |
| GET | `/api/stock-movements` | Listar movimentações | ✅ |
| GET | `/api/stock-movements/:id` | Detalhes da movimentação | ✅ |

#### 📈 Dashboard & Relatórios

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| GET | `/api/dashboard/overview` | Indicadores principais | ✅ |
| GET | `/api/reports/sales` | Relatório de vendas | ✅ |
| GET | `/api/reports/products` | Relatório de produtos | ✅ |
| GET | `/api/reports/customers` | Relatório de clientes | ✅ |

#### 🎯 Metas e Comissões (Goals)

| Método | Endpoint | Descrição | Autenticado |
|--------|----------|-----------|-------------|
| POST | `/api/goals` | Criar meta | ✅ (Manager/Admin) |
| GET | `/api/goals` | Listar metas | ✅ |
| GET | `/api/goals/:id` | Detalhes da meta | ✅ |
| GET | `/api/commissions` | Listar comissões | ✅ |

### Códigos de Resposta Padrão

| Código | Significado |
|--------|-------------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado com sucesso |
| 400 | Bad Request - Erro de validação |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não encontrado |
| 500 | Internal Server Error - Erro do servidor |

### Formato de Erro Padrão

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Descrição do erro",
    "details": {}
  }
}
```

---

## ✅ Checklist de Produção

Antes de fazer o deploy para produção, certifique-se de completar todos os itens:

### 🔧 Configuração

- [ ] **Variáveis de ambiente configuradas no Vercel**
  - [ ] `DATABASE_URL` (connection pooling)
  - [ ] `DIRECT_URL` (direct connection)
  - [ ] `NEXTAUTH_SECRET` (gerado com `openssl rand -base64 32`)
  - [ ] `NEXTAUTH_URL` (URL de produção, ex: `https://pdv.seudominio.com`)
  - [ ] `AUTH_MOCK=false`

- [ ] **Banco de dados pronto**
  - [ ] PostgreSQL 14+ configurado (Supabase/Neon recomendado)
  - [ ] Schema aplicado: `npx prisma db push` ou `npx prisma migrate deploy`
  - [ ] Seed executado (se necessário): `npm run seed:mock`
  - [ ] Conexões testadas (pooler + direct)

- [ ] **Domínio configurado**
  - [ ] Domínio personalizado apontando para Vercel (se aplicável)
  - [ ] SSL/TLS ativo (HTTPS)
  - [ ] `NEXTAUTH_URL` atualizado com domínio final

### 🧪 Testes Pré-Deploy

- [ ] **Build local bem-sucedido**
  ```bash
  npm run build
  npm run start
  ```

- [ ] **Testes funcionais manuais**
  - [ ] Login funciona (credenciais reais, não mock)
  - [ ] PDV: Criar venda com múltiplos itens e pagamentos
  - [ ] Caixa: Abrir, registrar movimentações, fechar
  - [ ] CRUD: Clientes, Produtos, Fornecedores funcionam
  - [ ] Relatórios carregam sem erros

- [ ] **Performance**
  - [ ] Lighthouse Score > 80 (Performance, Acessibilidade)
  - [ ] Páginas carregam em < 3s

### 🔒 Segurança

- [ ] **Autenticação e autorização**
  - [ ] NextAuth configurado corretamente
  - [ ] Roles (ADMIN, MANAGER, SELLER) funcionando
  - [ ] Middleware protegendo rotas sensíveis

- [ ] **Secrets e credenciais**
  - [ ] `.env` NÃO está commitado no Git
  - [ ] `NEXTAUTH_SECRET` é forte (32+ caracteres)
  - [ ] Credenciais de banco seguras (não usar senhas padrão)

- [ ] **Headers de segurança**
  - [ ] CORS configurado (se aplicável)
  - [ ] Rate limiting considerado (Vercel tem proteção nativa)

### 📊 Monitoramento e Logs

- [ ] **Vercel Dashboard configurado**
  - [ ] Notificações de deploy ativas
  - [ ] Analytics habilitado (opcional)

- [ ] **Logs de erro**
  - [ ] Console do navegador limpo (sem erros críticos)
  - [ ] Logs do servidor monitorados (Vercel Logs)

### 💾 Backup e Recovery

- [ ] **Backup do banco de dados ativo**
  - [ ] Supabase: Backups automáticos configurados (últimos 7 dias)
  - [ ] Neon: Branching configurado
  - [ ] Local: Cron job de backup diário (`pg_dump`)

- [ ] **Plano de disaster recovery**
  - [ ] Documentado como restaurar backup
  - [ ] Testado pelo menos uma vez

### 📖 Documentação

- [ ] **README.md atualizado**
  - [ ] Instruções de setup claras
  - [ ] Credenciais de exemplo (não produção!)

- [ ] **Changelog atualizado**
  - [ ] Versão 1.0.0 documentada em `CHANGELOG.md`

- [ ] **Equipe treinada**
  - [ ] Usuários finais sabem como usar o sistema
  - [ ] Suporte técnico sabe como resolver problemas comuns

### 🚀 Deploy Final

- [ ] **Vercel deploy preview testado**
  ```bash
  vercel  # Deploy preview
  ```
  - [ ] Preview funciona 100%
  - [ ] Banco de produção conectado corretamente

- [ ] **Deploy para produção**
  ```bash
  vercel --prod
  ```

- [ ] **Pós-deploy**
  - [ ] Testar URL de produção imediatamente
  - [ ] Criar venda de teste real
  - [ ] Monitorar logs por 30 minutos

---

## 💾 Backup e Recovery

### Estratégias de Backup por Provider

#### 🟢 Supabase (Recomendado)

**Backups automáticos** (Plano gratuito e pago):
- Frequência: Diário
- Retenção: 7 dias (plano gratuito) / 30 dias (Pro)
- Localização: Supabase Dashboard → Database → Backups

**Como restaurar**:
1. Acesse **Supabase Dashboard** → **Database** → **Backups**
2. Selecione o backup desejado
3. Clique em **Restore**
4. Confirme (isso sobrescreve o banco atual!)

**Backup manual** (recomendado antes de mudanças grandes):
```bash
# Via Supabase CLI
supabase db dump -f backup_manual.sql

# Ou via pg_dump (usando DIRECT_URL)
pg_dump "$DIRECT_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

#### 🟣 Neon.tech

**Branching** (melhor que backup tradicional):
- Crie um "branch" do banco para cada ambiente (dev, staging, prod)
- Branches são isolados e podem ser criados instantaneamente

**Como criar branch**:
```bash
# Via Neon CLI
neon branches create --name staging

# Via Dashboard
# Acesse console.neon.tech → Branches → Create Branch
```

**Backup manual**:
```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
```

**Restaurar**:
```bash
psql "$DATABASE_URL" < backup_20260207.sql
```

---

#### 🐘 PostgreSQL Local

**Backup manual diário** (via cron):
```bash
# Criar script de backup
cat > ~/backup-pdv.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/backups/pdv-otica"
mkdir -p "$BACKUP_DIR"

pg_dump -U postgres pdv_otica > "$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Manter apenas últimos 30 dias
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +30 -delete
EOF

chmod +x ~/backup-pdv.sh
```

**Agendar com cron** (rodar todo dia às 3h da manhã):
```bash
crontab -e
# Adicione esta linha:
0 3 * * * /Users/seu-usuario/backup-pdv.sh
```

**Restaurar backup**:
```bash
# Dropar banco atual (cuidado!)
psql -U postgres -c "DROP DATABASE pdv_otica;"
psql -U postgres -c "CREATE DATABASE pdv_otica;"

# Restaurar
psql -U postgres pdv_otica < ~/backups/pdv-otica/backup_20260207_030000.sql
```

---

### Backup Completo (Código + Banco)

**Backup do código** (via Git):
```bash
# Certifique-se de que tudo está commitado
git add .
git commit -m "Pre-production backup"
git tag -a v1.0.0-backup -m "Backup antes de mudanças críticas"
git push origin v1.0.0-backup
```

**Backup completo do sistema** (banco + arquivos):
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_ROOT="$HOME/pdv-backups/$DATE"
mkdir -p "$BACKUP_ROOT"

# 1. Backup do banco
pg_dump "$DATABASE_URL" > "$BACKUP_ROOT/database.sql"

# 2. Backup de arquivos estáticos (se houver uploads)
# cp -r /caminho/para/uploads "$BACKUP_ROOT/uploads"

# 3. Backup do .env (cuidado! contém secrets)
cp .env "$BACKUP_ROOT/.env.backup"

# 4. Compactar tudo
tar -czf "$HOME/pdv-backups/full_backup_$DATE.tar.gz" -C "$BACKUP_ROOT" .

echo "Backup completo salvo em: $HOME/pdv-backups/full_backup_$DATE.tar.gz"
```

---

### Disaster Recovery Plan

**Cenário 1: Banco de dados corrompido**

1. **Identificar o problema**:
   ```bash
   # Testar conexão
   npx prisma db pull
   ```

2. **Restaurar último backup**:
   - Supabase: Dashboard → Backups → Restore
   - Neon: Create new branch from backup
   - Local: `psql < backup.sql`

3. **Validar restauração**:
   ```bash
   npx prisma studio
   # Verifique se os dados estão íntegros
   ```

4. **Redeploy aplicação** (se necessário):
   ```bash
   vercel --prod
   ```

---

**Cenário 2: Deploy com bug crítico**

1. **Reverter para versão anterior** (Vercel):
   - Acesse **Vercel Dashboard** → **Deployments**
   - Encontre o último deploy estável
   - Clique nos 3 pontos → **Promote to Production**

2. **Ou via CLI**:
   ```bash
   vercel rollback
   ```

---

**Cenário 3: Perda de dados acidental (ex: DELETE sem WHERE)**

1. **Parar a aplicação imediatamente**:
   ```bash
   # Desativar no Vercel
   # Ou mudar DATABASE_URL para um banco vazio temporariamente
   ```

2. **Restaurar backup mais recente**:
   ```bash
   psql "$DIRECT_URL" < backup_antes_do_erro.sql
   ```

3. **Aplicar mudanças necessárias**:
   - Se houve inserts/updates legítimos após o backup, reaplicar manualmente

4. **Reativar aplicação** e monitorar.

---

### Testes de Backup (recomendado fazer mensalmente)

```bash
# 1. Criar backup de teste
pg_dump "$DATABASE_URL" > test_backup.sql

# 2. Criar banco temporário
psql "$DATABASE_URL" -c "CREATE DATABASE pdv_test_restore;"

# 3. Restaurar nele
psql postgresql://...../pdv_test_restore < test_backup.sql

# 4. Validar dados
psql postgresql://...../pdv_test_restore -c "SELECT COUNT(*) FROM \"Sale\";"

# 5. Dropar banco de teste
psql "$DATABASE_URL" -c "DROP DATABASE pdv_test_restore;"
```

---

## 🚢 Deploy (Vercel)

### Via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy preview
vercel

# Deploy produção
vercel --prod
```

### Variáveis de Ambiente (Vercel Dashboard)

Configure no Vercel Dashboard → Settings → Environment Variables:

```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXTAUTH_SECRET=<your-secret>
NEXTAUTH_URL=https://your-domain.vercel.app
AUTH_MOCK=false
```

---

## 📝 Scripts Disponíveis

```bash
npm run dev              # Dev server (http://localhost:3000)
npm run build            # Build para produção
npm run start            # Servidor de produção
npm run lint             # ESLint

# Prisma
npx prisma studio        # Interface visual do banco (http://localhost:5555)
npx prisma generate      # Gerar Prisma Client
npx prisma db push       # Aplicar schema ao banco (dev)
npx prisma migrate dev   # Criar migration (produção)

# Utils
npm run seed:mock        # Popular banco com dados de exemplo
npm run validate:imports # Validar imports Lucide
```

---

## 📊 Funcionalidades Implementadas

### ✅ Completo (100%)
- Autenticação e autorização (NextAuth + multi-tenant)
- PDV com split payment (múltiplas formas de pagamento)
- Controle de caixa (abertura, fechamento, sangria, suprimento)
- CRUD de Clientes, Produtos, Fornecedores, Usuários
- Vendas com controle de estoque automático
- Comissões automáticas para vendedores
- Ordens de Serviço (receitas médicas → laboratório → entrega)
- Movimentações de estoque
- Contas a Pagar e Contas a Receber
- Relatórios e dashboards (vendas, metas, performance)

### ⚠️ Parcial
- Orçamentos (falta conversão para venda)
- Receitas médicas (falta validação de expiração)
- Integração com laboratórios (manual)

### ❌ Não Implementado
- NFC-e / NF-e (integração fiscal)
- Programa de fidelidade (pontos e tiers)
- Agendamentos completos
- Controle de garantias avançado
- Curva ABC de produtos
- DRE completo
- PWA / Modo offline

---

## 📖 Documentação

- **Documentação Técnica Completa**: [DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md](./DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md) (2,383 linhas)
  - 49 Models documentados
  - 23 Enums catalogados
  - 50 Endpoints mapeados
  - Decisões arquiteturais (ADRs)
  - Fluxos de negócio detalhados
  - Gaps e débitos técnicos

- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)
  - Histórico de versões
  - Funcionalidades adicionadas/modificadas/removidas
  - Correções de bugs e melhorias

---

## 🏗️ Arquitetura

### Decisões Arquiteturais Chave

1. **Multi-tenant por Design**: `companyId` sempre vem da session (nunca do request)
2. **Online-only**: Sem modo offline (dados sempre consistentes)
3. **Customer pertence à Company** (não à Branch): cliente pode comprar em qualquer filial
4. **Split Payment**: Venda pode ter N formas de pagamento
5. **Decimal para valores monetários**: Precisão financeira garantida
6. **Transações Prisma**: Operações críticas são atômicas
7. **Service Layer**: Lógica de negócio separada das API Routes

### Principais Invariantes

- `stockQty` NUNCA pode ser negativo
- Soma dos pagamentos >= total da venda
- Só 1 `CashShift` OPEN por branch
- Não pode vender sem caixa aberto
- `companyId` NUNCA vem do request body

---

## 🐛 Troubleshooting

### Erro: "Prisma Client not generated"

**Causa**: Prisma Client não foi gerado após mudanças no schema ou instalação inicial.

**Solução**:
```bash
npx prisma generate
```

---

### Erro: "Can't reach database server"

**Causa**: String de conexão incorreta ou banco de dados inacessível.

**Soluções**:
1. Verifique se o PostgreSQL está rodando:
   ```bash
   # Local
   brew services list | grep postgresql  # macOS
   sudo systemctl status postgresql      # Linux

   # Cloud (teste conexão)
   psql "$DATABASE_URL"
   ```

2. Valide as variáveis `.env`:
   ```bash
   echo $DATABASE_URL
   ```

3. Teste a conexão:
   ```bash
   npx prisma db pull
   ```

---

### Erro: "NextAuth configuration error"

**Causa**: `NEXTAUTH_SECRET` ou `NEXTAUTH_URL` não configurados.

**Solução**:
```bash
# Gerar secret
openssl rand -base64 32

# Adicionar no .env
echo 'NEXTAUTH_SECRET="<secret-gerado>"' >> .env
echo 'NEXTAUTH_URL="http://localhost:3000"' >> .env
```

---

### Erro: "There is a unique constraint violation"

**Causa**: Tentativa de criar registro com valor duplicado em campo único (ex: email, SKU, CPF).

**Solução**:
1. Verifique se o registro já existe no banco:
   ```bash
   npx prisma studio
   ```

2. Se necessário, use `upsert` ao invés de `create` no código:
   ```typescript
   await prisma.customer.upsert({
     where: { cpf: "12345678900" },
     update: { name: "João Silva" },
     create: { cpf: "12345678900", name: "João Silva", companyId }
   });
   ```

---

### Erro: "Stock quantity cannot be negative"

**Causa**: Tentativa de vender quantidade maior que o estoque disponível.

**Solução**:
1. Verifique o estoque atual:
   ```bash
   npx prisma studio
   # Abra a tabela "Product" e veja "stockQty"
   ```

2. Ajuste a quantidade no PDV ou adicione estoque:
   ```typescript
   // API: POST /api/stock-movements
   {
     "productId": "cm3xyz",
     "type": "ENTRY",
     "quantity": 100,
     "reason": "Compra de fornecedor"
   }
   ```

---

### Erro: "No open cash shift found"

**Causa**: Tentativa de realizar venda sem caixa aberto.

**Solução**:
1. Abra um turno de caixa:
   - Acesse **Dashboard** → **Caixa** → **Abrir Caixa**
   - Ou via API:
     ```bash
     curl -X POST http://localhost:3000/api/cash/shifts/open \
       -H "Content-Type: application/json" \
       -d '{"openingFloat": 100.00}'
     ```

---

### Erro: "401 Unauthorized" em todas as APIs

**Causa**: Sessão NextAuth expirada ou não autenticado.

**Solução**:
1. Faça login novamente em `/login`
2. Verifique se o cookie de sessão existe:
   - Abra **DevTools** → **Application** → **Cookies**
   - Procure por `next-auth.session-token`

3. Se o problema persistir, limpe os cookies:
   ```javascript
   // No console do navegador
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

---

### Erro: "Port 3000 already in use"

**Causa**: Outra instância do servidor está rodando na porta 3000.

**Solução**:
```bash
# Encontrar processo
lsof -ti:3000

# Matar processo
lsof -ti:3000 | xargs kill -9

# Ou usar porta diferente
PORT=3001 npm run dev
```

---

### Build falha com "Module not found"

**Causa**: Dependência faltando ou caminho de import incorreto.

**Solução**:
```bash
# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Verificar imports com case-sensitive
# Exemplo: "components/Button" vs "components/button"
```

---

### Vercel deploy falha

**Causas comuns**:

1. **Variáveis de ambiente não configuradas**:
   - Vá em **Vercel Dashboard** → **Settings** → **Environment Variables**
   - Adicione todas as variáveis do `.env`

2. **Build timeout**:
   - Aumente o timeout em `vercel.json`:
     ```json
     {
       "builds": [
         {
           "src": "package.json",
           "use": "@vercel/next",
           "config": { "maxDuration": 60 }
         }
       ]
     }
     ```

3. **Prisma generate não executado**:
   - Adicione em `package.json`:
     ```json
     {
       "scripts": {
         "postinstall": "prisma generate"
       }
     }
     ```

---

## ❓ FAQ

<details>
<summary><strong>Como adicionar uma nova filial?</strong></summary>

1. Acesse **Dashboard** → **Configurações** → **Filiais**
2. Clique em **Nova Filial**
3. Preencha: Nome, Código, Endereço, Telefone
4. Salve

**Ou via API**:
```bash
POST /api/branches
{
  "name": "Ótica Visão Centro",
  "code": "FIL002",
  "phone": "(11) 98765-4321",
  "address": "Rua Centro, 456"
}
```
</details>

<details>
<summary><strong>Como calcular a comissão de um vendedor?</strong></summary>

As comissões são calculadas **automaticamente** ao registrar uma venda. A regra é:

1. Verifica se o vendedor tem uma meta ativa (`Goal` com status `ACTIVE`)
2. Aplica a porcentagem definida na meta sobre o valor da venda
3. Cria um registro em `Commission` vinculado à venda

**Exemplo**:
- Venda: R$ 1.000,00
- Meta do vendedor: 5% de comissão
- Comissão gerada: R$ 50,00

Para alterar a porcentagem, edite a meta do vendedor em **Dashboard** → **Metas**.
</details>

<details>
<summary><strong>O sistema funciona offline?</strong></summary>

❌ **Não**. O PDV Ótica é 100% online (online-only). Requer conexão constante com:
- Banco de dados (PostgreSQL)
- Backend (Next.js API Routes)

**Por quê?**
- Garantir consistência de dados (estoque, caixa, vendas)
- Evitar conflitos de sincronização
- Arquitetura mais simples e confiável

**Alternativa**: Use um hotspot móvel (4G/5G) em caso de queda da internet fixa.
</details>

<details>
<summary><strong>Como exportar relatórios?</strong></summary>

Atualmente, os relatórios são exibidos na tela em **Dashboard** → **Relatórios**. Para exportar:

**Método manual**:
1. Abra o relatório desejado (ex: Vendas por Período)
2. Use **Ctrl+P** (ou **Cmd+P** no Mac)
3. Escolha "Salvar como PDF"

**Método programático** (futuro):
```bash
GET /api/reports/sales?format=csv&startDate=2026-01-01&endDate=2026-01-31
```

Roadmap: Export nativo para CSV, Excel e PDF (Issue #12).
</details>

<details>
<summary><strong>Posso usar o sistema para múltiplas óticas?</strong></summary>

✅ **Sim!** O sistema é **multi-tenant** por design.

Cada `Company` (empresa) é totalmente isolada:
- Clientes, produtos, vendas, usuários são segregados por `companyId`
- Cada empresa pode ter múltiplas `Branch` (filiais)
- Dados de uma empresa **nunca** vazam para outra

**Exemplo de uso**:
- **Company 1**: Óticas Brasil (3 filiais)
- **Company 2**: Óticas Premium (2 filiais)

Cada empresa faz login com seu próprio domínio ou credenciais separadas.
</details>

<details>
<summary><strong>Como fazer backup do banco de dados?</strong></summary>

**Supabase** (automático):
- Backups diários automáticos (últimos 7 dias)
- Acesse **Dashboard** → **Database** → **Backups**
- Faça download manual se necessário

**PostgreSQL local**:
```bash
# Backup completo
pg_dump -U postgres pdv_otica > backup_$(date +%Y%m%d).sql

# Restaurar
psql -U postgres pdv_otica < backup_20260207.sql
```

**Neon.tech**:
- Use branching: crie um "branch" do banco para cada deploy
- Restore via dashboard ou API
</details>

<details>
<summary><strong>Como integrar com nota fiscal eletrônica (NFC-e/NF-e)?</strong></summary>

❌ **Não implementado** atualmente.

**Roadmap**:
- Integração com API Focus NFe ou Bling
- Emissão automática ao finalizar venda
- Envio por email/SMS ao cliente

**Workaround temporário**:
Use um sistema externo (ex: ContaAzul, Bling) e registre a nota manualmente no PDV após emissão.
</details>

<details>
<summary><strong>Quais formas de pagamento são suportadas?</strong></summary>

As seguintes formas de pagamento estão implementadas (enum `PaymentMethod`):

- ✅ `MONEY` - Dinheiro
- ✅ `CREDIT_CARD` - Cartão de Crédito
- ✅ `DEBIT_CARD` - Cartão de Débito
- ✅ `PIX` - PIX
- ✅ `BANK_TRANSFER` - Transferência Bancária
- ✅ `CHECK` - Cheque
- ✅ `STORE_CREDIT` - Crédito Loja
- ✅ `INSURANCE` - Convênio (ex: plano de saúde)

O sistema permite **split payment**: uma venda pode ter múltiplas formas de pagamento (ex: R$ 200 em dinheiro + R$ 300 no cartão).
</details>

<details>
<summary><strong>Como resetar a senha de um usuário?</strong></summary>

❌ **Sem função "Esqueci minha senha"** implementada atualmente.

**Solução temporária** (requer acesso ao banco):
```sql
-- Conecte ao banco via Prisma Studio ou psql
UPDATE "User"
SET password_hash = '$2a$10$...'  -- Hash bcrypt de "novasenha123"
WHERE email = 'usuario@pdvotica.com';
```

**Gerar hash bcrypt**:
```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('novasenha123', 10);
console.log(hash);
```

**Roadmap**: Implementar fluxo de reset via email (Issue #8).
</details>

---

## 🧪 Testes

**Status**: ❌ 0% de cobertura (débito técnico)

**Roadmap**:
- [ ] Testes unitários (Vitest)
- [ ] Testes de integração (API Routes)
- [ ] Testes E2E (Playwright)

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Para contribuir com o projeto:

1. Leia o [Guia de Contribuição](./CONTRIBUTING.md)
2. Fork o repositório
3. Crie uma branch (`git checkout -b feature/amazing-feature`)
4. Commit suas mudanças seguindo [Conventional Commits](https://www.conventionalcommits.org/)
5. Push para a branch (`git push origin feature/amazing-feature`)
6. Abra um Pull Request

**Principais diretrizes**:
- Siga as convenções de código (TypeScript strict, Prettier, ESLint)
- Mantenha commits pequenos e focados
- Atualize a documentação quando necessário
- Use a Service Layer para lógica de negócio
- Sempre extraia `companyId` da sessão (multi-tenant)

Para mais detalhes, consulte [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📄 Licença

Proprietário - Todos os direitos reservados.

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a [Documentação Técnica Completa](./DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md)
2. Verifique os logs no terminal (`npm run dev`)
3. Inspecione o banco de dados com `npx prisma studio`

---

**Versão**: 1.0.0
**Última atualização**: 2026-02-07
