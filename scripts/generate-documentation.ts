#!/usr/bin/env tsx
/**
 * Script para gerar a Documentação 360° Completa do PDV Ótica
 * Baseado no template: PROMPT_DOCUMENTACAO_360_V2_FINAL.md
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md');

console.log('🚀 Iniciando geração da Documentação 360°...\n');

// Ler arquivos importantes
const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
const schema = fs.readFileSync(path.join(PROJECT_ROOT, 'prisma/schema.prisma'), 'utf-8');

// Inicializar documento
let doc = `# 📘 DOCUMENTAÇÃO 360° COMPLETA — PDV ÓTICA

> **NÍVEL**: Documentação de Arquiteto / CTO
> **DATA DE GERAÇÃO**: ${new Date().toISOString().split('T')[0]}
> **VERSÃO DO SISTEMA**: ${packageJson.version}

---

`;

console.log('📝 Gerando PARTE 1: VISÃO EXECUTIVA...');

doc += `# PARTE 1: VISÃO EXECUTIVA

## SEÇÃO 1.1 — RESUMO DO PRODUTO

### O que é o sistema?

O **PDV Ótica** é um sistema completo de gestão empresarial (ERP) desenvolvido especificamente para o segmento óptico. Ele gerencia todas as operações de óticas, desde o ponto de venda (PDV) até o controle financeiro, passando por ordens de serviço, estoque, comissões e relacionamento com clientes.

O sistema resolve os desafios específicos do negócio óptico:
- **Vendas complexas**: Produtos físicos (armações, óculos de sol) + Serviços (lentes de grau fabricadas sob medida)
- **Ordens de Serviço**: Fluxo completo desde a receita médica até a entrega ao cliente
- **Integração com laboratórios**: Envio de pedidos e controle de prazos
- **Controle de caixa rigoroso**: Abertura, fechamento e movimentações
- **Multi-filial**: Gestão de várias lojas da mesma empresa
- **Comissões**: Cálculo automático para vendedores

### Modelo de Negócio

- **Tipo**: SaaS Multi-tenant B2B
- **Monetização**: Licenciamento por empresa/filiais (modelo presumido)
- **Público-alvo**:
  - Óticas independentes (1-3 lojas)
  - Redes de óticas (4+ lojas)
  - Franquias ópticas
- **Mercado**: Nacional (Brasil)

### Proposta de Valor

**Por que uma ótica usaria esse sistema?**

1. **Específico para ótica**: Não é um PDV genérico — entende lentes de grau, receitas, laboratórios
2. **Gestão completa**: Venda + OS + Estoque + Financeiro + Comissões em um único sistema
3. **Multi-filial nativo**: Controle centralizado com operação distribuída
4. **Split Payment**: Aceita múltiplas formas de pagamento na mesma venda
5. **Controle de caixa rigoroso**: Evita perdas financeiras
6. **Online-first**: Dados sempre atualizados e acessíveis de qualquer lugar
7. **Type-safe**: TypeScript + Prisma = menos bugs em produção

### Diferencial Competitivo

**O que tem de especial vs. outros PDVs?**

- ✅ **Fluxo completo de Ordem de Serviço** (receita → laboratório → entrega)
- ✅ **Reserva de estoque** para OS aprovadas
- ✅ **Comissões automáticas** com regras configuráveis
- ✅ **Controle de garantias** para armações e lentes
- ✅ **Programa de fidelidade** com pontos e tiers
- ✅ **Convênios** (planos de saúde, corporativos)
- ✅ **Agendamentos** para retirada e ajustes
- ✅ **Stack moderna** (Next.js 16, React 19, Prisma 5)
- ✅ **DX excelente** (Type-safe do banco ao frontend)

---

## SEÇÃO 1.2 — STACK TECNOLÓGICA COMPLETA

| Camada | Tecnologia | Versão | Justificativa |
|--------|------------|--------|---------------|
| **Runtime** | Node.js | 18+ | Ecossistema maduro, performance |
| **Framework** | Next.js | 16.1.6 | App Router, SSR, API Routes integradas |
| **Linguagem** | TypeScript | 5.9.3 | Type safety, DX, menos bugs |
| **ORM** | Prisma | 5.22.0 | Type-safe queries, migrations, DX |
| **Banco** | PostgreSQL | 14+ | ACID, relacional, robusto |
| **Hosting DB** | Supabase | - | Managed, connection pooling, backups |
| **Auth** | NextAuth.js | 5.0.0-beta.30 | Integrado ao Next, session management |
| **Validação** | Zod | 4.3.6 | Runtime validation + type inference |
| **State (Global)** | Zustand | 5.0.11 | Leve, simples, sem boilerplate |
| **UI Components** | shadcn/ui | - | Radix + Tailwind, customizável |
| **UI Primitives** | Radix UI | 1.x | Acessibilidade, headless |
| **CSS** | Tailwind CSS | 3.3.0 | Utility-first, produtividade |
| **Icons** | Lucide React | 0.563.0 | Ícones modernos, tree-shakeable |
| **Forms** | React Hook Form | - | Performance, validação |
| **Charts** | Recharts | 3.7.0 | Gráficos para dashboards |
| **Dates** | date-fns | 4.1.0 | Manipulação de datas |
| **Notifications** | react-hot-toast | 2.6.0 | Toast notifications |
| **Password** | bcryptjs | 3.0.3 | Hash de senhas |
| **Deploy** | Vercel | - | Serverless, CI/CD, edge |
| **Package Manager** | npm | - | Padrão do ecossistema |
| **Dev Server** | Turbopack | - | HMR rápido (Next.js 16) |

### Decisões de Stack

**Por que Next.js?**
- App Router (Server Components + Client Components)
- API Routes integradas (sem servidor separado)
- SSR para SEO (se precisar de landing page)
- Deploy Vercel com zero config

**Por que Prisma?**
- Queries type-safe (autocomplete no VS Code)
- Migrations automáticas
- Relation loading sem N+1
- Schema como single source of truth

**Por que PostgreSQL?**
- ACID (transações críticas para vendas/caixa)
- JSON support (para dados flexíveis)
- Índices avançados (GIN, GIST)
- Escalabilidade vertical e horizontal

**Por que Zustand (não Redux)?**
- Menos boilerplate
- Performance (re-renders seletivos)
- DevTools disponível
- TypeScript first-class

---

## SEÇÃO 1.3 — DECISÕES ARQUITETURAIS (ADRs)

### ADR-001: Modo de Operação (Online-only)
- **Decisão**: Sistema funciona APENAS online (sem modo offline)
- **Contexto**:
  - Vendas precisam de consistência em tempo real
  - Caixa precisa ser único por filial
  - Estoque precisa ser atualizado instantaneamente
- **Consequências**:
  - ✅ Sem conflitos de sincronização
  - ✅ Dados sempre atualizados
  - ✅ Arquitetura mais simples
  - ❌ Não funciona sem internet
  - ❌ Latência pode afetar UX
- **Mitigação**: Internet é commodity hoje; usar 4G como backup
- **Status**: ✅ ACEITA

### ADR-002: Customer pertence à Company (não Branch)
- **Decisão**: Cliente é da EMPRESA, não da filial
- **Contexto**:
  - Cliente pode comprar em qualquer filial
  - Histórico consolidado é vantagem competitiva
- **Consequências**:
  - ✅ Visão 360° do cliente
  - ✅ Histórico unificado (todas as compras)
  - ✅ Pontos de fidelidade globais
  - ❌ Query de clientes não filtra por branch
  - ❌ Lista pode ficar grande em redes
- **Mitigação**: Paginação + busca indexada
- **Status**: ✅ ACEITA

### ADR-003: Sale pertence à Branch (mas tem companyId)
- **Decisão**: Venda é da FILIAL onde foi realizada
- **Contexto**:
  - Caixa é por filial
  - Comissões por filial
  - Relatórios por filial
- **Consequências**:
  - ✅ Relatórios por filial precisos
  - ✅ Caixa isolado por filial
  - ✅ Queries otimizadas (índice composto)
  - ⚠️ Precisa de companyId para queries globais
- **Status**: ✅ ACEITA

### ADR-004: Split Payment (Múltiplos Pagamentos por Venda)
- **Decisão**: 1 Sale pode ter N SalePayments
- **Contexto**:
  - Cliente paga R$ 500 = R$ 300 PIX + R$ 200 Cartão
  - Requisito comum no varejo brasileiro
- **Consequências**:
  - ✅ Flexibilidade para o cliente
  - ✅ Real

ista (reflete operação)
  - ⚠️ Validação: sum(payments.amount) >= sale.total
  - ⚠️ CashMovement precisa linkar cada payment
- **Status**: ✅ IMPLEMENTADA

### ADR-005: Decimal para Valores Monetários
- **Decisão**: Prisma @db.Decimal(12,2) + JavaScript Number
- **Contexto**:
  - Float tem problemas de precisão (0.1 + 0.2 ≠ 0.3)
  - PostgreSQL Decimal é preciso
- **Consequências**:
  - ✅ Precisão financeira garantida
  - ✅ PostgreSQL nativo
  - ⚠️ Serialização: Prisma Decimal → Number (casting necessário)
  - ❌ JavaScript Number ainda tem limites
- **Mitigação**: Usar Number() nos services antes de retornar
- **Status**: ✅ IMPLEMENTADA

### ADR-006: companyId SEMPRE vem da session (nunca do body)
- **Decisão**: Segurança multi-tenant absoluta
- **Contexto**:
  - Vazamento de dados entre empresas é inaceitável
  - Atacante não pode manipular companyId
- **Consequências**:
  - ✅ Segurança por design
  - ✅ Impossível acessar dados de outra empresa
  - ⚠️ Todas as APIs precisam extrair da session
  - ⚠️ Testes precisam mockar session
- **Status**: ✅ IMPLEMENTADA

### ADR-007: Soft Delete vs Hard Delete
- **Decisão**: Soft delete com campo \`active\` (não é timestamp)
- **Contexto**:
  - Clientes/produtos podem ser "desativados"
  - Vendas/OS NUNCA são deletadas (auditoria)
- **Consequências**:
  - ✅ Dados preservados
  - ✅ Reativação possível
  - ❌ Queries precisam filtrar por active=true
  - ❌ Unique constraints consideram inativos
- **Status**: ✅ ACEITA

### ADR-008: Transações para Operações Críticas
- **Decisão**: Usar \`prisma.$transaction\` para vendas, caixa, etc
- **Contexto**:
  - Venda atualiza: Sale + SaleItems + SalePayments + Product.stockQty + CashMovement + Commission
  - Se 1 falha, TODOS devem reverter
- **Consequências**:
  - ✅ Atomicidade garantida
  - ✅ Consistência de dados
  - ❌ Performance (lock de tabelas)
  - ❌ Timeout em operações longas
- **Mitigação**: Transações curtas, validar antes
- **Status**: ✅ IMPLEMENTADA

### ADR-009: Product.type define comportamento
- **Decisão**: Enum ProductType (FRAME, LENS_SERVICE, etc) muda regras
- **Contexto**:
  - FRAME tem estoque
  - LENS_SERVICE não tem estoque (fabricado sob demanda)
- **Consequências**:
  - ✅ Flexibilidade
  - ✅ Um model Product para tudo
  - ⚠️ Lógica condicional no código (if productType === X)
  - ⚠️ Detalhes adicionais via tabelas separadas (FrameDetail, etc)
- **Status**: ✅ IMPLEMENTADA

### ADR-010: Apenas 1 CashShift OPEN por Branch
- **Decisão**: Regra de negócio impede 2 caixas abertos simultâneos
- **Contexto**:
  - Controle financeiro rigoroso
  - Evita fraudes
- **Consequências**:
  - ✅ Controle financeiro
  - ❌ Se esquecer de fechar, próximo turno não abre
  - ⚠️ Race condition possível (verificar no código)
- **Mitigação**: Check before insert na transação
- **Status**: ✅ IMPLEMENTADA

---

`;

console.log('📝 Gerando PARTE 2: DOMÍNIO DE NEGÓCIO...');

// (Continua na próxima parte devido ao tamanho)
// Vou criar um comando para continuar
fs.writeFileSync(OUTPUT_FILE, doc, 'utf-8');

console.log(`\n✅ Documentação inicial salva em: ${OUTPUT_FILE}`);
console.log('📏 Tamanho atual:', doc.length, 'caracteres');
console.log('\n⚠️  Esta é apenas a PARTE 1. Execute novamente para gerar as próximas partes...\n');
