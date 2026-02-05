# 📊 PROGRESSO DO DESENVOLVIMENTO - PDV ÓTICA

**Última Atualização:** 04/02/2026 (22:20)
**Último Commit:** `8071dce` - fix: Corrigir tipos e campos do Prisma
**Status Atual:** 🚧 LOTE 2 EM ANDAMENTO - Backend 90% completo, precisa ajustes finais

---

## 🎯 VISÃO GERAL DO PROJETO

Sistema PDV (Ponto de Venda) para ótica com gestão completa de clientes, produtos, vendas, ordens de serviço, caixa e relatórios.

**Tecnologias:**
- Next.js 16.1.6 (App Router + Turbopack)
- React 19
- NextAuth v5 (beta.30)
- Prisma ORM + PostgreSQL (Neon)
- TypeScript
- shadcn/ui + Radix UI
- Tailwind CSS
- Zod (validação)

**Padrões Estabelecidos:**
- ✅ Multi-tenancy (companyId em todas as queries)
- ✅ RBAC (Role-Based Access Control)
- ✅ Soft Delete (campo `active`)
- ✅ Service Layer Pattern
- ✅ Validação com Zod
- ✅ Paginação padronizada
- ✅ Error handling centralizado
- ✅ Rotas para novo/editar (não modais)

---

## ✅ LOTE 1 - CLIENTES + PRODUTOS (CONCLUÍDO)

### 📦 O que foi implementado (25 arquivos):

#### **1. Fundação e Infraestrutura (8 arquivos)**

```
src/types/next-auth.d.ts              # Type declarations NextAuth v5
src/lib/error-handler.ts              # Error handling centralizado (AppError, handleApiError)
src/lib/auth-helpers.ts               # RBAC helpers (requireAuth, requireRole, getCompanyId)
src/lib/api-response.ts               # Response helpers (successResponse, paginatedResponse)
src/lib/validations/customer.schema.ts # Zod schemas para Customer
src/lib/validations/product.schema.ts  # Zod schemas para Product
src/services/customer.service.ts       # Business logic de Clientes
src/services/product.service.ts        # Business logic de Produtos
```

**Características:**
- AppError class para erros customizados
- handleApiError captura ZodError, PrismaError, AppError
- requireAuth/requireRole para proteger rotas
- Schemas Zod com sanitização (remove empty strings)
- Services com métodos CRUD + helpers (searchByPhone, findByCPF, checkStock, etc.)

#### **2. APIs REST (4 rotas refatoradas)**

```
src/app/api/customers/route.ts        # GET (list + search) + POST (create)
src/app/api/customers/[id]/route.ts   # GET (by id) + PUT (update) + DELETE (soft)
src/app/api/products/route.ts         # GET (list + search) + POST (create)
src/app/api/products/[id]/route.ts    # GET (by id) + PUT (update) + DELETE (soft)
```

**Características:**
- Multi-tenancy (companyId filter)
- RBAC (DELETE requer ADMIN ou GERENTE)
- Paginação (page, pageSize, total, totalPages, hasNext)
- Busca (search em múltiplos campos)
- Filtros (status, type, city, inStock, etc.)
- Soft delete (active: false)
- Validação Zod em body e query params

#### **3. Componentes Compartilhados (4 arquivos)**

```
src/components/shared/can.tsx          # RBAC component + usePermissions hook
src/components/shared/search-bar.tsx   # Search com debounce 300ms
src/components/shared/pagination.tsx   # Paginação com ellipsis
src/components/shared/empty-state.tsx  # Empty state + NoSearchResults
```

**Características:**
- `<Can roles={['ADMIN']}>` esconde conteúdo sem permissão
- SearchBar com clear button opcional
- Pagination com first/prev/numbers/next/last
- EmptyState com icon, title, description, action

#### **4. Páginas CRUD - Clientes (3 arquivos)**

```
src/app/(dashboard)/dashboard/clientes/page.tsx           # Listagem
src/app/(dashboard)/dashboard/clientes/novo/page.tsx      # Criar
src/app/(dashboard)/dashboard/clientes/[id]/editar/page.tsx # Editar
```

**Características:**
- Listagem: SearchBar, Pagination, EmptyState, Loading state, Cards responsivos
- Novo: Formulário completo (dados pessoais, endereço, observações)
- Editar: Pré-carrega dados, mesmo formulário do novo
- Todos: Toast notifications, Error handling, RBAC (Delete apenas para ADMIN/GERENTE)

#### **5. Páginas CRUD - Produtos (3 arquivos)**

