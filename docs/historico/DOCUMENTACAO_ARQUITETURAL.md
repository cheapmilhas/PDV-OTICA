# 🏗️ DOCUMENTAÇÃO ARQUITETURAL COMPLETA — PDV ÓTICA

> Gerado em: 2026-02-17
> Sistema: PDV Ótica — Ponto de Venda para Lojas de Óptica
> Versão do Schema: Prisma 5.22.0 / PostgreSQL (Neon)

---

## 📋 SUMÁRIO

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Blueprint de Arquitetura](#2-blueprint-de-arquitetura)
3. [Schema Completo do Banco de Dados](#3-schema-completo-do-banco-de-dados)
4. [Diagrama de Relacionamentos (ERD)](#4-diagrama-de-relacionamentos-erd)
5. [Catálogo de Funcionalidades](#5-catálogo-de-funcionalidades)
6. [Fluxos de Negócio End-to-End](#6-fluxos-de-negócio-end-to-end)
7. [Matriz de Integrações entre Módulos](#7-matriz-de-integrações-entre-módulos)
8. [Segurança e Permissões](#8-segurança-e-permissões)
9. [Performance e Escalabilidade](#9-performance-e-escalabilidade)
10. [Análise de Melhorias](#10-análise-de-melhorias)

---

## 1. VISÃO GERAL DO SISTEMA

### 1.1 Objetivo

O **PDV Ótica** é um sistema de gestão completo (ERP/PDV) desenvolvido especificamente para **lojas de óptica**. Ele cobre desde o atendimento ao cliente com receita (prescrição oftalmológica) até a gestão financeira, passando por ordens de serviço de laboratório, controle de estoque de armações e lentes, e CRM integrado.

### 1.2 Stack Tecnológico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework Frontend/Backend | Next.js (App Router) | 16.1.6 |
| Linguagem | TypeScript | 5.9.3 |
| ORM | Prisma | 5.22.0 |
| Banco de Dados | PostgreSQL (Neon — serverless) | — |
| Autenticação | NextAuth v5 (beta) | 5.0.0-beta.30 |
| UI Components | Shadcn UI (Radix UI + Tailwind) | — |
| Estilos | Tailwind CSS | 3.3.0 |
| Validação | Zod | 4.3.6 |
| Formulários | React Hook Form | 7.71.1 |
| Gráficos | Recharts | 3.7.0 |
| PDF | jsPDF + jspdf-autotable | 4.1.0 |
| Barcode | bwip-js | 4.8.0 |
| State Management | Zustand | 5.0.11 |
| Toasts | Sonner + React Hot Toast | — |
| Deploy | Vercel | — |
| Adapter Auth-DB | @auth/prisma-adapter | 2.11.1 |

### 1.3 Usuários do Sistema

| Role | Nome PT-BR | Permissões Gerais |
|------|-----------|-------------------|
| ADMIN | Administrador | Acesso total, configurações, usuários |
| GERENTE | Gerente | Gestão de vendas, estoque, relatórios, aprovações |
| VENDEDOR | Vendedor | PDV, OS, clientes, orçamentos |
| CAIXA | Caixa | Caixa, pagamentos, recebimentos |
| ATENDENTE | Atendente | Atendimento, OS, agendamentos |

### 1.4 Módulos Existentes

1. Autenticação e Sessão
2. Empresa e Filiais (Multi-tenant)
3. Usuários e Permissões
4. Clientes (CRM com histórico)
5. Médicos / Prescritores
6. Produtos (armações, lentes, acessórios, serviços)
7. Estoque (controle, ajustes, transferências)
8. Fornecedores
9. Laboratórios Ópticos
10. Tratamentos de Lentes
11. Prescrições / Receitas
12. PDV (Ponto de Venda)
13. Vendas
14. Orçamentos (CRM de follow-up)
15. Ordens de Serviço (OS)
16. Caixa (Abertura/Fechamento/Turnos)
17. Contas a Receber
18. Contas a Pagar
19. Cashback
20. Lembretes e CRM Automático
21. Agendamentos
22. Convênios/Planos
23. Programa de Fidelidade
24. Metas e Comissões
25. Relatórios (DRE, Vendas, Estoque, etc.)
26. Configurações (Regras, Aparência, etc.)
27. Auditoria

### 1.5 Particularidades do Negócio de Ótica

- **Receita Médica (Prescrição)**: Clientes precisam de receita com grau (OD/OE), DP, adição, etc. Receitas têm validade (geralmente 1 ano).
- **Laboratório Óptico**: Após venda de lentes, uma OS é criada e enviada ao laboratório para confecção. O lab pode ser externo (terceirizado) com prazo de 3–7 dias.
- **Sufixo de OS**: OS de garantia recebem sufixo `-G` e retrabalho `-R` no número exibido (ex: `#000042-G`).
- **DNP (Distância Naso-Pupilar)**: Medição essencial para centragem das lentes, registrado como `pdFar` e `pdNear`.
- **Tipos de Lentes**: Monofocal (SINGLE_VISION), Bifocal (BIFOCAL), Multifocal (MULTIFOCAL), Ocupacional (OCCUPATIONAL).
- **Tratamentos**: AR (anti-reflexo), Blue Light, Fotossensível — registrados em `LabPriceRange`.
- **Armações**: Possuem medidas específicas (`lensWidthMm`, `bridgeMm`, `templeMm`), formato e gênero.
- **Cashback**: Sistema próprio de fidelização com percentual de ganho por compra e expiração.

---

## 2. BLUEPRINT DE ARQUITETURA

### 2.1 Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────┐
│          Browser / Mobile (PWA)                 │
│   React 19 + Tailwind CSS + Shadcn UI           │
└────────────────┬────────────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────────────┐
│         Next.js 16 (App Router)                 │
│                                                 │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Pages (RSC) │  │  API Routes (/api/*)      │ │
│  │  /dashboard  │  │  ~120 endpoints           │ │
│  │  /login      │  │                          │ │
│  └──────────────┘  └──────────┬───────────────┘ │
│                               │                 │
│               ┌───────────────▼───────────────┐ │
│               │   Services Layer (29 arquivos) │ │
│               │   sale.service.ts              │ │
│               │   service-order.service.ts     │ │
│               │   cashback.service.ts          │ │
│               │   ... (26 outros)              │ │
│               └───────────────┬───────────────┘ │
│                               │                 │
│               ┌───────────────▼───────────────┐ │
│               │   Validações Zod (18 schemas) │ │
│               │   + Error Handler              │ │
│               │   + Auth Helpers               │ │
│               └───────────────┬───────────────┘ │
└───────────────────────────────┼─────────────────┘
                                │ Prisma Client
┌───────────────────────────────▼─────────────────┐
│              Prisma ORM 5.22                    │
│         (Multi-tenant com companyId)            │
└───────────────────────────────┬─────────────────┘
                                │
┌───────────────────────────────▼─────────────────┐
│        PostgreSQL — Neon (Serverless)           │
│        ~50 tabelas, ~35 enums                   │
└─────────────────────────────────────────────────┘
```

### 2.2 Estrutura de Pastas

```
src/
├── app/
│   ├── (auth)/login/          # Página de login
│   ├── (dashboard)/           # Layout autenticado
│   │   └── dashboard/
│   │       ├── page.tsx        # Dashboard principal
│   │       ├── pdv/            # Ponto de Venda
│   │       ├── vendas/         # Histórico de vendas
│   │       ├── clientes/       # CRM de clientes
│   │       ├── produtos/       # Catálogo de produtos
│   │       ├── estoque/        # Controle de estoque
│   │       ├── ordens-servico/ # OS com laboratório
│   │       ├── orcamentos/     # CRM de orçamentos
│   │       ├── financeiro/     # Contas a pagar/receber
│   │       ├── caixa/          # Turnos de caixa
│   │       ├── cashback/       # Programa de cashback
│   │       ├── metas/          # Metas e comissões
│   │       ├── relatorios/     # ~9 relatórios
│   │       ├── laboratorios/   # Gestão de labs
│   │       ├── fornecedores/   # Fornecedores
│   │       ├── funcionarios/   # Usuários/permissões
│   │       ├── tratamentos/    # Tratamentos de lentes
│   │       ├── lembretes/      # CRM automático
│   │       └── configuracoes/  # Configurações do sistema
│   └── api/                   # ~120 endpoints REST
├── components/
│   ├── layout/                # Header, Sidebar, MobileNav
│   ├── ui/                    # Shadcn components
│   └── [módulo]/              # Componentes por módulo (82 total)
├── services/                  # Lógica de negócio (29 arquivos)
│   └── reports/               # Serviços de relatórios (8 arquivos)
├── lib/
│   ├── validations/           # Schemas Zod (18 arquivos)
│   ├── auth-helpers.ts        # requireAuth, getCompanyId, getBranchId
│   ├── api-response.ts        # Helpers de resposta padronizada
│   ├── error-handler.ts       # handleApiError
│   └── pdf-utils.ts           # Geração de PDFs (jsPDF)
├── hooks/                     # React hooks customizados
├── types/                     # Tipos TypeScript globais
└── middleware/                # Middleware Next.js (autenticação)
```

### 2.3 Padrões de Arquitetura

- **MVC simplificado**: Page/Component (View) → API Route (Controller) → Service (Model/Business Logic) → Prisma (ORM)
- **Multi-tenant**: Todos os dados isolados por `companyId` em nível de query Prisma
- **Server Components + Client Components**: RSC para data fetching, `"use client"` para interatividade
- **Validação em dupla camada**: Zod no frontend (RHF) + Zod no backend (API route)
- **Fluxo de requisição**: UI → `fetch('/api/...')` → `requireAuth()` → Service → `prisma.model.operation()` → JSON response

---

## 3. SCHEMA COMPLETO DO BANCO DE DADOS

### TABELA: Company

**Finalidade**: Raiz do multi-tenant. Cada empresa cliente do sistema tem um registro aqui. Todos os dados são isolados por `companyId`.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String (cuid) | Não | cuid() | Identificador único |
| name | String | Não | — | Razão social |
| tradeName | String | Sim | — | Nome fantasia |
| cnpj | String | Sim | — | CNPJ único (@@unique) |
| address | String | Sim | — | Endereço |
| city | String | Sim | — | Cidade |
| state | String | Sim | — | Estado (UF) |
| zipCode | String | Sim | — | CEP |
| phone | String | Sim | — | Telefone |
| email | String | Sim | — | E-mail |
| website | String | Sim | — | Site |
| logoPath | String | Sim | — | Caminho do logo |
| settings | Json | Sim | — | Configurações genéricas em JSON |
| createdAt | DateTime | Não | now() | Data de criação |
| updatedAt | DateTime | Não | @updatedAt | Última atualização |

**Relações**: Possui todos os outros modelos (branches, users, customers, products, sales, etc.)

---

### TABELA: Branch

**Finalidade**: Filial de uma empresa. Uma empresa pode ter múltiplas filiais, cada uma com caixa, metas e configurações próprias.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String (cuid) | Não | cuid() | Identificador único |
| companyId | String | Não | — | FK → Company |
| name | String | Não | — | Nome da filial |
| code | String | Sim | — | Código da filial (único por empresa) |
| address/city/state/zipCode | String | Sim | — | Endereço completo |
| phone | String | Sim | — | Telefone |
| stateRegistration | String | Sim | — | Inscrição estadual |
| nfeSeries | Int | Sim | — | Série da NF-e |
| lastNfeNumber | Int | Sim | — | Último número de NF-e |
| active | Boolean | Não | true | Se a filial está ativa |
| createdAt/updatedAt | DateTime | Não | — | Auditoria |

**Índices**: `@@unique([companyId, code])`, `@@index([companyId, name])`

---

### TABELA: User

**Finalidade**: Funcionário/usuário do sistema. Cada usuário pertence a uma empresa e pode ter acesso a múltiplas filiais.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String (cuid) | Não | cuid() | Identificador único |
| companyId | String | Não | — | FK → Company |
| name | String | Não | — | Nome completo |
| email | String | Não | — | E-mail único (login) |
| passwordHash | String | Não | — | Hash bcrypt da senha |
| role | UserRole | Não | — | ADMIN/GERENTE/VENDEDOR/CAIXA/ATENDENTE |
| active | Boolean | Não | true | Se o usuário está ativo |
| defaultCommissionPercent | Decimal(5,2) | Sim | — | % de comissão padrão do vendedor |
| createdAt/updatedAt | DateTime | Não | — | Auditoria |

**Índices**: `@@index([companyId, role])`, `@@index([companyId, name])`

---

### TABELA: UserBranch (Pivô N:N)

**Finalidade**: Relaciona usuários com filiais que têm acesso.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| userId | String | FK → User |
| branchId | String | FK → Branch |

**Chave Primária Composta**: `[userId, branchId]`

---

### TABELA: AuditLog

**Finalidade**: Registro de auditoria de ações no sistema (quem fez o quê, quando, com quais dados).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| branchId | String | Sim | FK → Branch |
| userId | String | Sim | FK → User (quem fez) |
| action | String | Não | Ação (ex: CREATE, UPDATE, DELETE) |
| entityType | String | Não | Tipo da entidade (ex: Sale, Customer) |
| entityId | String | Não | ID da entidade alterada |
| oldData | Json | Sim | Dados antes da alteração |
| newData | Json | Sim | Dados depois da alteração |
| ip | String | Sim | IP do usuário |
| createdAt | DateTime | Não | Quando ocorreu |

---

### TABELA: Customer

**Finalidade**: Cliente da óptica. Guarda dados pessoais, endereço, e é o centro do CRM (receitas, compras, OS, cashback, lembretes).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome completo |
| cpf | String | Sim | CPF (único por empresa) |
| rg | String | Sim | RG |
| phone/phone2 | String | Sim | Telefones |
| email | String | Sim | E-mail |
| birthDate | DateTime | Sim | Data de nascimento |
| gender | String | Sim | Gênero |
| address/number/complement/neighborhood/city/state/zipCode | String | Sim | Endereço |
| acceptsMarketing | Boolean | Não | true | Aceita comunicações |
| referralSource | String | Sim | Como conheceu a loja |
| notes | String | Sim | Observações internas |
| active | Boolean | Não | true | Se está ativo |
| createdAt/updatedAt | DateTime | Não | Auditoria |

**Índices**: `@@unique([companyId, cpf])`, índices em name, phone, email

---

### TABELA: CustomerDependent

**Finalidade**: Dependentes de um cliente (ex: filhos que também usam óculos e têm suas receitas).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| customerId | String | Não | FK → Customer |
| name | String | Não | Nome do dependente |
| relationship | String | Não | Parentesco (filho, cônjuge, etc.) |
| birthDate | DateTime | Sim | Data de nascimento |
| cpf | String | Sim | CPF |

---

### TABELA: Doctor

**Finalidade**: Médico/oftalmologista que emite as receitas. Pode ser parceiro da óptica com comissão.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome do médico |
| crm | String | Sim | Número do CRM |
| uf | String | Sim | Estado do CRM |
| specialty | String | Sim | Especialidade |
| isPartner | Boolean | Não | false | Se é médico parceiro |
| partnerCommissionPercent | Decimal(5,2) | Sim | % comissão por indicação |
| phone/email | String | Sim | Contato |
| clinicName/clinicAddress | String | Sim | Clínica |
| active | Boolean | Não | true | — |

**Índices**: `@@unique([companyId, crm, uf])`

---

### TABELA: Lab

**Finalidade**: Laboratório óptico externo que confecciona as lentes. Recebe as OS enviadas, tem prazo de entrega e desconto padrão.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome do laboratório |
| code | String | Sim | Código interno |
| cnpj/phone/email/website | String | Sim | Dados de contato |
| orderEmail | String | Sim | E-mail para pedidos |
| contactPerson | String | Sim | Responsável |
| integrationType | String | Sim | Tipo de integração (API, email, etc.) |
| apiUrl/apiKey/clientCode | String | Sim | Integração automática |
| defaultLeadTimeDays | Int | Não | 7 | Prazo padrão (dias) |
| urgentLeadTimeDays | Int | Não | 3 | Prazo urgente (dias) |
| paymentTermDays | Int | Não | 30 | Prazo de pagamento |
| defaultDiscount | Decimal(5,2) | Não | 0 | Desconto padrão nas OS |
| qualityRating | Decimal(3,2) | Sim | — | Avaliação de qualidade (0-5) |
| totalOrders | Int | Não | 0 | Contador de pedidos (cache) |
| totalReworks | Int | Não | 0 | Contador de retrabalhos |
| active | Boolean | Não | true | — |

---

### TABELA: LensTreatment

**Finalidade**: Tratamentos disponíveis para lentes (ex: AR — anti-reflexo, Blue Control, Fotossensível).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome do tratamento (único por empresa) |
| description | String | Sim | Descrição |
| price | Decimal(10,2) | Não | — | Preço do tratamento |
| active | Boolean | Não | true | — |

---

### TABELA: LabPriceRange

**Finalidade**: Tabela de preços do laboratório por tipo de lente, material e faixa de grau. Permite calcular o custo da lente automaticamente.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| labId | String | Não | FK → Lab |
| lensType | String | Não | Tipo (monofocal, multifocal, etc.) |
| material | String | Não | Material (orgânico, policarbonato, etc.) |
| sphMin/sphMax | Decimal(5,2) | Sim | Faixa de esférico |
| cylMin/cylMax | Decimal(5,2) | Sim | Faixa de cilíndrico |
| labPrice | Decimal(12,2) | Não | — | Preço do laboratório |
| suggestedPrice | Decimal(12,2) | Sim | — | Preço sugerido de venda |
| arPrice/blueLightPrice/photochromicPrice | Decimal(12,2) | Sim | — | Preços de tratamentos |
| leadTimeDays | Int | Sim | — | Prazo específico para esta faixa |
| active | Boolean | Não | true | — |

---

### TABELA: Supplier

**Finalidade**: Fornecedor de produtos (armações, lentes, acessórios). Vinculado a produtos e contas a pagar.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name/tradeName | String | Não/Sim | Razão social / Nome fantasia |
| cnpj | String | Sim | CNPJ (único por empresa) |
| phone/email/website | String | Sim | Contato |
| contactPerson | String | Sim | Responsável |
| address/city/state/zipCode | String | Sim | Endereço |
| notes | String | Sim | Observações |
| active | Boolean | Não | true | — |

---

### TABELA: Category

**Finalidade**: Categoria de produto hierárquica (ex: Armações > Masculino > Esportivo). Tem comissão e margem mínima configuráveis.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome (único por empresa) |
| parentId | String | Sim | FK → Category (hierarquia) |
| defaultCommissionPercent | Decimal(5,2) | Sim | Comissão padrão da categoria |
| minMarginPercent | Decimal(5,2) | Sim | Margem mínima exigida |
| active | Boolean | Não | true | — |

---

### TABELA: Brand

**Finalidade**: Marca do produto (ex: Ray-Ban, Vogue, Hoya). Define margem mínima e desconto máximo.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| code | String | Não | Código (único por empresa) |
| name | String | Não | Nome da marca |
| manufacturer | String | Sim | Fabricante |
| minMargin/maxDiscount | Decimal(5,2) | Sim | Regras comerciais |
| segment/origin | String | Sim | Segmento e origem |
| logoPath/website | String | Sim | Logo e site |
| active | Boolean | Não | true | — |

---

### TABELA: Shape

**Finalidade**: Formato da armação (redonda, quadrada, aviador, etc.). Indica para quais tipos de rosto é indicada.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| code/name | String | Não | Código e nome |
| description | String | Sim | Descrição |
| imageUrl | String | Sim | Imagem ilustrativa |
| faceTypes | String[] | Não | Tipos de rosto ideais |
| active | Boolean | Não | true | — |

---

### TABELA: Color

**Finalidade**: Cor da armação ou lente, com código hexadecimal para exibição visual.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| code/name | String | Não | Código e nome |
| hex | String | Sim | Cor em hexadecimal (#RRGGBB) |
| active | Boolean | Não | true | — |

---

### TABELA: Product

**Finalidade**: Produto do catálogo. Coração do estoque. Pode ser armação, lente de contato, acessório, serviço ou lente oftálmica.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String | Não | cuid() | Identificador |
| companyId | String | Não | — | FK → Company |
| type | ProductType | Não | — | FRAME/CONTACT_LENS/ACCESSORY/SUNGLASSES/LENS_SERVICE/SERVICE/etc. |
| sku | String | Não | — | SKU (único por empresa) |
| barcode | String | Sim | — | Código de barras principal |
| manufacturerCode | String | Sim | — | Código do fabricante |
| name | String | Não | — | Nome do produto |
| description | String | Sim | — | Descrição detalhada |
| categoryId | String | Sim | — | FK → Category |
| brandId | String | Sim | — | FK → Brand |
| shapeId | String | Sim | — | FK → Shape (armações) |
| colorId | String | Sim | — | FK → Color |
| costPrice | Decimal(12,2) | Não | 0 | Preço de custo |
| salePrice | Decimal(12,2) | Não | — | Preço de venda |
| promoPrice | Decimal(12,2) | Sim | — | Preço promocional |
| marginPercent | Decimal(5,2) | Sim | — | Margem percentual calculada |
| stockControlled | Boolean | Não | true | Se controla estoque |
| stockQty | Int | Não | 0 | Quantidade atual em estoque |
| stockMin | Int | Não | 0 | Estoque mínimo (alerta) |
| stockMax | Int | Sim | — | Estoque máximo |
| reorderPoint | Int | Sim | — | Ponto de reposição |
| abcClass | String | Sim | — | Classificação ABC (A/B/C) |
| turnoverDays | Int | Sim | — | Dias de giro médio |
| ncm/cest | String | Sim | — | Dados fiscais |
| mainImage/images | String/String[] | Sim | — | Imagens |
| active/featured/launch | Boolean | Não | true/false/false | Status |
| supplierId | String | Sim | — | FK → Supplier |

**Índices**: SKU único, índices em name, barcode, type, abcClass

**Relações 1:1 (detalhes por tipo)**:
- `frameDetail` → FrameDetail (para armações)
- `contactLensDetail` → ContactLensDetail (para lentes de contato)
- `accessoryDetail` → AccessoryDetail (para acessórios)
- `serviceDetail` → ServiceDetail (para serviços)
- `lensServiceDetail` → LensServiceDetail (para serviços de lente)

---

### TABELA: FrameDetail

**Finalidade**: Detalhes específicos de armações (medidas em mm, material, gênero).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| productId | String | Não | FK/PK → Product |
| lensWidthMm | Int | Sim | Largura da lente em mm |
| bridgeMm | Int | Sim | Medida da ponte em mm |
| templeMm | Int | Sim | Comprimento da haste em mm |
| sizeText | String | Sim | Tamanho em texto (ex: "52-18-145") |
| material | String | Sim | Material (acetato, metal, TR90, etc.) |
| gender | String | Sim | Masculino/Feminino/Unissex |
| collection | String | Sim | Coleção |

---

### TABELA: ContactLensDetail

**Finalidade**: Detalhes de lentes de contato (curva base, diâmetro, faixas de grau).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| productId | String | Não | FK/PK → Product |
| brandModel | String | Sim | Modelo da marca |
| type | String | Sim | Descartável/mensal/anual |
| material | String | Sim | Hidrogel, silicone, etc. |
| baseCurve | String | Sim | Curva base (ex: 8.6) |
| diameter | String | Sim | Diâmetro (ex: 14.2) |
| packQty | Int | Sim | Quantidade por caixa |
| sphRange/cylRange/axisRange/addRange | String | Sim | Faixas disponíveis de grau |
| color | String | Sim | Cor (para coloridas) |

---

### TABELA: Prescription

**Finalidade**: Receita médica (prescrição oftalmológica) do cliente. Tem validade e é vinculada ao médico que emitiu.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| customerId | String | Não | FK → Customer |
| doctorId | String | Sim | FK → Doctor |
| issuedAt | DateTime | Não | Data de emissão |
| expiresAt | DateTime | Não | Data de validade |
| prescriptionType | String | Sim | Longe, perto, bifocal |
| notes | String | Sim | Observações |
| imageUrl | String | Sim | Foto da receita original |

---

### TABELA: PrescriptionValues

**Finalidade**: Valores da prescrição oftalmológica (graus OD e OE, DP, adição, etc.). 1:1 com Prescription.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| prescriptionId | String | Não | FK único → Prescription |
| odSph/oeSph | Decimal(6,2) | Sim | Esférico OD/OE |
| odCyl/oeCyl | Decimal(6,2) | Sim | Cilíndrico OD/OE |
| odAxis/oeAxis | Int | Sim | Eixo OD/OE (0-180°) |
| odAdd/oeAdd | Decimal(6,2) | Sim | Adição OD/OE (para multifocal) |
| odPrism/oePrism | Decimal(6,2) | Sim | Prisma OD/OE |
| odBase/oeBase | String | Sim | Base do prisma |
| pdFar | Decimal(5,2) | Sim | Distância pupilar para longe |
| pdNear | Decimal(5,2) | Sim | Distância pupilar para perto |
| fittingHeightOd/Oe | Decimal(5,2) | Sim | Altura de montagem |
| pantoscopicAngle | Decimal(5,2) | Sim | Ângulo pantoscópico |
| vertexDistance | Decimal(5,2) | Sim | Distância vértice |
| frameCurvature | Decimal(5,2) | Sim | Curvatura da armação |

---

### TABELA: ServiceOrder

**Finalidade**: Ordem de Serviço (OS) — documento central do fluxo da óptica. Registra os óculos do cliente enviados ao laboratório para confecção. Tem ciclo de vida completo com histórico.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String | Não | cuid() | Identificador |
| number | Int | Não | 0 | Número sequencial por empresa |
| companyId/branchId | String | Não | — | Multi-tenant |
| customerId | String | Não | — | FK → Customer |
| prescriptionId | String | Sim | — | FK → Prescription |
| createdByUserId | String | Não | — | FK → User (quem criou) |
| status | ServiceOrderStatus | Não | DRAFT | DRAFT/APPROVED/SENT_TO_LAB/IN_PROGRESS/READY/DELIVERED/CANCELED |
| priority | ServiceOrderPriority | Não | NORMAL | URGENT/HIGH/NORMAL/LOW |
| promisedDate | DateTime | Sim | — | Prazo prometido ao cliente |
| labExpectedDate | DateTime | Sim | — | Prazo interno do laboratório |
| sentToLabAt | DateTime | Sim | — | Quando foi enviada ao lab |
| readyAt | DateTime | Sim | — | Quando ficou pronta |
| deliveredAt | DateTime | Sim | — | Quando foi entregue |
| canceledAt | DateTime | Sim | — | Quando foi cancelada |
| laboratoryId | String | Sim | — | FK → Lab |
| labOrderNumber | String | Sim | — | Número do pedido no lab |
| labNotes | String | Sim | — | Obs para o lab |
| isDelayed | Boolean | Não | false | Marcador de atraso |
| delayDays | Int | Sim | — | Dias de atraso |
| delayReason | String | Sim | — | Motivo do atraso |
| isWarranty | Boolean | Não | false | É OS de garantia (exibe `-G`) |
| isRework | Boolean | Não | false | É retrabalho (exibe `-R`) |
| warrantyReason/reworkReason | String | Sim | — | Motivo |
| originalOrderId | String | Sim | — | FK → ServiceOrder (OS original) |
| deliveredByUserId | String | Sim | — | FK → User (entregou) |
| deliveryNotes | String | Sim | — | Obs na entrega |
| qualityRating | Int | Sim | — | Nota de qualidade 1-5 |
| prescriptionData | Json | Sim | — | Snapshot da receita no momento |
| notes | String | Sim | — | Observações gerais |

**Índices**: `@@unique([companyId, number])`, índices em status, customerId, isDelayed, promisedDate, laboratoryId

---

### TABELA: ServiceOrderItem

**Finalidade**: Itens da OS (lentes, serviços, etc.). Guarda snapshot das medições.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| serviceOrderId | String | Não | FK → ServiceOrder |
| productId | String | Sim | FK → Product |
| labId | String | Sim | FK → Lab específico para este item |
| description | String | Sim | Descrição livre |
| qty | Int | Não | Quantidade |
| unitPrice/discount/lineTotal | Decimal(12,2) | Não | Precificação |
| costEstimated | Decimal(12,2) | Sim | Custo estimado do lab |
| measurementsSnapshot | Json | Sim | Medições no momento (altura, DP, etc.) |

---

### TABELA: ServiceOrderHistory

**Finalidade**: Histórico de mudanças de status da OS. Auditoria completa de toda a vida da OS.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| serviceOrderId | String | Não | FK → ServiceOrder (CASCADE delete) |
| action | String | Não | STATUS_CHANGED/REVERTED/EDITED/DELIVERED/CREATED/CANCELED |
| fromStatus/toStatus | ServiceOrderStatus | Sim | Transição de status |
| note | String | Sim | Observação |
| metadata | Json | Sim | Dados extras para auditoria |
| changedByUserId | String | Sim | FK → User |

---

### TABELA: QualityChecklist

**Finalidade**: Checklist de qualidade a ser preenchido antes de entregar os óculos ao cliente.

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| id | String | — | Identificador |
| serviceOrderId | String | — | FK único → ServiceOrder |
| lensGradeOk | Boolean | false | Grau da lente conferido |
| lensCenteringOk | Boolean | false | Centragem da lente OK |
| lensHeightOk | Boolean | false | Altura de montagem OK |
| treatmentsOk | Boolean | false | Tratamentos aplicados OK |
| frameAdjustmentOk | Boolean | false | Ajuste da armação OK |
| cleaningOk | Boolean | false | Limpeza realizada |
| notes | String | — | Obs |
| checkedByUserId | String | — | FK → User |
| checkedAt | DateTime | — | Quando foi conferido |
| customerApproved | Boolean | false | Cliente aprovou |

---

### TABELA: StockReservation

**Finalidade**: Reserva de estoque vinculada a uma OS ou venda. Impede vender o mesmo item duas vezes antes de consumir o estoque.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/branchId | String | Não | Multi-tenant |
| productId | String | Não | FK → Product |
| serviceOrderId | String | Sim | FK → ServiceOrder |
| saleId | String | Sim | FK → Sale |
| qty | Int | Não | Quantidade reservada |
| status | StockReservationStatus | Não | RESERVED/RELEASED/CONSUMED |
| releasedAt/consumedAt | DateTime | Sim | Datas de transição |

---

### TABELA: StockMovement

**Finalidade**: Registro de todas as movimentações de estoque (compras, vendas, ajustes, transferências). Histórico imutável.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| productId | String | Não | FK → Product |
| type | StockMovementType | Não | PURCHASE/SALE/CUSTOMER_RETURN/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT/etc. |
| quantity | Int | Não | Quantidade (positivo = entrada, negativo = saída) |
| supplierId | String | Sim | FK → Supplier (para compras) |
| invoiceNumber | String | Sim | Número da nota fiscal |
| sourceBranchId | String | Sim | FK → Branch (origem, para transferências) |
| targetBranchId | String | Sim | FK → Branch (destino, para transferências) |
| reason/notes | String | Sim | Motivo e observações |
| createdByUserId | String | Sim | FK → User |

---

### TABELA: Quote

**Finalidade**: Orçamento / proposta comercial. Tem ciclo de vida com follow-ups para CRM de vendas.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String | Não | cuid() | Identificador |
| companyId/branchId | String | Não | — | Multi-tenant |
| customerId | String | Sim | — | FK → Customer (pode ser sem cadastro) |
| sellerUserId | String | Não | — | FK → User (vendedor) |
| status | QuoteStatus | Não | PENDING | OPEN/SENT/APPROVED/CONVERTED/EXPIRED/CANCELED/PENDING/CANCELLED |
| validUntil | DateTime | Sim | — | Data de validade |
| subtotal/discountTotal/total | Decimal(12,2) | Não | 0 | Valores |
| discountPercent | Decimal(5,2) | Não | 0 | Desconto percentual |
| lastFollowUpAt | DateTime | Sim | — | Último follow-up |
| followUpCount | Int | Não | 0 | Quantidade de follow-ups |
| contactCount | Int | Não | 0 | Contatos realizados |
| convertedToSaleId | String | Sim | — | FK único → Sale (após conversão) |
| convertedToOsId | String | Sim | — | ID da OS gerada |
| conversionReason/lostReason | String | Sim | — | Motivo de conversão/perda |
| customerEmail/customerName/customerPhone | String | Sim | — | Dados do cliente sem cadastro |
| sentAt/sentVia | DateTime/String | Sim | — | Envio (WhatsApp, e-mail, etc.) |
| paymentConditions | String | Sim | — | Condições de pagamento |
| internalNotes/followUpNotes | String | Sim | — | Notas internas |

---

### TABELA: QuoteItem

**Finalidade**: Item de um orçamento (produto ou serviço).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| quoteId | String | Não | FK → Quote (CASCADE delete) |
| productId | String | Sim | FK → Product |
| description | String | Não | Descrição do item |
| qty | Int | Não | Quantidade |
| unitPrice/discount/total | Decimal(12,2) | Não | Precificação |
| itemType | QuoteItemType | Não | PRODUCT | PRODUCT/SERVICE/CUSTOM |
| notes | String | Sim | Observações |
| prescriptionData | Json | Sim | Dados de receita embutidos |

---

### TABELA: Sale

**Finalidade**: Venda realizada no PDV. Central do sistema financeiro e de estoque.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String | Não | cuid() | Identificador |
| companyId/branchId | String | Não | — | Multi-tenant |
| customerId | String | Sim | — | FK → Customer (pode ser anônimo) |
| serviceOrderId | String | Sim | — | FK único → ServiceOrder |
| sellerUserId | String | Não | — | FK → User (vendedor) |
| status | SaleStatus | Não | OPEN | OPEN/COMPLETED/CANCELED/REFUNDED |
| subtotal/discountTotal/total | Decimal(12,2) | Não | 0 | Valores |
| agreementId | String | Sim | — | FK → Agreement (convênio) |
| agreementDiscount | Decimal(12,2) | Sim | — | Desconto do convênio |
| authorizationCode | String | Sim | — | Código de autorização |
| fiscalStatus | FiscalStatus | Não | NOT_REQUESTED | Status fiscal (NF-e) |
| fiscalModel/fiscalKey/fiscalXmlUrl/fiscalPdfUrl | String | Sim | — | Dados da NF-e |
| completedAt | DateTime | Sim | — | Quando foi concluída |
| cashbackUsed | Decimal(10,2) | Não | 0 | Cashback utilizado |
| convertedFromQuoteId | String | Sim | — | FK único → Quote (origem) |

---

### TABELA: SaleItem

**Finalidade**: Item de uma venda. Registra preço, desconto e consumo de estoque.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| saleId | String | Não | FK → Sale |
| productId | String | Sim | FK → Product |
| description | String | Sim | Descrição livre |
| qty | Int | Não | Quantidade |
| unitPrice/discount/lineTotal | Decimal(12,2) | Não | Precificação |
| costPrice | Decimal(12,2) | Não | Custo (snapshot) |
| stockControlled | Boolean | Não | true | Controlado por estoque |
| stockQtyConsumed | Int | Não | 0 | Quanto de estoque foi baixado |

---

### TABELA: SalePayment

**Finalidade**: Pagamento(s) de uma venda. Uma venda pode ter múltiplos pagamentos (ex: 50% PIX + 50% cartão).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| saleId | String | Não | FK → Sale |
| method | PaymentMethod | Não | CASH/PIX/DEBIT_CARD/CREDIT_CARD/BOLETO/STORE_CREDIT/CHEQUE/AGREEMENT/OTHER |
| status | PaymentStatus | Não | PENDING/RECEIVED/VOIDED/REFUNDED |
| amount | Decimal(12,2) | Não | Valor do pagamento |
| installments | Int | Sim | Número de parcelas (crédito) |
| cardBrand | String | Sim | Bandeira do cartão |
| reference | String | Sim | Referência externa (ex: NSU) |
| details | Json | Sim | Dados adicionais |
| receivedAt | DateTime | Sim | Quando foi recebido |
| receivedByUserId | String | Sim | FK → User |

---

### TABELA: CommissionRule

**Finalidade**: Regras de comissão por vendedor, categoria ou marca.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| name | String | Não | Nome da regra |
| userId | String | Sim | FK → User (específico para um vendedor) |
| categoryId | String | Sim | FK → Category |
| brandId | String | Sim | FK → Brand |
| percentage | Decimal(5,2) | Não | % de comissão |
| minMarginPercent | Decimal(5,2) | Sim | Margem mínima para aplicar |
| priority | Int | Não | 0 | Prioridade (maior = preferência) |
| active | Boolean | Não | true | — |

---

### TABELA: Commission

**Finalidade**: Comissão gerada por venda para um vendedor. Controla status de aprovação e pagamento.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/saleId/userId | String | Não | FKs |
| baseAmount | Decimal(12,2) | Não | Base de cálculo |
| percentage | Decimal(5,2) | Não | % aplicada |
| commissionAmount | Decimal(12,2) | Não | Valor da comissão |
| status | CommissionStatus | Não | PENDING/APPROVED/PAID/CANCELED |
| periodMonth/periodYear | Int | Não | Período de competência |
| approvedAt/paidAt | DateTime | Sim | Datas de aprovação e pagamento |

---

### TABELA: CashShift

**Finalidade**: Turno de caixa. Representa a abertura e fechamento de um caixa em uma filial.

| Campo | Tipo | Null? | Default | Descrição |
|-------|------|-------|---------|-----------|
| id | String | Não | cuid() | Identificador |
| companyId/branchId | String | Não | — | Multi-tenant |
| status | CashShiftStatus | Não | OPEN | OPEN/CLOSED |
| openedByUserId | String | Não | — | FK → User |
| openedAt | DateTime | Não | now() | Abertura |
| openingFloatAmount | Decimal(12,2) | Não | 0 | Troco inicial |
| closedByUserId | String | Sim | — | FK → User |
| closedAt | DateTime | Sim | — | Fechamento |
| closingDeclaredCash | Decimal(12,2) | Sim | — | Dinheiro contado no fechamento |
| closingExpectedCash | Decimal(12,2) | Sim | — | Dinheiro esperado pelo sistema |
| differenceCash | Decimal(12,2) | Sim | — | Diferença (sobra/falta) |
| differenceJustification | String | Sim | — | Justificativa da diferença |

---

### TABELA: CashMovement

**Finalidade**: Movimento financeiro dentro de um turno de caixa (recebimento de venda, sangria, suprimento, etc.).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| cashShiftId | String | Não | FK → CashShift |
| branchId | String | Não | FK → Branch |
| type | CashMovementType | Não | SALE_PAYMENT/REFUND/SUPPLY/WITHDRAWAL/ADJUSTMENT/OPENING_FLOAT/CLOSING |
| direction | CashDirection | Não | IN (entrada) / OUT (saída) |
| method | PaymentMethod | Não | Forma de pagamento |
| amount | Decimal(12,2) | Não | Valor |
| originType/originId | String | Não | Tipo e ID da origem (ex: Sale, Manual) |
| salePaymentId | String | Sim | FK → SalePayment |
| note | String | Sim | Observação |
| migrated | Boolean | Não | false | Flag de migração de dados legados |

---

### TABELA: Warranty

**Finalidade**: Garantia de produto (armação, lente, montagem, ajuste). Pode ser vinculada a venda ou OS.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| saleId/saleItemId | String | Sim | FK → Sale/SaleItem |
| serviceOrderId/serviceOrderItemId | String | Sim | FK → ServiceOrder/ServiceOrderItem |
| warrantyType | WarrantyType | Não | FRAME/LENS/MOUNTING/ADJUSTMENT |
| status | WarrantyStatus | Não | ACTIVE/IN_ANALYSIS/APPROVED/DENIED/EXPIRED/USED |
| startAt/expiresAt | DateTime | Não | Início e fim da garantia |
| termsDescription | String | Sim | Termos da garantia |

---

### TABELA: WarrantyClaim

**Finalidade**: Acionamento de garantia pelo cliente — registra a reclamação, análise e resolução.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| warrantyId | String | Não | FK → Warranty |
| openedAt | DateTime | Não | now() | Data de abertura |
| reason | String | Não | Motivo do acionamento |
| problemDescription | String | Sim | Descrição do problema |
| resolution | String | Sim | Como foi resolvido |
| resolutionType | String | Sim | Tipo de resolução (troca, reparo, etc.) |
| filesUrl | String[] | — | Fotos/documentos anexados |
| analyzedByUserId | String | Sim | FK → User |

---

### TABELA: Appointment

**Finalidade**: Agendamento de consulta, retirada de óculos, ajuste ou retorno.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/branchId | String | Não | Multi-tenant |
| customerId | String | Sim | FK → Customer |
| type | AppointmentType | Não | PICKUP/ADJUSTMENT/CONSULTATION/RETURN/EXAM |
| status | AppointmentStatus | Não | SCHEDULED/CONFIRMED/IN_PROGRESS/COMPLETED/NO_SHOW/CANCELED |
| scheduledAt | DateTime | Não | Data/hora do agendamento |
| durationMinutes | Int | Não | 30 | Duração em minutos |
| serviceOrderId | String | Sim | OS vinculada |
| confirmed/confirmedAt | Boolean/DateTime | — | Confirmação pelo cliente |
| reminderSent | Boolean | false | Se lembrete foi enviado |
| checkinAt/checkoutAt | DateTime | Sim | Check-in e check-out na loja |

---

### TABELA: Agreement

**Finalidade**: Convênio/plano de saúde ou parceria corporativa. Permite desconto e cobrança faturada.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| code | String | Não | Código (único por empresa) |
| name | String | Não | Nome do convênio |
| type | AgreementType | Não | HEALTH_PLAN/CORPORATE/UNION/ASSOCIATION/PARTNERSHIP |
| discountPercent | Decimal(5,2) | Não | 0 | Desconto padrão |
| paymentTermDays | Int | Não | 30 | Prazo de pagamento |
| billingDay | Int | Sim | — | Dia de faturamento |
| minPurchase/maxPurchase/monthlyLimit | Decimal(12,2) | Sim | — | Limites |
| contractStartDate/contractEndDate | DateTime | Sim | — | Vigência do contrato |

---

### TABELA: AgreementBeneficiary

**Finalidade**: Beneficiário de um convênio — vincula cliente ao convênio.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| agreementId/customerId | String | Não | FKs |
| enrollmentNumber | String | Sim | Número de matrícula/carteirinha |
| isHolder | Boolean | true | Titular ou dependente |
| holderId | String | Sim | ID do titular (se dependente) |
| enrolledAt | DateTime | now() | Data de cadastro |
| validUntil | DateTime | Sim | Validade |

---

### TABELA: LoyaltyProgram

**Finalidade**: Programa de fidelidade (pontos). Uma empresa tem no máximo um programa.

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| id | String | — | Identificador |
| companyId | String | — | FK único → Company |
| name | String | — | Nome do programa |
| pointsPerReal | Decimal(5,2) | 1 | Pontos por R$1 gasto |
| reaisPerPoint | Decimal(5,2) | 10 | R$ por ponto no resgate |
| pointsExpire | Boolean | true | Se pontos expiram |
| expirationDays | Int | 365 | Dias para expiração |
| minRedemption | Int | 100 | Mínimo de pontos para resgate |
| birthdayMultiplier | Decimal(3,2) | 2 | Multiplicador no aniversário |

---

### TABELA: AccountPayable

**Finalidade**: Conta a pagar (despesa da empresa). Pode ser vinculada a fornecedor.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/branchId | String | Não/Sim | Multi-tenant |
| supplierId | String | Sim | FK → Supplier |
| description | String | Não | Descrição da despesa |
| category | AccountCategory | Não | SUPPLIERS/RENT/UTILITIES/PERSONNEL/TAXES/MARKETING/MAINTENANCE/EQUIPMENT/OTHER |
| amount | Decimal(12,2) | Não | Valor |
| dueDate | DateTime | Não | Data de vencimento |
| paidDate/paidAmount | DateTime/Decimal | Sim | — | Data e valor do pagamento |
| status | AccountPayableStatus | Não | PENDING/PAID/OVERDUE/CANCELED |
| invoiceNumber | String | Sim | Número da NF/boleto |

---

### TABELA: AccountReceivable

**Finalidade**: Conta a receber (parcela de crediário ou venda parcelada).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/branchId | String | Não/Sim | Multi-tenant |
| customerId | String | Sim | FK → Customer |
| saleId | String | Sim | FK → Sale |
| description | String | Não | Descrição |
| installmentNumber/totalInstallments | Int | Não | 1/1 | Parcela X de Y |
| amount | Decimal(12,2) | Não | Valor da parcela |
| dueDate | DateTime | Não | Vencimento |
| receivedDate/receivedAmount | DateTime/Decimal | Sim | — | Recebimento |
| status | AccountReceivableStatus | Não | PENDING/RECEIVED/OVERDUE/CANCELED |

---

### TABELA: StockAdjustment

**Finalidade**: Ajuste de estoque com workflow de aprovação. Registra antes/depois e motivo.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId/productId | String | Não | FKs |
| type | StockAdjustmentType | Não | DAMAGE/THEFT/SUPPLIER_RETURN/COUNT_ERROR/FREE_SAMPLE/EXPIRATION/INTERNAL_USE/OTHER |
| status | StockAdjustmentStatus | Não | PENDING/APPROVED/REJECTED/AUTO_APPROVED |
| quantityBefore/quantityChange/quantityAfter | Int | Não | Estoque antes, variação e depois |
| unitCost/totalValue | Decimal(12,2) | Não | Custo unitário e total |
| reason | String | Não | Motivo do ajuste |
| attachments | String[] | — | Evidências (fotos, documentos) |
| approvedByUserId | String | Sim | FK → User (aprovador) |

---

### TABELA: SystemRule

**Finalidade**: Regras e configurações do sistema em formato chave-valor por empresa. Ex: meta de vendas, prazo máximo de OS.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK → Company |
| category | RuleCategory | Não | STOCK/SALES/FINANCIAL/PRODUCTS/CUSTOMERS/REPORTS |
| key | String | Não | Chave (único por empresa) |
| value | Json | Não | Valor (pode ser número, string, booleano) |
| description | String | Sim | Descrição da regra |
| active | Boolean | Não | true | — |

---

### TABELA: ProductBarcode

**Finalidade**: Múltiplos códigos de barras por produto (EAN13, CODE128, QR Code). Um produto pode ter vários códigos.

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| productId | String | Não | FK → Product (CASCADE delete) |
| type | BarcodeType | Não | EAN13/CODE128/QRCODE |
| code | String | Não | Valor do código (único por produto) |
| isPrimary | Boolean | Não | false | Se é o código principal |
| createdByUserId | String | Sim | FK → User |

---

### TABELAS: Permission, RolePermission, UserPermission

**Finalidade**: Sistema granular de permissões. Cada `Permission` tem um `code` único por módulo. `RolePermission` define padrões por role. `UserPermission` sobrescreve individualmente.

**Permission**:
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id/code | String | ID e código único (ex: `sales.create`) |
| name/description | String | Nome e descrição |
| module/category | String | Módulo (ex: `sales`) e categoria |
| sortOrder | Int | Ordenação |
| isActive | Boolean | Se está ativa |

**RolePermission**: `role` (String) + `permissionId` + `granted` (Boolean)
**UserPermission**: `userId` + `permissionId` + `granted` (Boolean) + `grantedByUserId`

---

### TABELA: CompanySettings

**Finalidade**: Configurações visuais e de texto da empresa (logo, cores, mensagens de WhatsApp, textos de PDF).

| Campo | Tipo | Null? | Descrição |
|-------|------|-------|-----------|
| id | String | Não | Identificador |
| companyId | String | Não | FK único → Company |
| displayName/cnpj/phone/whatsapp/email | String | Sim | Dados de exibição |
| address/city/state/zipCode | String | Sim | Endereço de exibição |
| logoUrl | String | Sim | URL do logo |
| messageThankYou/messageQuote/messageReminder/messageBirthday | String | Sim | Mensagens WhatsApp |
| pdfHeaderText/pdfFooterText | String | Sim | Cabeçalho e rodapé dos PDFs |
| defaultQuoteValidDays | Int | 15 | Validade padrão de orçamentos |
| defaultPaymentTerms | String | Sim | Condições padrão de pagamento |
| primaryColor | String | Sim | Cor principal do sistema |

---

### TABELA: CashbackConfig

**Finalidade**: Configuração do programa de cashback por filial.

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| branchId | String | — | FK único → Branch |
| enabled | Boolean | false | Se cashback está ativo |
| earnPercent | Decimal(5,2) | 3 | % de cashback por compra |
| minPurchaseToEarn | Decimal(10,2) | 100 | Compra mínima para ganhar |
| maxCashbackPerSale | Decimal(10,2) | — | Limite de cashback por venda |
| expirationDays | Int | 90 | Dias para expiração |
| maxUsagePercent | Decimal(5,2) | 50 | Máximo % de cashback por compra |
| birthdayMultiplier | Decimal(3,1) | 2 | Multiplicador no aniversário |

---

### TABELA: CustomerCashback

**Finalidade**: Saldo de cashback do cliente por filial. Mantém totais de ganho, uso e expiração.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| customerId/branchId | String | FKs (@@unique) |
| balance | Decimal(10,2) | Saldo atual disponível |
| totalEarned/totalUsed/totalExpired | Decimal(10,2) | Totalizadores históricos |

---

### TABELA: CashbackMovement

**Finalidade**: Movimento de cashback (crédito por compra, débito por uso, expiração).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| customerCashbackId | String | FK → CustomerCashback |
| type | CashbackMovementType | CREDIT/DEBIT/EXPIRED/ADJUSTMENT/BONUS |
| amount | Decimal(10,2) | Valor do movimento |
| saleId | String? | FK → Sale |
| expiresAt | DateTime? | Data de expiração (para CREDITs) |
| expired | Boolean | Se já expirou |

---

### TABELA: SalesGoal

**Finalidade**: Meta de vendas mensal por filial. Contém metas individuais por vendedor.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| branchId/year/month | String/Int/Int | Composto único |
| branchGoal | Decimal(12,2) | Meta total da filial |
| status | GoalStatus | ACTIVE/CLOSED/CANCELLED |

---

### TABELA: SellerGoal

**Finalidade**: Meta individual de um vendedor dentro de uma SalesGoal de filial.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| salesGoalId/userId | String | FKs (@@unique) |
| goalAmount | Decimal(12,2) | Meta do vendedor |

---

### TABELA: CommissionConfig

**Finalidade**: Configuração de comissão por filial.

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| branchId | String | — | FK único → Branch |
| baseCommissionPercent | Decimal(5,2) | 5 | % base de comissão |
| goalBonusPercent | Decimal(5,2) | 2 | Bônus por atingir meta |
| categoryCommissions | Json? | — | Comissões por categoria |

---

### TABELA: SellerCommission

**Finalidade**: Comissão consolidada mensal de um vendedor (calculado automaticamente).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| userId/branchId/year/month | — | Composto único |
| totalSales | Decimal(12,2) | Total de vendas no período |
| goalAmount | Decimal(12,2)? | Meta do período |
| goalAchieved | Boolean | Se atingiu a meta |
| baseCommission/bonusCommission/totalCommission | Decimal(10,2) | Valores calculados |
| status | CommissionStatus | PENDING/APPROVED/PAID/CANCELED |

---

### TABELA: DREReport

**Finalidade**: Demonstrativo de Resultado do Exercício (DRE) mensal. Relatório financeiro consolidado.

Campos: receita bruta, devoluções, descontos, receita líquida, CMV, custos de lab, lucro bruto, despesas (pessoal, aluguel, admin, marketing, financeiro, comissão, outros), lucro operacional, impostos, lucro líquido, margens percentuais.

---

### TABELA: ReminderConfig / CustomerContact / Reminder

**Finalidade**: Configuração de lembretes automáticos (receitas vencendo, aniversário, cliente inativo, cashback expirando). `CustomerContact` registra contatos realizados. `Reminder` é a tarefa de contatar.

---

## 4. DIAGRAMA DE RELACIONAMENTOS (ERD)

```
                              ┌─────────────────┐
                              │    COMPANY      │
                              └────────┬────────┘
                                       │ 1:N para todos os modelos principais
        ┌──────────┬──────────┬────────┼────────┬──────────┬──────────┐
        │          │          │        │        │          │          │
   ┌────▼───┐ ┌────▼───┐ ┌───▼────┐ ┌─▼──────┐ ┌──▼─────┐ ┌──▼──────┐
   │ Branch │ │  User  │ │Customer│ │Product │ │  Lab   │ │Supplier │
   └────┬───┘ └────┬───┘ └───┬────┘ └─┬──────┘ └──┬─────┘ └──┬──────┘
        │          │         │         │            │          │
        │ N:N      │ N:N     │         │ 1:N        │ 1:N      │ 1:N
   ┌────▼────┐     │    ┌────▼──────┐  │        ┌──▼─────┐ ┌──▼──────┐
   │UserBranch│    │    │ Prescription│ │        │LabPrice│ │AccountP │
   └─────────┘     │    └────┬──────┘  │        │ Range  │ │ ayable  │
                   │         │         │        └────────┘ └─────────┘
                   │    ┌────▼──────┐  │
                   │    │Prescription│  │
                   │    │  Values   │  │
                   │    └───────────┘  │
                   │                   │
            ┌──────▼───────────────────▼──────┐
            │         ServiceOrder             │
            │  (OS: DRAFT→SENT_TO_LAB→READY   │
            │   →DELIVERED / -G -R suffix)     │
            └──┬───────┬──────────┬───────────┘
               │ 1:N   │ 1:1      │ 1:N
        ┌──────▼─┐ ┌───▼──────┐ ┌─▼──────────┐
        │SOItem  │ │Quality   │ │SOHistory   │
        └────────┘ │Checklist │ └────────────┘
                   └──────────┘
                        │
                 ┌──────▼──────────────────┐
                 │          Sale            │
                 │ (Venda — PDV principal)  │
                 └──┬────────┬─────────────┘
                    │ 1:N    │ 1:N
             ┌──────▼─┐  ┌───▼──────────┐
             │SaleItem│  │ SalePayment  │
             └────────┘  └──────┬───────┘
                                │ 1:N
                         ┌──────▼───────┐
                         │CashMovement  │
                         │              │
                         └──────┬───────┘
                                │ N:1
                         ┌──────▼───────┐
                         │  CashShift   │
                         └──────────────┘

Sale ──1:N──► AccountReceivable (parcelas crediário)
Sale ──1:N──► CashbackMovement (cashback ganho)
Sale ──1:N──► Commission (comissão do vendedor)
Quote ──1:1──► Sale (conversão de orçamento)

Customer ──1:N──► CustomerCashback ──1:N──► CashbackMovement
Customer ──1:N──► Reminder ──1:N──► CustomerContact
Customer ──1:N──► Appointment
Customer ──1:N──► AgreementBeneficiary ──N:1──► Agreement

Product ──1:1──► FrameDetail / ContactLensDetail / AccessoryDetail
Product ──1:N──► ProductBarcode
Product ──1:N──► StockMovement
Product ──1:N──► StockAdjustment

User ──N:N──► Permission (via UserPermission)
UserRole ──N:N──► Permission (via RolePermission)

SalesGoal ──1:N──► SellerGoal
Branch ──1:1──► CashbackConfig
Branch ──1:1──► CommissionConfig
Branch ──1:1──► ReminderConfig
```

### Cardinalidades Completas

| Entidade A | Cardinalidade | Entidade B |
|-----------|:------------:|-----------|
| Company | 1:N | Branch, User, Customer, Product, Sale, ServiceOrder, etc. |
| Branch | N:N | User (via UserBranch) |
| Customer | 1:N | Prescription, Sale, ServiceOrder, Quote, Reminder, Appointment |
| Customer | 1:N | CustomerCashback (por filial) |
| Customer | 1:N | AgreementBeneficiary |
| Doctor | 1:N | Prescription |
| Prescription | 1:1 | PrescriptionValues |
| Product | 1:1 | FrameDetail / ContactLensDetail / AccessoryDetail / ServiceDetail / LensServiceDetail |
| Product | 1:N | ProductBarcode, SaleItem, ServiceOrderItem, StockMovement, StockAdjustment |
| Lab | 1:N | ServiceOrder, ServiceOrderItem, LabPriceRange, LensServiceDetail |
| Supplier | 1:N | Product, AccountPayable, StockMovement |
| Category | 1:N | Product (hierarquia própria com parentId) |
| Sale | 1:N | SaleItem, SalePayment, AccountReceivable, CashbackMovement, Commission |
| Sale | 1:1 | ServiceOrder (opcional) |
| Quote | 1:1 | Sale (conversão) |
| Quote | 1:N | QuoteItem |
| ServiceOrder | 1:N | ServiceOrderItem, ServiceOrderHistory, StockReservation |
| ServiceOrder | 1:1 | QualityChecklist |
| ServiceOrder | N:1 | ServiceOrder (originalOrderId, para retrabalho/garantia) |
| SalePayment | 1:N | CashMovement |
| CashShift | 1:N | CashMovement |
| Warranty | 1:N | WarrantyClaim |
| SalesGoal | 1:N | SellerGoal |
| Agreement | 1:N | AgreementBeneficiary, Sale |
| LoyaltyProgram | 1:N | LoyaltyTier |
| CustomerCashback | 1:N | CashbackMovement |
| Reminder | 1:N | CustomerContact |

---

## 5. CATÁLOGO DE FUNCIONALIDADES

### 5.1 Páginas do Sistema

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | page.tsx | Redirect para login ou dashboard |
| `/login` | page.tsx | Autenticação |
| `/dashboard` | page.tsx | Dashboard principal com métricas |
| `/dashboard/pdv` | page.tsx | Ponto de Venda |
| `/dashboard/vendas` | page.tsx | Histórico de vendas |
| `/dashboard/vendas/[id]/detalhes` | page.tsx | Detalhes da venda |
| `/dashboard/vendas/[id]/imprimir` | page.tsx | Impressão/PDF da venda |
| `/dashboard/clientes` | page.tsx | Lista de clientes |
| `/dashboard/clientes/novo` | page.tsx | Cadastro de cliente |
| `/dashboard/clientes/[id]` | page.tsx | Detalhes do cliente (histórico, receitas) |
| `/dashboard/clientes/[id]/editar` | page.tsx | Edição do cliente |
| `/dashboard/produtos` | page.tsx | Catálogo de produtos |
| `/dashboard/produtos/novo` | page.tsx | Cadastro de produto |
| `/dashboard/produtos/[id]/editar` | page.tsx | Edição de produto |
| `/dashboard/estoque` | page.tsx | Controle de estoque |
| `/dashboard/estoque/ajustes` | page.tsx | Ajustes de estoque |
| `/dashboard/ordens-servico` | page.tsx | Lista de OS |
| `/dashboard/ordens-servico/nova` | page.tsx | Nova OS |
| `/dashboard/ordens-servico/[id]/detalhes` | page.tsx | Detalhes da OS |
| `/dashboard/ordens-servico/[id]/editar` | page.tsx | Edição da OS |
| `/dashboard/ordens-servico/[id]/imprimir` | page.tsx | Impressão da OS |
| `/dashboard/orcamentos` | page.tsx | CRM de orçamentos |
| `/dashboard/orcamentos/novo` | page.tsx | Novo orçamento |
| `/dashboard/orcamentos/[id]` | page.tsx | Detalhes do orçamento |
| `/dashboard/orcamentos/[id]/editar` | page.tsx | Edição |
| `/dashboard/orcamentos/[id]/imprimir` | page.tsx | Impressão |
| `/dashboard/financeiro` | page.tsx | Contas a pagar/receber |
| `/dashboard/caixa` | page.tsx | Turno de caixa atual |
| `/dashboard/caixa/historico` | page.tsx | Histórico de caixas |
| `/dashboard/caixa/[id]/relatorio` | page.tsx | Relatório de fechamento |
| `/dashboard/cashback` | page.tsx | Gestão de cashback |
| `/dashboard/metas` | page.tsx | Metas e comissões |
| `/dashboard/laboratorios` | page.tsx | Gestão de laboratórios |
| `/dashboard/fornecedores` | page.tsx | Fornecedores |
| `/dashboard/tratamentos` | page.tsx | Tratamentos de lentes |
| `/dashboard/funcionarios` | page.tsx | Usuários/funcionários |
| `/dashboard/funcionarios/[id]/permissoes` | page.tsx | Permissões individuais |
| `/dashboard/lembretes` | page.tsx | CRM de lembretes |
| `/dashboard/relatorios` | page.tsx | Hub de relatórios |
| `/dashboard/relatorios/vendas` | page.tsx | Relatório de vendas |
| `/dashboard/relatorios/produtos-vendidos` | page.tsx | Produtos mais vendidos |
| `/dashboard/relatorios/posicao-estoque` | page.tsx | Posição de estoque |
| `/dashboard/relatorios/produtos-sem-giro` | page.tsx | Produtos sem movimento |
| `/dashboard/relatorios/contas-receber` | page.tsx | Contas a receber |
| `/dashboard/relatorios/contas-pagar` | page.tsx | Contas a pagar |
| `/dashboard/relatorios/historico-caixas` | page.tsx | Histórico de caixas |
| `/dashboard/relatorios/dre` | page.tsx | DRE mensal |
| `/dashboard/relatorios/comissoes` | page.tsx | Relatório de comissões |
| `/dashboard/configuracoes` | page.tsx | Hub de configurações |
| `/dashboard/configuracoes/empresa` | page.tsx | Dados da empresa |
| `/dashboard/configuracoes/aparencia` | page.tsx | Tema e cores |
| `/dashboard/configuracoes/permissoes` | page.tsx | Permissões por role |
| `/dashboard/configuracoes/cashback` | page.tsx | Config de cashback |
| `/dashboard/configuracoes/comissoes` | page.tsx | Config de comissões |
| `/dashboard/configuracoes/regras` | page.tsx | Regras do sistema |
| `/dashboard/configuracoes/lembretes` | page.tsx | Config de lembretes |

### 5.2 Endpoints da API (agrupados)

**Autenticação**
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/[...nextauth] | NextAuth handlers |
| POST | /api/auth/clear-session | Limpa sessão |

**Clientes**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/customers | Listar/criar clientes |
| GET/PUT/DELETE | /api/customers/[id] | CRUD individual |
| GET | /api/customers/[id]/receivables | Parcelas do cliente |
| GET | /api/customers/filters | Filtros disponíveis |
| GET | /api/customers/export | Exportar XLSX |
| POST | /api/customers/import | Importar XLSX |
| GET | /api/customers/template | Template de importação |

**Produtos**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/products | Listar/criar produtos |
| GET/PUT/DELETE | /api/products/[id] | CRUD individual |
| GET/POST | /api/products/[id]/barcodes | Códigos de barras |
| DELETE | /api/products/[id]/barcodes/[barcodeId] | Remove barcode |
| POST | /api/products/[id]/barcodes/generate-all | Gera todos barcodes |
| GET | /api/products/search-by-barcode | Busca por barcode |
| GET | /api/products/export | Exportar XLSX |
| POST | /api/products/import | Importar XLSX |
| GET | /api/products/print | Impressão de etiquetas |

**Estoque**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/stock-movements | Movimentações |
| POST | /api/stock-movements/transfer | Transferência entre filiais |
| GET/POST | /api/stock-adjustments | Ajustes de estoque |
| GET/PUT | /api/stock-adjustments/[id] | Detalhes do ajuste |
| POST | /api/stock-adjustments/[id]/approve | Aprovar ajuste |
| POST | /api/stock-adjustments/[id]/reject | Rejeitar ajuste |

**Vendas**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/sales | Listar/criar vendas |
| GET/PUT | /api/sales/[id] | Detalhes/atualizar |
| GET | /api/sales/[id]/pdf | PDF da venda |
| GET | /api/sales/[id]/carne | PDF do carnê |
| POST | /api/sales/[id]/cashback | Aplicar cashback |
| PUT | /api/sales/[id]/seller | Atualizar vendedor |
| POST | /api/sales/[id]/reactivate | Reativar venda cancelada |

**Ordens de Serviço**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/service-orders | Listar/criar OS |
| GET/PUT | /api/service-orders/[id] | Detalhes/atualizar |
| PUT | /api/service-orders/[id]/status | Mudar status |
| POST | /api/service-orders/[id]/deliver | Entregar OS |
| POST | /api/service-orders/[id]/revert | Reverter status |
| POST | /api/service-orders/[id]/warranty | Criar OS de garantia |

**Orçamentos**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/quotes | Listar/criar |
| GET/PUT | /api/quotes/[id] | Detalhes/atualizar |
| POST | /api/quotes/[id]/convert | Converter em venda/OS |
| POST | /api/quotes/[id]/cancel | Cancelar |
| PUT | /api/quotes/[id]/status | Mudar status |
| POST | /api/quotes/[id]/mark-sent | Marcar como enviado |
| POST | /api/quotes/[id]/follow-up | Registrar follow-up |
| GET | /api/quotes/[id]/follow-ups | Listar follow-ups |
| GET | /api/quotes/stats | Estatísticas de conversão |

**Financeiro**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/accounts-payable | Contas a pagar |
| GET/POST | /api/accounts-receivable | Contas a receber |
| PUT | /api/accounts-receivable/[id] | Atualizar parcela |
| GET | /api/accounts-receivable/[id]/receipt | Recibo de parcela |
| POST | /api/accounts-receivable/receive-multiple | Baixar múltiplas |

**Caixa**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/cash/shift | Turno atual / abrir |
| GET | /api/cash/shift/[id] | Detalhes do turno |
| POST | /api/cash/shift/close | Fechar caixa |
| GET | /api/cash/movements | Movimentos do caixa |
| GET/POST | /api/cash-registers | Caixas (compatibilidade) |
| GET | /api/cash-registers/[id]/transactions | Transações |

**Cashback**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/cashback/balance/[customerId] | Saldo do cliente |
| GET | /api/cashback/customer/[customerId] | Histórico |
| GET/PUT | /api/cashback/config | Config do cashback |
| GET | /api/cashback/customers | Clientes com cashback |
| GET | /api/cashback/expiring | Cashback expirando |
| GET | /api/cashback/summary | Resumo geral |
| POST | /api/cashback/validate | Validar uso |

**Dashboard**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/dashboard/metrics | Métricas do dashboard |
| GET | /api/dashboard/payment-distribution | Distribuição de pagamentos |
| GET | /api/dashboard/sales-last-7-days | Vendas dos últimos 7 dias |
| GET | /api/dashboard/top-products | Top produtos |

**Laboratórios**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/laboratories | Listar/criar labs |
| GET/PUT/DELETE | /api/laboratories/[id] | CRUD individual |
| GET | /api/laboratories/[id]/service-orders | OS do laboratório |

**Metas e Comissões**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | /api/goals | Metas |
| GET/PUT | /api/goals/config | Config de metas |
| GET | /api/goals/dashboard | Dashboard de metas |
| GET | /api/goals/sellers | Metas por vendedor |
| GET | /api/goals/sellers-ranking | Ranking de vendedores |
| GET | /api/goals/monthly-summary | Resumo mensal |
| GET/POST | /api/goals/commissions | Comissões |

**Relatórios** (15+ endpoints em `/api/reports/`)

---

## 6. FLUXOS DE NEGÓCIO END-TO-END

### A) Cadastro de Cliente

```
1. Usuário acessa /dashboard/clientes/novo
2. Preenche formulário (nome obrigatório; CPF, phone opcionais)
3. Frontend valida com Zod (customer.schema.ts)
4. POST /api/customers
5. requireAuth() → getCompanyId()
6. customer.service.ts verifica CPF único por companyId
7. prisma.customer.create({ data: { ...dados, companyId } })
8. Retorna customer criado (201)
9. Frontend redireciona para lista de clientes

Tabelas afetadas: Customer
Campos críticos: companyId (obrigatório), cpf (único por empresa)
```

---

### B) Cadastro de Produto

```
1. Usuário acessa /dashboard/produtos/novo
2. Seleciona tipo (FRAME, CONTACT_LENS, ACCESSORY, etc.)
3. Preenche dados básicos (nome, SKU, preços, estoque mínimo)
4. Preenche dados específicos do tipo (para FRAME: medidas em mm)
5. POST /api/products
6. product.service.ts valida SKU único por companyId
7. prisma.product.create() + cria detalhe específico no mesmo transaction
8. StockMovement criado automaticamente (PURCHASE, qty inicial)

Tabelas afetadas: Product, FrameDetail/ContactLensDetail/etc., StockMovement
```

---

### C) Entrada de Estoque

```
1. Usuário acessa /dashboard/estoque
2. Clica em "Nova Entrada" ou "Ajuste"
3. Para ENTRADA (compra de fornecedor):
   - POST /api/stock-movements com type=PURCHASE
   - product.stockQty += quantity (em transaction)
   - StockMovement criado com supplierId

4. Para AJUSTE:
   - POST /api/stock-adjustments
   - Status inicial: PENDING
   - Se ADMIN/GERENTE: AUTO_APPROVED
   - Else: aguarda aprovação

5. Aprovação: POST /api/stock-adjustments/[id]/approve
   - product.stockQty += quantityChange
   - status = APPROVED

Tabelas afetadas: StockMovement, StockAdjustment, Product (stockQty)
```

---

### D) Venda Completa no PDV

```
1. Usuário acessa /dashboard/pdv
2. Busca cliente pelo nome/CPF/telefone (ou prossegue sem cadastro)
3. Adiciona produtos ao carrinho (busca por nome, SKU ou barcode)
4. Aplica desconto (se autorizado pela regra de negócio)
5. Verifica/aplica cashback disponível do cliente
6. Escolhe forma(s) de pagamento:
   - CASH: pagamento imediato
   - PIX: aguarda confirmação
   - CREDIT_CARD: define parcelas
   - BOLETO/CREDIÁRIO: gera AccountReceivable
   - AGREEMENT: vincula ao convênio
7. Finaliza venda → POST /api/sales
   sale.service.ts em $transaction:
   a) prisma.sale.create()
   b) Para cada item: prisma.saleItem.create() + baixa stockQty
   c) prisma.salePayment.create() para cada forma de pagamento
   d) Se parcelado: prisma.accountReceivable.createMany()
   e) Se cashback usado: prisma.cashbackMovement.create() (DEBIT)
   f) Se cashback ganho: prisma.cashbackMovement.create() (CREDIT)
   g) prisma.commission.create() para o vendedor
   h) prisma.cashMovement.create() vinculado ao CashShift aberto
8. Retorna venda criada
9. Frontend exibe recibo, opção de impressão/PDF

Tabelas afetadas: Sale, SaleItem, SalePayment, AccountReceivable,
                  CashbackMovement, CustomerCashback, Commission,
                  CashMovement, Product (stockQty), StockMovement
```

---

### E) Venda com Receita/Prescrição

```
1. No PDV, após selecionar cliente, clicar em "Usar Receita"
2. Sistema busca receitas válidas do cliente
3. Se não há receita: opção de cadastrar nova receita
   POST /api/prescriptions com PrescriptionValues (graus OD/OE, DP, adição)
4. Receita vinculada à venda/OS (prescriptionId)
5. prescriptionData: Json é salvo como snapshot na OS no momento da criação

Tabelas afetadas: Prescription, PrescriptionValues, ServiceOrder (prescriptionData)
```

---

### F) Pagamento Múltiplo

```
1. No PDV, valor total: R$ 500,00
2. Usuário define: R$ 200,00 PIX + R$ 300,00 crédito 3x
3. POST /api/sales com payments array:
   [
     { method: "PIX", amount: 200, status: "RECEIVED" },
     { method: "CREDIT_CARD", amount: 300, installments: 3 }
   ]
4. sale.service.ts cria 2 SalePayment records
5. Para o crédito 3x: cria 3 AccountReceivable (R$100 cada)
6. CashMovement criado apenas para PIX (dinheiro real no caixa)
   crédito não entra no caixa físico imediatamente

Tabelas afetadas: Sale, SalePayment (2 registros), AccountReceivable (3 registros),
                  CashMovement (1 — apenas PIX)
```

---

### G) Criação de Ordem de Serviço

```
1. Usuário acessa /dashboard/ordens-servico/nova
2. Busca/seleciona cliente
3. Vincula receita (prescrição)
4. Adiciona itens (lentes, serviços) com graus e medições
5. Seleciona laboratório e define prazo (promisedDate)
6. POST /api/service-orders
   - status inicial: DRAFT
   - number gerado sequencialmente por empresa (@@unique[companyId, number])
   - ServiceOrderHistory criado: action=CREATED

7. Fluxo de status:
   DRAFT
   → APPROVED (gerente aprova)
   → SENT_TO_LAB (enviada ao lab, sentToLabAt registrado)
   → IN_PROGRESS (lab confirmou recebimento)
   → READY (lab terminou, readyAt registrado)
   → DELIVERED (cliente retirou, deliveredAt + deliveredByUserId)

   A qualquer momento → CANCELED

8. isDelayed = true se: promisedDate < now() E status ≠ DELIVERED/CANCELED
9. Número exibido: #000042 (normal), #000042-G (garantia), #000042-R (retrabalho)

Tabelas afetadas: ServiceOrder, ServiceOrderItem, ServiceOrderHistory,
                  QualityChecklist (na entrega), StockReservation
```

---

### H) Fluxo Completo do Laboratório

```
1. OS em status APPROVED → usuário clica "Enviar ao Lab"
   PUT /api/service-orders/[id]/status { status: "SENT_TO_LAB" }
   sentToLabAt = now()
   labOrderNumber pode ser registrado

2. Lab recebe e inicia confecção → status IN_PROGRESS
3. Lab finaliza → status READY, readyAt = now()
4. Sistema gera lembrete/notificação para o cliente (SMS/WhatsApp)
5. Cliente vai buscar →
   POST /api/service-orders/[id]/deliver
   deliveredAt = now(), deliveredByUserId = usuário atual
   QualityChecklist preenchido (6 itens: grau, centragem, altura, tratamentos, ajuste, limpeza)
   status = DELIVERED

Tabelas afetadas: ServiceOrder (múltiplos campos de data), ServiceOrderHistory,
                  QualityChecklist
```

---

### I) Garantia e Retrabalho

```
1. Cliente volta com problema na OS entregue
2. Usuário acessa a OS original
3. Clica "Criar OS de Garantia" ou "Registrar Retrabalho"
   POST /api/service-orders/[id]/warranty

4. Nova OS criada com:
   - isWarranty = true (garantia) ou isRework = true (retrabalho)
   - originalOrderId = id da OS original
   - warrantyReason / reworkReason preenchido

5. Número exibido: se #000042 é a original:
   - Nova OS número 000043 com isWarranty=true exibe #000043-G

6. Fluxo normal da OS se repete (DRAFT→SENT_TO_LAB→DELIVERED)

Tabelas afetadas: ServiceOrder (nova), ServiceOrderHistory
```

---

### J) Troca/Devolução

```
1. Cliente solicita troca ou devolução
2. Usuário acessa venda original
3. Registra devolução (status da venda → REFUNDED)
4. Estoque revertido: StockMovement type=CUSTOMER_RETURN
5. Financeiro revertido:
   - SalePayment status → REFUNDED
   - AccountReceivable → CANCELED (parcelas futuras)
6. Cashback revertido se foi utilizado ou ganho

Tabelas afetadas: Sale, SaleItem, SalePayment, StockMovement,
                  AccountReceivable, CashbackMovement
```

---

### K) Abertura e Fechamento de Caixa

```
ABERTURA:
1. Usuário acessa /dashboard/caixa
2. Clica "Abrir Caixa"
3. Informa valor inicial (troco/float)
4. POST /api/cash/shift { openingFloatAmount }
5. CashShift criado com status=OPEN
6. CashMovement criado: type=OPENING_FLOAT, direction=IN

DURANTE O DIA:
- Cada venda paga gera CashMovement(s)
- Sangrias manuais: POST /api/cash/movements { type=WITHDRAWAL }
- Suprimentos: POST /api/cash/movements { type=SUPPLY }

FECHAMENTO:
1. Usuário clica "Fechar Caixa"
2. Conta o dinheiro em caixa (closingDeclaredCash)
3. POST /api/cash/shift/close
4. Sistema calcula closingExpectedCash (soma dos movements IN - OUT)
5. differenceCash = closingDeclaredCash - closingExpectedCash
6. Se diferença ≠ 0: solicita justificativa
7. CashShift status = CLOSED

Tabelas afetadas: CashShift, CashMovement
```

---

### L) Contas a Receber

```
1. Venda parcelada gera AccountReceivable automaticamente (N registros)
2. No dia do vencimento: status muda para OVERDUE (via job ou consulta)
3. No recebimento:
   PUT /api/accounts-receivable/[id] { status: "RECEIVED", receivedDate, receivedAmount }
   - receivedAmount pode ser diferente (desconto de quitação)
4. Múltiplas: POST /api/accounts-receivable/receive-multiple
5. Recibo gerado: GET /api/accounts-receivable/[id]/receipt → PDF

Tabelas afetadas: AccountReceivable
```

---

### M) Comissões e Metas

```
1. Meta configurada: POST /api/goals com branchGoal + sellerGoals
   SalesGoal criado para branchId/year/month
   SellerGoal criado para cada vendedor

2. A cada venda finalizada: Commission criada automaticamente
   baseAmount = total da venda
   percentage = regra da CommissionRule (por vendedor/categoria/marca)
   commissionAmount = baseAmount × percentage / 100
   status = PENDING

3. Aprovação: gerente aprova comissão → status = APPROVED
4. Pagamento: status = PAID, paidAt registrado

5. SellerCommission (consolidado mensal) calculado no fechamento do mês:
   - totalSales = soma das vendas do mês
   - goalAchieved = totalSales >= goalAmount
   - baseCommission + bonusCommission = totalCommission

Tabelas afetadas: SalesGoal, SellerGoal, Commission, SellerCommission
```

---

## 7. MATRIZ DE INTEGRAÇÕES ENTRE MÓDULOS

| Módulo Origem | Módulo Destino | Tipo de Integração | Automático? | Descrição |
|--------------|----------------|-------------------|:-----------:|-----------|
| Venda | Estoque | Baixa de quantidade | ✅ Sim | stockQty decrementado em $transaction |
| Venda | Financeiro (AR) | Cria parcelas | ✅ Sim | AccountReceivable por parcela crediário |
| Venda | Cashback | Acumula saldo | ✅ Sim | CashbackMovement CREDIT após venda |
| Venda | Caixa | Registra movimento | ✅ Sim | CashMovement no CashShift aberto |
| Venda | Comissão | Gera comissão | ✅ Sim | Commission criada pelo vendedor |
| OS | Venda | Vinculada | ✅ Sim | Sale.serviceOrderId (1:1) |
| OS | Laboratório | Envia pedido | ❌ Manual | Status SENT_TO_LAB via botão |
| Orçamento | Venda | Conversão | ❌ Manual | POST /api/quotes/[id]/convert |
| Orçamento | OS | Conversão | ❌ Manual | Idem, cria OS vinculada |
| Recebimento | Cashback | Pode usar saldo | ❌ Manual | Usuário informa no PDV |
| Receita | OS | Vinculada | ❌ Manual | Usuário seleciona a receita na OS |
| Receita | Venda | Snapshot | ✅ Sim | prescriptionData Json na OS |
| Garantia | OS | Cria nova OS | ❌ Manual | POST /api/service-orders/[id]/warranty |
| Estoque | Alerta | Notifica baixo | ❌ Manual | Dashboard consulta stockQty < stockMin |
| Cliente | Lembrete | Gera lembretes | ⚠️ Agendado | reminder.service.ts (precisa job scheduler) |
| Cashback | Expiração | Expira saldo | ⚠️ Agendado | expiresAt comparado na consulta |
| Metas | Comissão | Bônus | ✅ Sim | goalAchieved → bonusCommission |

### 7.1 Integrações Externas

| Serviço | Tipo | Status |
|---------|------|--------|
| WhatsApp | wa.me links (não API oficial) | Implementado (links manuais) |
| Vercel | Deploy | Ativo |
| Neon (PostgreSQL serverless) | Banco de dados | Ativo |
| NFe/NFCe | Fiscal | Estrutura no schema (FiscalStatus, fiscalKey), não implementado |
| Gateway de pagamento | Online | Não implementado |

---

## 8. SEGURANÇA E PERMISSÕES

### 8.1 Modelo de Autenticação

- **NextAuth v5** com `@auth/prisma-adapter`
- Estratégia: **Credentials** (email + senha bcryptjs)
- Sessão: **JWT** (server-side session via middleware)
- Middleware Next.js protege todas as rotas `/dashboard/**` e `/api/**` (exceto `/api/auth/**`)
- `requireAuth()` em `src/lib/auth-helpers.ts` valida a sessão em cada API route

### 8.2 Roles Existentes

| Role | Nome | Nível de Acesso |
|------|------|----------------|
| ADMIN | Administrador | Total — incluindo configurações e usuários |
| GERENTE | Gerente | Gestão operacional, aprovações, relatórios |
| VENDEDOR | Vendedor | PDV, OS, clientes, orçamentos |
| CAIXA | Operador de Caixa | Caixa, pagamentos, recebimentos |
| ATENDENTE | Atendente | Atendimento, OS, agendamentos |

### 8.3 Sistema de Permissões Granular

- `Permission`: cada permissão tem `code` único (ex: `sales.create`, `stock.adjust.approve`)
- `RolePermission`: define permissões padrão por role (`granted = true/false`)
- `UserPermission`: override individual por usuário
- Resolução: UserPermission > RolePermission > negado

### 8.4 Multi-Tenant

- Todos os modelos têm `companyId` obrigatório
- Todas as queries Prisma incluem `where: { companyId }` via `getCompanyId()` helper
- Usuários de uma empresa nunca veem dados de outra empresa
- Filiais isoladas por `branchId` para dados operacionais

### 8.5 LGPD

- CPF armazenado em texto no banco (⚠️ risco — não há criptografia ou mascaramento)
- `acceptsMarketing: Boolean` para consentimento de comunicação
- `active: Boolean` permite desativar clientes sem deletar (soft delete parcial)
- Sem campo de exclusão definitiva de cliente ou anonimização

---

## 9. PERFORMANCE E ESCALABILIDADE

### 9.1 Índices Existentes

O schema possui **~100 índices** bem distribuídos. Destaques:
- Todos os modelos com `companyId` têm índice composto `[companyId, <campo principal>]`
- `Sale`: índices em `[companyId, branchId, createdAt]`, `[customerId, createdAt]`, `[sellerUserId, createdAt]`
- `ServiceOrder`: índices em `status`, `customerId`, `isDelayed`, `promisedDate`, `laboratoryId`
- `AccountReceivable/Payable`: índices em `[companyId, status, dueDate]` — essencial para relatórios
- `CashMovement`: índices em `[cashShiftId, createdAt]`, `[originType, originId]`

### 9.2 Queries Críticas

- **Dashboard metrics**: múltiplos `aggregate` e `count` paralelos (bem implementado com `Promise.all`)
- **Relatórios financeiros**: `groupBy` por mês/categoria em AccountReceivable/Payable
- **Estoque**: `$queryRaw` necessário para `stockQty <= stockMin` (Prisma não suporta campo vs campo)
- **OS atrasadas**: calculado em runtime (`promisedDate < now()`) — não há job de atualização

### 9.3 Estratégia de Transações

- Vendas, OS e ajustes de estoque usam `prisma.$transaction()` para atomicidade
- Rollback automático se qualquer operação falhar

### 9.4 Paginação

- Implementada em todos os GETs com `page` e `limit` via `paginatedResponse` helper
- Padrão: `skip = (page-1) * limit`, `take = limit`

### 9.5 Concorrência

- Estoque: não há lock pessimista — risco de race condition em vendas simultâneas do mesmo produto
- StockReservation existe na modelagem mas pode não estar implementado em todos os fluxos

### 9.6 Cache

- Nenhuma estratégia de cache implementada (Redis, in-memory, etc.)
- Cada request faz query ao banco

---

## 10. ANÁLISE DE MELHORIAS

### 10.1 Tabelas/Campos que FALTAM para uma Ótica Completa

| Campo/Tabela Faltando | Onde | Impacto |
|-----------------------|------|---------|
| `lote` / `serial` em SaleItem/ServiceOrderItem | Rastreabilidade de produto | Médio |
| Histórico de preços (price history) | Product | Baixo |
| Foto da receita separada por olho | PrescriptionValues | Baixo |
| `approvedByDoctorAt` em Prescription | Validação médica | Baixo |
| NPS/satisfação do cliente por venda | Sale | Médio |
| Múltiplos preços por perfil de cliente | Product | Alto |
| Tabela de taxas de cartão por bandeira | Financeiro | Médio |
| `splitPaymentFee` na venda | SalePayment | Médio |
| Agenda de exames (Appointment já existe, mas sem resultado) | AppointmentResult | Médio |
| Criptografia do CPF em banco | Customer | **Alto** (LGPD) |
| `deletedAt` (soft delete) em Sale, Customer, Product | — | Alto |
| Histórico de alterações de preço | Product | Médio |

### 10.2 Problemas de Modelagem

1. **`Lab.totalOrders`/`totalReworks`**: Campos `Int` que são contadores cache — risco de dessincronização. Melhor usar `_count` do Prisma.

2. **`QuoteStatus` duplicado**: Enum tem `OPEN`, `PENDING` e `CANCELLED`/`CANCELED` — são semanticamente iguais. Inconsistência.

3. **`RolePermission.role`**: Campo `String` em vez de `UserRole` enum — perde tipagem segura, permite inserção de valores inválidos.

4. **`ServiceOrder.number`**: `Int` gerado por código (não sequência de banco) — pode haver race condition se duas OS forem criadas simultaneamente. Usar `SEQUENCE` do PostgreSQL seria mais robusto.

5. **`Product.barcode`**: Campo simples `String?` além da tabela `ProductBarcode` — duplicidade. O campo principal poderia ser removido e usar apenas `ProductBarcode` com `isPrimary=true`.

6. **Soft delete inconsistente**: Alguns modelos têm `active: Boolean`, outros têm `canceledAt`, nenhum tem `deletedAt` padrão. Dificulta queries de "não deletados".

7. **Ausência de `totalInstallments` validado**: Em `AccountReceivable`, os registros de parcelas não têm FK para a venda que os criou agregados — dificulta recalcular o total em caso de divergência.

### 10.3 Funcionalidades Faltando

| Funcionalidade | Prioridade | Observação |
|----------------|-----------|-----------|
| Job scheduler (cron) para lembretes automáticos e cashback expirando | Alta | reminder.service.ts existe mas não há trigger automático |
| Notificações push/in-app | Alta | Estrutura de notificações não existe |
| Integração NF-e/NFC-e | Alta | Schema pronto (FiscalStatus), implementação falta |
| Lock de estoque concorrente | Alta | Risco de venda duplicada |
| Exportação de DRE em PDF | Média | Página existe, export falta |
| Multi-caixa simultâneo (vários operadores) | Média | CashShift não distingue operador de caixa físico |
| Importação de tabela do laboratório (price range) | Média | LabPriceRange existe, sem import |
| App mobile nativo / PWA instalável | Média | Responsivo mas sem PWA manifest |
| Integração com gateway de pagamento (Mercado Pago, PagSeguro) | Alta | Pagamentos são manuais |
| Criptografia de dados sensíveis (CPF) | Alta | Obrigação LGPD |
| Auditoria automática via Prisma middleware | Média | AuditLog existe, mas preenchimento manual |
| Backup automático dos dados | Alta | Neon faz backup, mas sem política documentada |
| 2FA / autenticação de dois fatores | Média | Não implementado |
| API pública para integração com outros sistemas | Baixa | — |

### 10.4 Melhorias de Código

1. **`Promise.all` no dashboard/metrics**: Bem implementado. Manter padrão.
2. **`getBranchId().catch(() => null)`**: Correto tratar erro quando usuário não tem filial.
3. **Zod v4**: Projeto usa Zod 4 (beta) — verificar compatibilidade e breaking changes.
4. **`"use client"` em excesso**: Alguns componentes RSC que buscam dados poderiam ser Server Components.
5. **Validação de types TypeScript**: `any` aparece em alguns handlers de erro — poderia ser tipado.
6. **Centralizar `getCompanyId`/`getBranchId`**: Já centralizado em `auth-helpers.ts` — bom padrão, manter.

### 10.5 Dúvidas / Pontos em Aberto

1. **O `Appointment` tem `serviceOrderId` mas não há FK definido no schema** — como é a relação?
2. **`Lab.totalOrders` vs `_count.serviceOrders`**: Ambos existem — qual é fonte da verdade?
3. **`CashRegister` vs `CashShift`**: Existem duas APIs (`/api/cash-registers` e `/api/cash/shift`) — qual é legada?
4. **Job de atualização de `AccountReceivable.status` para OVERDUE**: Existe? É manual? Via consulta a cada requisição?
5. **`LoyaltyPoints` vs `CustomerCashback`**: O sistema tem dois programas de fidelização (pontos e cashback)? Ou um está depreciado?
6. **Multi-filial real**: O usuário pode vender na filial A e aparecer no caixa da filial B? Há isolamento total?

---

*Documentação gerada em 2026-02-17 — PDV Ótica v1.0 (11 commits no branch main)*
