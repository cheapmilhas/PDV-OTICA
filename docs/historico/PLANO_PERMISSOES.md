# 📋 PLANO DE EXECUÇÃO - Sistema Granular de Permissões

## 🎯 OBJETIVO
Implementar sistema de permissões granulares por usuário que controla:
- Visualização de menus/páginas
- Acesso a funcionalidades específicas
- Botões de ação (criar, editar, excluir)
- Permissões customizáveis por usuário (além do role padrão)

---

## 📊 ANÁLISE DO SISTEMA ATUAL

### ✅ O que JÁ EXISTE:
1. **Enum UserRole** no schema.prisma:
   - ADMIN, GERENTE, VENDEDOR, CAIXA, ATENDENTE

2. **Sistema de Permissões** em `/src/lib/permissions.ts`:
   - 75 permissões definidas
   - Mapeamento por role (ROLE_PERMISSIONS)
   - Funções helper: `hasPermission()`, `hasAllPermissions()`, etc.

3. **Model User** com campo `role`:
   ```prisma
   role UserRole
   ```

### ❌ O que FALTA:
1. **Tabela de Permissões Customizadas** - para sobrescrever permissões do role padrão
2. **UI de Gestão de Permissões** - tela para editar permissões por usuário
3. **Middleware de Proteção** - proteger rotas/APIs baseado em permissões
4. **Components Condicionais** - esconder/mostrar baseado em permissões

---

## 🗄️ SCHEMA - Mudanças no Banco de Dados

### Nova Tabela: `UserPermission`
```prisma
model UserPermission {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  permission String  // Ex: "sales.create", "products.edit"
  granted    Boolean // true = permitido, false = negado (sobrescreve role)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, permission])
  @@index([userId])
}
```

### Atualização no Model User:
```prisma
model User {
  // ... campos existentes ...

  customPermissions UserPermission[] // Nova relação

  // ... relações existentes ...
}
```

---

## 🏗️ ARQUITETURA DA SOLUÇÃO

### 1. **Backend - Serviço de Permissões**
**Arquivo**: `/src/lib/permission-service.ts`

```typescript
class PermissionService {
  // Busca permissões efetivas (role + custom)
  async getUserPermissions(userId: string): Promise<string[]>

  // Verifica se usuário tem permissão
  async userHasPermission(userId: string, permission: string): boolean

  // Adiciona permissão custom
  async grantPermission(userId: string, permission: string): Promise<void>

  // Remove/nega permissão custom
  async revokePermission(userId: string, permission: string): Promise<void>

  // Reseta para permissões padrão do role
  async resetToRoleDefaults(userId: string): Promise<void>
}
```

**Lógica de Resolução**:
```
1. Buscar role do usuário
2. Carregar permissões padrão do role (ROLE_PERMISSIONS)
3. Buscar permissões customizadas do usuário (UserPermission)
4. Aplicar overrides:
   - Se UserPermission.granted = true → adiciona permissão
   - Se UserPermission.granted = false → remove permissão
5. Retornar lista final
```

---

### 2. **API Routes**

#### `/api/users/[id]/permissions` (GET)
```typescript
// Retorna permissões efetivas do usuário
{
  role: "VENDEDOR",
  rolePermissions: ["sales.create", "sales.view", ...],
  customPermissions: [
    { permission: "products.edit", granted: true },  // adicionada
    { permission: "sales.view_all", granted: false } // removida
  ],
  effectivePermissions: ["sales.create", "sales.view", "products.edit", ...]
}
```

#### `/api/users/[id]/permissions` (POST)
```typescript
// Adiciona ou remove permissão custom
{
  permission: "products.edit",
  granted: true // ou false para negar
}
```

#### `/api/users/[id]/permissions/reset` (POST)
```typescript
// Reseta para permissões padrão do role
// Remove todas as UserPermissions do usuário
```

---

### 3. **Frontend - UI de Gestão de Permissões**