```
src/app/(dashboard)/dashboard/produtos/page.tsx           # Listagem
src/app/(dashboard)/dashboard/produtos/novo/page.tsx      # Criar
src/app/(dashboard)/dashboard/produtos/[id]/editar/page.tsx # Editar
```

**Características:**
- Listagem: SearchBar, Pagination, EmptyState, Loading state, Cards com info de estoque
- Novo: Formulário com campos dinâmicos (mostra campos de lente se type=LENTE)
- Editar: Pré-carrega dados, campos dinâmicos
- Todos: Toast notifications, RBAC, Stock badges (Esgotado, Baixo, Normal)

#### **6. Arquivos Modificados**

```
src/auth.ts                            # Condicionado Auth Mock (AUTH_MOCK=true)
                                       # Comentado PrismaAdapter (conflito NextAuth v5 beta)
                                       # Fix params Promise (Next.js 16)

src/app/api/dashboard/metrics/route.ts # Fix Decimal arithmetic
```

---

## 📋 DEFINITION OF DONE - LOTE 1

### ✅ Critérios Atendidos (100%)

#### **1. Funcionalidade**
- ✅ Botões têm handler real (fetch para APIs)
- ✅ CRUD completo funciona (Create, Read, Update, Delete)
- ✅ Validação ativa (Zod em todas as rotas)
- ✅ Filtros e busca funcionam (SearchBar + query params)
- ✅ Paginação funciona (Pagination component)

#### **2. Qualidade**
- ✅ Sem erros no console (diagnostics limpo)
- ✅ Sem warnings do Next.js (build passou)
- ✅ Sem dados mock (removidos de componentes)

#### **3. UX/Feedback**
- ✅ Loading states (Loader2 spinner)
- ✅ Empty states (EmptyState component)
- ✅ Error states (toast.error)
- ✅ Toast notifications (react-hot-toast)
- ✅ Confirmação de ações destrutivas (confirm() antes delete)

#### **4. Segurança e Permissões**
- ✅ Autenticação obrigatória (requireAuth em APIs)
- ✅ Autorização aplicada (requireRole em DELETE)
- ✅ UI respeita roles (<Can> component)
- ✅ CompanyId validado (getCompanyId em todas queries)

#### **5. Responsividade**
- ✅ Mobile funcional (≥375px)
- ✅ Tablet funcional (md:grid-cols-2, ≥768px)
- ✅ Desktop funcional (lg:grid-cols-3, ≥1024px)

#### **6. Documentação**
- ✅ Blueprint criado (BLUEPRINT_FUNCIONAL_PDV.md)
- ✅ Schemas documentados (comentários nos schemas)

#### **7. Performance**
- ✅ Paginação implementada (pageSize=20, max=100)
- ✅ Queries otimizadas (Promise.all, select/include)

---

## 🚧 LOTE 2 - VENDAS + ORDEM DE SERVIÇO (EM ANDAMENTO - 70%)

### ✅ O que já foi implementado:

#### **1. Backend de Vendas (Completo)**
- ✅ `src/services/sale.service.ts` - Service completo
- ✅ `src/lib/validations/sale.schema.ts` - Schemas Zod
- ✅ `src/app/api/sales/route.ts` - GET/POST
- ✅ `src/app/api/sales/[id]/route.ts` - GET/DELETE

#### **2. Backend de Ordens de Serviço (Completo)**
- ✅ `src/services/service-order.service.ts` - Service completo
- ✅ `src/lib/validations/service-order.schema.ts` - Schemas Zod
- ✅ `src/app/api/service-orders/route.ts` - GET/POST
- ✅ `src/app/api/service-orders/[id]/route.ts` - GET/PUT/DELETE
- ✅ `src/app/api/service-orders/[id]/status/route.ts` - PATCH

### ⚠️ Pendências e Ajustes Necessários:

#### **A. Corrigir Campos do Prisma no sale.service.ts:**
O schema do Prisma tem nomes diferentes dos usados:
- ✅ `Payment` → `SalePayment` (CORRIGIDO)
- ✅ `userId` → `sellerUserId` (CORRIGIDO)
- ✅ `discount` → `discountTotal` (CORRIGIDO)
- ⚠️ Includes precisam usar `sellerUser` em vez de `user`
- ⚠️ Filtro de `paymentMethod` precisa ser ajustado para `payments.some()`

