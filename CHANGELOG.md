# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### 🚧 Planejado
- Integração com NFC-e / NF-e (Focus NFe ou Bling)
- Programa de fidelidade (pontos e tiers)
- Sistema completo de agendamentos
- Controle de garantias avançado
- Relatórios de Curva ABC de produtos
- DRE (Demonstrativo de Resultados) completo
- PWA / Modo offline
- Reset de senha via email
- Export de relatórios (CSV, Excel, PDF)
- Integração direta com laboratórios

---

## [1.0.0] - 2026-02-07

### ✅ Adicionado
- **Autenticação e Autorização**
  - NextAuth.js 5.0.0-beta com JWT sessions
  - Multi-tenant (isolamento por `companyId`)
  - Roles: ADMIN, MANAGER, SELLER
  - Middleware de autenticação em todas as rotas protegidas

- **PDV (Ponto de Venda)**
  - Interface completa de vendas
  - Split payment (múltiplas formas de pagamento por venda)
  - Suporte a: Dinheiro, Cartão (crédito/débito), PIX, Transferência, Cheque, Crédito Loja, Convênio
  - Validação de estoque em tempo real
  - Cálculo automático de comissões para vendedores

- **Controle de Caixa (Cash Management)**
  - Abertura de turno com float inicial
  - Fechamento de turno com conferência
  - Sangria (retirada de dinheiro)
  - Suprimento (adição de dinheiro)
  - Histórico completo de movimentações
  - Validação: apenas 1 caixa aberto por filial

- **Gestão de Clientes**
  - CRUD completo (Create, Read, Update, Delete)
  - Campos: Nome, CPF, Email, Telefone, Endereço, Data de Nascimento
  - Histórico de compras vinculado
  - Validação de CPF único por empresa

- **Gestão de Produtos**
  - CRUD completo
  - Controle de estoque automático (atualização na venda)
  - Campos: SKU, Nome, Descrição, Preço, Estoque, Categoria
  - Validação: `stockQty` nunca pode ser negativo

- **Ordens de Serviço**
  - Fluxo completo: PENDING → IN_PROGRESS → READY → DELIVERED
  - Vinculação com receitas médicas
  - Itens customizáveis (lentes, armações)
  - Rastreamento de laboratório e data de entrega
  - Garantias por item

- **Movimentações de Estoque**
  - Tipos: ENTRY (entrada), EXIT (saída), ADJUSTMENT (ajuste)
  - Histórico completo com motivo/observações
  - Rastreabilidade (quem fez, quando, por quê)

- **Contas a Pagar e Contas a Receber**
  - Registro de contas com vencimento
  - Pagamento/Recebimento com data real
  - Status: PENDING, PAID/RECEIVED, OVERDUE
  - Integração com caixa (movimentos de pagamento/recebimento)

- **Fornecedores**
  - CRUD completo
  - Campos: Nome, CNPJ, Email, Telefone, Endereço
  - Vinculação com produtos e compras

- **Usuários e Funcionários**
  - CRUD completo (apenas ADMIN e MANAGER)
  - Vinculação a filial e empresa
  - Senha criptografada (bcrypt)
  - Validação de email único por empresa

- **Metas e Comissões**
  - Definição de metas por vendedor (porcentagem)
  - Cálculo automático de comissões na venda
  - Período de vigência (data início/fim)
  - Status: ACTIVE, COMPLETED, CANCELLED

- **Relatórios e Dashboard**
  - Dashboard principal com indicadores (vendas, ticket médio, top produtos)
  - Relatório de vendas por período
  - Relatório de produtos mais vendidos
  - Relatório de performance de vendedores
  - Gráficos com Recharts

- **API Completa**
  - 50+ endpoints RESTful
  - Validação de input com Zod
  - Tratamento de erros padronizado
  - Responses padronizados (success/error)
  - Service Layer separado (business logic)

- **Banco de Dados**
  - PostgreSQL 14+ com Prisma ORM 5.22.0
  - 49 models, 23 enums
  - Transações atômicas para operações críticas
  - Schema type-safe end-to-end

- **Deploy e Infraestrutura**
  - Deploy na Vercel (Serverless)
  - Suporte a Supabase, Neon.tech e PostgreSQL local
  - Connection pooling (PgBouncer)
  - Variáveis de ambiente documentadas

- **Documentação**
  - README.md profissional (1200+ linhas)
  - Documentação técnica completa (DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md, 2383 linhas)
  - Troubleshooting e FAQ
  - Guia de contribuição (CONTRIBUTING.md)
  - Checklist de produção
  - Estratégias de backup e recovery

### 🔧 Configuração Inicial
- Next.js 16.1.6 com App Router
- TypeScript 5.9.3 (strict mode)
- React 19.2.4
- Tailwind CSS 3.3.0 + shadcn/ui
- Zustand 5.0.11 (state management)
- date-fns 4.1.0 (manipulação de datas)
- Lucide React 0.563.0 (ícones)
- react-hot-toast 2.6.0 (notificações)

### 🐛 Débitos Técnicos Conhecidos
- ❌ 0% de cobertura de testes (unitários, integração, E2E)
- ⚠️ Conversão de orçamento para venda (não implementada)
- ⚠️ Validação de expiração de receitas médicas (parcial)
- ⚠️ Integração com laboratórios (manual)

---

## Tipos de Mudanças

- `✅ Adicionado` para novas funcionalidades
- `🔧 Modificado` para mudanças em funcionalidades existentes
- `🗑️ Removido` para funcionalidades removidas
- `🐛 Corrigido` para correções de bugs
- `🔒 Segurança` para correções de vulnerabilidades
- `📖 Documentação` para mudanças apenas em documentação
- `⚡ Performance` para melhorias de desempenho
- `🚧 Planejado` para funcionalidades futuras

---

## Como Contribuir com o Changelog

Ao adicionar novas funcionalidades ou corrigir bugs, atualize este arquivo seguindo o formato:

1. Adicione a mudança na seção `[Unreleased]` se ainda não foi lançada
2. Ao criar uma nova release, mova as mudanças para uma nova seção `[X.Y.Z] - AAAA-MM-DD`
3. Use o formato Keep a Changelog (categorias claras, descrições concisas)
4. Sempre coloque a versão mais recente no topo

**Exemplo**:
```markdown
## [Unreleased]

### ✅ Adicionado
- Integração com API de CEP para preenchimento automático de endereços

### 🐛 Corrigido
- Correção de bug ao fechar caixa com saldo negativo
```

---

**Versão atual**: 1.0.0
**Última atualização**: 2026-02-07