#### Página: `/dashboard/usuarios/[id]/permissoes`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ 👤 Permissões de [Nome do Usuário]                  │
├─────────────────────────────────────────────────────┤
│ Perfil de acesso: [Vendedor ▼]                     │
│                                                     │
│ ⚠️ Permissões customizadas sobrescrevem o perfil   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🛍️ Vendas                           [±]     │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑ Criar vendas           (Padrão do perfil) │   │
│ │ ☑ Visualizar suas vendas (Padrão do perfil) │   │
│ │ ☐ Visualizar todas vendas                   │   │
│ │   [+ Adicionar permissão]                   │   │
│ │ ☑ Ver vendas canceladas                     │   │
│ │   [× Remover] (Customizado - adicionado)    │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 📦 Produtos                         [±]     │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑ Visualizar produtos    (Padrão do perfil) │   │
│ │ ☐ Cadastrar produtos                        │   │
│ │   [+ Adicionar permissão]                   │   │
│ │ ☑ Editar produtos                           │   │
│ │   [× Remover] (Customizado - adicionado)    │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 📊 Relatórios                       [±]     │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ☐ Relatórios de vendas                      │   │
│ │ ☐ Relatórios financeiros                    │   │
│ │ ☐ Relatórios de estoque                     │   │
│ │ ☐ Relatórios de clientes                    │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ [Resetar para Padrão do Perfil]  [Salvar Mudanças] │
└─────────────────────────────────────────────────────┘
```

**Estados Visuais**:
- ✅ Permissão concedida (padrão do role)
- ➕ Permissão adicionada manualmente (destaque verde)
- ➖ Permissão removida manualmente (destaque vermelho/tachado)
- ⬜ Permissão não concedida

---

### 4. **Middleware de Proteção de Rotas**

**Arquivo**: `/src/middleware/permissions.ts`

```typescript
export function requirePermission(permission: Permission) {
  return async (req: NextRequest) => {
    const session = await getServerSession()
    const userId = session.user.id

    const hasAccess = await PermissionService.userHasPermission(
      userId,
      permission
    )

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403 }
      )
    }
  }
}
```

**Uso em API Routes**:
```typescript
// /api/products/route.ts
export async function POST(req: NextRequest) {
  await requirePermission(Permission.PRODUCTS_CREATE)(req)

  // ... criar produto ...
}
```

---

### 5. **Components React Condicionais**

#### Hook: `usePermission()`
```typescript
// /src/hooks/usePermission.ts
export function usePermission(permission: Permission): boolean {
  const { user } = useSession()
  const { data: permissions } = useSWR(
    `/api/users/${user.id}/permissions`,
    fetcher
  )

  return permissions?.effectivePermissions.includes(permission)
}
```

#### Component: `<PermissionGuard>`
```typescript
// /src/components/permission-guard.tsx
export function PermissionGuard({
  permission,
  children,
  fallback = null
}: Props) {
  const hasPermission = usePermission(permission)

  if (!hasPermission) return fallback

  return <>{children}</>
}
```

**Uso**:
```typescript
<PermissionGuard permission={Permission.PRODUCTS_CREATE}>
  <Button>+ Novo Produto</Button>
</PermissionGuard>

<PermissionGuard permission={Permission.REPORTS_FINANCIAL}>
  <Link href="/relatorios/dre">DRE Gerencial</Link>
</PermissionGuard>
```

---

## 📝 ESCOPO DE IMPLEMENTAÇÃO

### ✅ FASE 1 - Backend (Fundação)
1. ✅ Criar migration para tabela `UserPermission`
2. ✅ Atualizar schema Prisma
3. ✅ Criar `PermissionService` completo
4. ✅ Criar API routes de permissões
5. ✅ Criar middleware de proteção

### ✅ FASE 2 - Frontend (UI de Gestão)
1. ✅ Criar página `/dashboard/usuarios/[id]/permissoes`
2. ✅ Componente de lista de permissões por módulo
3. ✅ Funcionalidade de adicionar/remover permissões
4. ✅ Função de resetar para padrão
5. ✅ Feedback visual de mudanças

### ✅ FASE 3 - Integração (Proteções)
1. ✅ Criar hook `usePermission()`
2. ✅ Criar component `<PermissionGuard>`
3. ✅ Proteger principais API routes
4. ✅ Aplicar guards em botões críticos
5. ✅ Aplicar guards em menus/navegação

---

## 🔒 CASOS DE USO EXEMPLOS

### Caso 1: Vendedor com acesso a Editar Produtos
```
Role: VENDEDOR (padrão não tem products.edit)
Admin adiciona permissão custom: products.edit = true

Resultado:
- Vendedor vê botão "Editar" na lista de produtos
- Vendedor consegue salvar alterações em produtos
- Vendedor NÃO vê "Excluir produtos" (não foi concedido)
```

### Caso 2: Gerente SEM acesso a Relatórios Financeiros
```
Role: GERENTE (padrão tem reports.financial)
Admin remove permissão custom: reports.financial = false