#### **B. Criar Páginas Frontend:**
- ❌ Listagem de Vendas
- ❌ Nova Venda (PDV)
- ❌ Detalhes da Venda
- ❌ Listagem de Ordens de Serviço
- ❌ Nova Ordem de Serviço
- ❌ Editar Ordem de Serviço
- ❌ Detalhes da Ordem de Serviço

#### **C. Criar Componentes Específicos:**
- ❌ `sale-item-list.tsx` - Lista de itens da venda
- ❌ `payment-form.tsx` - Formulário de pagamento
- ❌ `product-search.tsx` - Busca de produtos com barcode
- ❌ `prescription-form.tsx` - Formulário de prescrição (grau)
- ❌ `os-status-badge.tsx` - Badge de status da OS

### 📝 Próximos Passos Imediatos:

1. **Corrigir includes no sale.service.ts** para usar campos corretos
2. **Testar build** e garantir que compila sem erros
3. **Criar páginas de Vendas** (listagem + nova)
4. **Criar páginas de Ordens de Serviço** (listagem + nova + editar)
5. **Testar end-to-end** com banco de dados
6. **Validar Definition of Done**

---

## 🎯 PRÓXIMOS PASSOS - DEPOIS DO LOTE 2

### 📦 LOTE 2: VENDAS + ORDEM DE SERVIÇO

#### **Objetivo:**
Implementar CRUD completo de Vendas (PDV) e Ordens de Serviço seguindo o padrão do Lote 1.

#### **Escopo:**

##### **1. Vendas (PDV)**

**Tabelas Prisma existentes:**
- `Sale` - Cabeçalho da venda
- `SaleItem` - Itens da venda
- `Payment` - Pagamentos da venda

**Service Layer a criar:**
```
src/services/sale.service.ts          # Business logic de Vendas
  - list(query, companyId)             # Listagem com filtros
  - getById(id, companyId)             # Buscar por ID com itens e pagamentos
  - create(data, companyId)            # Criar venda + itens + pagamentos (transação)
  - cancel(id, companyId, reason)      # Cancelar venda (soft delete + estorno estoque)
  - getByCustomer(customerId, companyId) # Vendas de um cliente
  - getDailySales(date, companyId)     # Vendas do dia
  - calculateTotal(items)              # Calcular total da venda
```

**Schemas Zod a criar:**
```
src/lib/validations/sale.schema.ts
  - createSaleSchema                   # { customerId, branchId, items[], payments[] }
  - saleItemSchema                     # { productId, qty, unitPrice, discount }
  - paymentSchema                      # { method, amount, installments }
  - saleQuerySchema                    # { search, startDate, endDate, status, customerId }
  - cancelSaleSchema                   # { reason }
```

**APIs a criar:**
```
src/app/api/sales/route.ts            # GET (list) + POST (create)
src/app/api/sales/[id]/route.ts       # GET (by id) + DELETE (cancel)
src/app/api/sales/[id]/print/route.ts # GET (gerar PDF recibo)
```

**Páginas a criar:**
```
src/app/(dashboard)/dashboard/vendas/page.tsx            # Listagem de vendas
src/app/(dashboard)/dashboard/vendas/nova/page.tsx       # Nova venda (PDV)
src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx # Detalhes da venda
```

**Componentes específicos:**
```
src/components/vendas/sale-item-list.tsx      # Lista de itens da venda
src/components/vendas/payment-form.tsx        # Formulário de pagamento
src/components/vendas/product-search.tsx      # Busca de produtos com barcode
src/components/vendas/customer-quick-add.tsx  # Cadastro rápido de cliente
```

##### **2. Ordem de Serviço (OS)**

**Tabelas Prisma existentes:**
- `ServiceOrder` - Cabeçalho da OS
- `ServiceOrderItem` - Itens/serviços da OS

**Service Layer a criar:**
```
src/services/service-order.service.ts  # Business logic de OS
  - list(query, companyId)              # Listagem com filtros
  - getById(id, companyId)              # Buscar por ID com itens
  - create(data, companyId)             # Criar OS + itens
  - update(id, data, companyId)         # Atualizar OS
  - updateStatus(id, status, companyId) # Mudar status (PENDENTE -> PRONTO -> ENTREGUE)
  - cancel(id, companyId, reason)       # Cancelar OS
  - getByCustomer(customerId, companyId) # OS de um cliente
  - getPending(companyId)               # OS pendentes
```

**Schemas Zod a criar:**
```
src/lib/validations/service-order.schema.ts
  - createServiceOrderSchema            # { customerId, items[], prescription }
  - serviceOrderItemSchema              # { type, description, price, observations }
  - updateServiceOrderSchema            # Partial do create
  - serviceOrderQuerySchema             # { search, status, startDate, endDate }
  - updateStatusSchema                  # { status, notes }
```

