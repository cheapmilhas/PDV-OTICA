# PDV Ótica - Sistema Completo para Óticas

Sistema PDV (Ponto de Venda) completo para óticas, com gestão de vendas, estoque, ordens de serviço (lentes de grau), caixa, orçamentos, clientes, receitas médicas, comissões, convênios e relatórios.

## 🚀 Tecnologias

- **Frontend**: Next.js 14+ (App Router) + TypeScript
- **Estilização**: Tailwind CSS + shadcn/ui
- **Banco de Dados**: PostgreSQL (Prisma ORM)
- **Autenticação**: NextAuth.js v5
- **Validação**: Zod
- **State**: Zustand

## 📋 Pré-requisitos

- Node.js 18+
- PostgreSQL (local ou em nuvem)

## ⚙️ Configuração Inicial

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Banco de Dados

Você tem 4 opções:

#### Opção A: Neon.tech (Recomendado - Grátis e Rápido)
1. Acesse https://neon.tech e crie uma conta
2. Crie um novo projeto "pdv-otica"
3. Copie a connection string
4. Cole no `.env`:
```env
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb"
```

#### Opção B: Supabase (Grátis)
1. Acesse https://supabase.com
2. Crie projeto → Região: South America
3. Em Settings → Database → Connection String
4. Cole no `.env`:
```env
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

#### Opção C: Railway.app (Grátis)
1. Acesse https://railway.app
2. New Project → Provision PostgreSQL
3. Copie DATABASE_URL
4. Cole no `.env`

#### Opção D: PostgreSQL Local (macOS)
```bash
# Se Homebrew estiver instalando, aguarde ou:
brew install postgresql@16
brew services start postgresql@16
createdb pdv_otica
```

Então no `.env`:
```env
DATABASE_URL="postgresql://postgres@localhost:5432/pdv_otica"
```

### 3. Aplicar Migrations

```bash
npx prisma generate
npx prisma db push
```

### 4. Popular Banco com Dados Iniciais (em breve)

```bash
npm run prisma:seed
```

### 5. Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

Acesse: http://localhost:3000

## 📁 Estrutura do Projeto

```
src/
├── app/                    # Rotas Next.js (App Router)
│   ├── (auth)/            # Rotas de autenticação
│   ├── (dashboard)/       # Rotas protegidas
│   └── api/               # API Routes
├── components/            # Componentes React
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Layout components
│   ├── pdv/              # PDV components
│   └── shared/           # Shared components
├── lib/                   # Utilitários
│   ├── prisma.ts         # Prisma client
│   ├── auth.ts           # NextAuth config
│   ├── utils.ts          # Helpers
│   └── validations/      # Zod schemas
└── types/                 # TypeScript types

prisma/
├── schema.prisma          # Database schema
└── seed.ts               # Seed data
```

## 🎯 Funcionalidades (Roadmap)

### Fase 1 - MVP (Em Desenvolvimento)
- [x] Setup inicial
- [x] Configuração do banco
- [ ] Autenticação (NextAuth)
- [ ] PDV (Ponto de Venda)
- [ ] Gestão de Caixa
- [ ] CRUD de Clientes
- [ ] CRUD de Produtos
- [ ] Ordens de Serviço

### Fase 2 - Gestão
- [ ] Orçamentos
- [ ] Receitas Médicas
- [ ] Comissões
- [ ] Relatórios

### Fase 3 - Extras
- [ ] Convênios
- [ ] Programa de Fidelidade
- [ ] Agendamentos
- [ ] Garantias

## 🔒 Credenciais Padrão (após seed)

```
Email: admin@pdvotica.com
Senha: admin123
```

## 📝 Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build para produção
npm run start        # Inicia servidor de produção
npm run lint         # Executa linter
npx prisma studio    # Abre interface visual do banco
npx prisma migrate dev # Cria nova migration
```

## 🤝 Contribuindo

Este é um projeto privado. Para sugestões, entre em contato.

## 📄 Licença

Proprietário - Todos os direitos reservados.