Resultado:
- Gerente NÃO vê menu "Relatórios Financeiros"
- Tentativa de acessar /relatorios/dre retorna 403
- Outros relatórios (vendas, estoque) continuam visíveis
```

### Caso 3: Caixa com Permissão de Ver Todas Vendas
```
Role: CAIXA (padrão não tem sales.view_all)
Admin adiciona: sales.view_all = true

Resultado:
- Caixa vê vendas de todos os vendedores
- Útil para caixa que precisa consultar vendas para pagamentos
```

---

## 🎨 MOCKUP DA TELA (ASCII)

```
╔══════════════════════════════════════════════════════════════╗
║ 👤 Gerenciar Permissões - Lucas Rebouças                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║ Perfil de acesso atual:  [Vendedor ▼]                       ║
║                                                              ║
║ ⚙️ Permissões customizadas para este usuário:               ║
║                                                              ║
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ║
║ ┃ 🛍️  VENDAS                                      [−]    ┃  ║
║ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫  ║
║ ┃ ✓  Criar vendas                  (Perfil padrão)      ┃  ║
║ ┃ ✓  Visualizar suas vendas        (Perfil padrão)      ┃  ║
║ ┃                                                        ┃  ║
║ ┃ ✓  Visualizar todas as vendas    ✨ CUSTOMIZADO       ┃  ║
║ ┃    └─ [× Remover esta permissão]                      ┃  ║
║ ┃                                                        ┃  ║
║ ┃ ✗  Cancelar vendas                                    ┃  ║
║ ┃    └─ [+ Adicionar esta permissão]                    ┃  ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  ║
║                                                              ║
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ║
║ ┃ 📦 PRODUTOS                                     [+]    ┃  ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  ║
║                                                              ║
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ║
║ ┃ 📊 RELATÓRIOS                                   [+]    ┃  ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  ║
║                                                              ║
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ║
║ ┃ 💰 FINANCEIRO                                   [+]    ┃  ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  ║
║                                                              ║
║                                                              ║
║  [⟲ Resetar para Padrão]         [💾 Salvar Mudanças]       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## ⚠️ CONSIDERAÇÕES IMPORTANTES

### 1. **NÃO INVENTAR NADA**
- ✅ Usar apenas permissões JÁ DEFINIDAS em `/src/lib/permissions.ts`
- ✅ Usar apenas roles JÁ EXISTENTES no schema
- ✅ Não criar novos campos no User (apenas nova tabela UserPermission)

### 2. **FUNCIONALIDADE GARANTIDA**
- ✅ Sistema será 100% funcional
- ✅ Sem afetar usuários existentes (se não tiver custom, usa padrão do role)
- ✅ Performance otimizada (índices no banco)
- ✅ Cache de permissões em sessão do usuário

### 3. **SEGURANÇA**
- ✅ Validação server-side em TODAS as APIs
- ✅ Não confiar em checks client-side
- ✅ Logs de auditoria quando permissões são alteradas
- ✅ Apenas ADMIN pode alterar permissões de outros usuários

---

## 📦 ENTREGÁVEIS

### Arquivos Criados:
1. `prisma/migrations/XXX_add_user_permissions.sql`
2. `src/lib/permission-service.ts`
3. `src/app/api/users/[id]/permissions/route.ts`
4. `src/app/(dashboard)/dashboard/usuarios/[id]/permissoes/page.tsx`
5. `src/hooks/usePermission.ts`
6. `src/components/permission-guard.tsx`
7. `src/middleware/require-permission.ts`

### Arquivos Modificados:
1. `prisma/schema.prisma` (adicionar UserPermission model)
2. `src/lib/permissions.ts` (adicionar funções de verificação com DB)

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Migration criada e testada
- [ ] PermissionService funcionando
- [ ] API routes testadas com Postman
- [ ] UI de permissões responsiva
- [ ] Hook usePermission retornando valores corretos
- [ ] Guards escondendo botões sem permissão
- [ ] Middleware bloqueando APIs sem permissão
- [ ] Testes com diferentes roles e permissões custom
- [ ] Documentação atualizada

---

## 🚀 TEMPO ESTIMADO

- **FASE 1 (Backend)**: 2-3 horas
- **FASE 2 (Frontend UI)**: 3-4 horas
- **FASE 3 (Integração)**: 2-3 horas
- **TOTAL**: 7-10 horas de desenvolvimento

---

## 📞 APROVAÇÃO NECESSÁRIA

**Aguardando aprovação do cliente para:**
1. ✅ Schema proposto (tabela UserPermission)
2. ✅ Layout da tela de gerenciamento
3. ✅ Escopo das 3 fases
4. ✅ Prioridade de quais módulos proteger primeiro

**Após aprovação, iniciar implementação imediatamente.**