**APIs a criar:**
```
src/app/api/service-orders/route.ts              # GET (list) + POST (create)
src/app/api/service-orders/[id]/route.ts         # GET + PUT + DELETE
src/app/api/service-orders/[id]/status/route.ts  # PATCH (update status)
```

**Páginas a criar:**
```
src/app/(dashboard)/dashboard/ordens/page.tsx           # Listagem de OS
src/app/(dashboard)/dashboard/ordens/nova/page.tsx      # Nova OS
src/app/(dashboard)/dashboard/ordens/[id]/editar/page.tsx # Editar OS
src/app/(dashboard)/dashboard/ordens/[id]/detalhes/page.tsx # Detalhes OS
```

**Componentes específicos:**
```
src/components/ordens/prescription-form.tsx    # Formulário de prescrição (grau)
src/components/ordens/os-timeline.tsx          # Timeline de status da OS
src/components/ordens/os-status-badge.tsx      # Badge de status
src/components/ordens/lens-calculator.tsx      # Calculadora de lentes
```

#### **Estimativa de Esforço:**
- Services: 2 arquivos (~400 linhas cada)
- Schemas: 2 arquivos (~250 linhas cada)
- APIs: 8 rotas (~100 linhas cada)
- Páginas: 7 páginas (~250 linhas cada)
- Componentes: 7 componentes (~150 linhas cada)

**Total estimado:** ~4.500 linhas de código

#### **Desafios Técnicos:**

1. **Transações Prisma:**
   - Criar venda + itens + pagamentos de forma atômica
   - Atualizar estoque de produtos ao criar/cancelar venda

2. **Validações de Negócio:**
   - Verificar estoque disponível antes de vender
   - Validar que soma de pagamentos = total da venda
   - Não permitir cancelar venda já entregue
   - Não permitir editar OS já entregue

3. **Cálculos:**
   - Total da venda (soma itens - descontos)
   - Total de cada item (qty * unitPrice - discount)
   - Comissões de vendedores (se aplicável)

4. **UX:**
   - Busca de produtos por barcode
   - Adicionar múltiplos itens rapidamente
   - Múltiplos métodos de pagamento na mesma venda
   - Status da OS com cores e timeline

---

## 📚 PADRÕES A SEGUIR (DO LOTE 1)

### **1. Structure de Arquivos**

```
src/
├── services/
│   └── <entity>.service.ts           # Business logic
├── lib/
│   └── validations/
│       └── <entity>.schema.ts        # Zod schemas
├── app/
│   └── api/
│       └── <entity>/
│           ├── route.ts              # GET (list) + POST
│           └── [id]/
│               └── route.ts          # GET + PUT + DELETE
└── app/(dashboard)/dashboard/
    └── <entity>/
        ├── page.tsx                  # Listagem
        ├── novo/page.tsx             # Criar
        └── [id]/
            └── editar/page.tsx       # Editar
```

### **2. Service Layer Pattern**

```typescript
export class EntityService {
  async list(query: EntityQuery, companyId: string) {
    // Valida query
    // Filtra por companyId e active=true
    // Aplica busca e filtros
    // Paginação
    // Promise.all para count paralelo
    return { data, pagination }
  }

  async getById(id: string, companyId: string) {
    // Busca com include de relações
    // Valida companyId
    // NotFoundError se não existir
    return entity
  }

  async create(data: CreateDTO, companyId: string) {
    // Adiciona companyId, active=true
    // Validações de negócio
    // Prisma.create
    return entity
  }

  async update(id: string, data: UpdateDTO, companyId: string) {
    // Verifica se existe
    // Validações de negócio
    // Prisma.update
    return entity
  }

  async softDelete(id: string, companyId: string) {
    // Verifica se existe
    // Validações (ex: não deletar se tem estoque)
    // Prisma.update({ active: false })
    return entity
  }
}
```

### **3. API Route Pattern**

```typescript
// GET /api/<entity>
export async function GET(request: Request) {
  try {
    await requireAuth()
    const companyId = await getCompanyId()
    const query = querySchema.parse(Object.fromEntries(searchParams))
    const result = await service.list(query, companyId)
    return paginatedResponse(result.data, result.pagination)
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/<entity>
export async function POST(request: Request) {
  try {
    await requireAuth()
    const companyId = await getCompanyId()
    const data = createSchema.parse(await request.json())
    const sanitized = sanitizeDTO(data) as CreateDTO
    const entity = await service.create(sanitized, companyId)
    return createdResponse(entity)
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/<entity>/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const companyId = await getCompanyId()
    const { id } = await params
    const entity = await service.getById(id, companyId)
    return successResponse(entity)
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/<entity>/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const companyId = await getCompanyId()
    const { id } = await params
    const data = updateSchema.parse(await request.json())
    const sanitized = sanitizeDTO(data) as UpdateDTO
    const entity = await service.update(id, sanitized, companyId)
    return successResponse(entity)
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/<entity>/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    await requireRole(['ADMIN', 'GERENTE'])
    const companyId = await getCompanyId()
    const { id } = await params
    await service.softDelete(id, companyId)
    return deletedResponse()
  } catch (error) {
    return handleApiError(error)
  }
}
```

### **4. Page Pattern**

```typescript
// Listagem
export default function EntityPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [entities, setEntities] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ search, page: page.toString(), pageSize: "20", status: "ativos" })
    fetch(`/api/<entity>?${params}`)
      .then(res => res.json())
      .then(data => {
        setEntities(data.data || [])
        setPagination(data.pagination)
        setLoading(false)
      })
      .catch(err => {
        toast.error("Erro ao carregar")
        setLoading(false)
      })
  }, [search, page])

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza?")) return
    try {
      const res = await fetch(`/api/<entity>/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      toast.success("Deletado com sucesso!")
      setPage(1)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header com botão Novo */}
      {/* Summary Cards */}
      {/* SearchBar */}
      {loading && <Loader2 />}
      {!loading && entities.length === 0 && <EmptyState />}
      {!loading && entities.length > 0 && <Cards />}
      {pagination && <Pagination />}
    </div>
  )
}
```

---

## 🚀 COMANDOS ÚTEIS

```bash
# Servidor de desenvolvimento
npm run dev

# Build de produção
npm run build

# Gerar types do Prisma
npx prisma generate

# Ver banco de dados
npx prisma studio

# Migrations
npx prisma migrate dev --name <nome>

# Git
git status
git add .
git commit -m "feat: <mensagem>"
git push
```

---

## 📝 NOTAS IMPORTANTES

### **Prisma Schema**
O schema Prisma já existe e está completo com:
- User, Company, Branch (multi-tenancy)
- Customer (clientes)
- Product, ProductCategory, ProductBrand, etc (produtos)
- Sale, SaleItem, Payment (vendas)
- ServiceOrder, ServiceOrderItem (OS)
- CashRegister, CashTransaction (caixa)

### **Autenticação**
- NextAuth v5 (beta.30) com strategy JWT
- PrismaAdapter comentado (conflito de tipos)
- Auth Mock ativo apenas se `AUTH_MOCK=true` no .env
- Mock user: admin@pdvotica.com / admin123

### **Banco de Dados**
- PostgreSQL na Neon
- Variáveis: `DATABASE_URL` e `DIRECT_URL` no .env
- Usar `DIRECT_URL` para migrations

### **Fixes Aplicados (Next.js 16)**
- Params são Promise: `const { id } = await params`
- ZodError usa `.issues` não `.errors`
- Decimal do Prisma precisa `Number()` em arithmetic

---

## 🎯 DEFINITION OF DONE - LOTE 2

Use a mesma checklist do Lote 1:

- [ ] CRUD completo funciona
- [ ] Validação Zod ativa
- [ ] Filtros e busca funcionam
- [ ] Paginação funciona
- [ ] Sem erros no build
- [ ] Loading/Empty/Error states
- [ ] Toast notifications
- [ ] Autenticação e RBAC aplicados
- [ ] Multi-tenancy (companyId)
- [ ] Soft delete implementado
- [ ] Responsivo (mobile/tablet/desktop)
- [ ] Transações Prisma (para vendas)
- [ ] Validações de negócio (estoque, pagamentos)

---

## 📞 CONTATO / DÚVIDAS

Se encontrar bugs ou tiver dúvidas ao retomar o desenvolvimento:

1. Verifique este arquivo (PROGRESSO_DESENVOLVIMENTO.md)
2. Consulte o BLUEPRINT_FUNCIONAL_PDV.md
3. Veja exemplos do Lote 1 (Clientes/Produtos)
4. Último commit: `ec52e3f`

**Status:** ✅ Sistema em estado estável, build passando, pronto para Lote 2

---

**Gerado em:** 04/02/2026
**Autor:** Claude Code Assistant
**Versão:** 1.0
