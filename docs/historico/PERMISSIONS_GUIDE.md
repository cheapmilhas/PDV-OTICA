# Guia de Aplicação de Permissões

Este documento contém exemplos práticos de como aplicar o sistema de permissões no PDV Ótica.

## 📚 Componentes Disponíveis

### 1. `usePermissions()` - Hook
```tsx
import { usePermissions } from "@/hooks/usePermissions";

const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();

if (hasPermission('sales.create')) {
  // Mostrar botão
}
```

### 2. `<ProtectedAction>` - Para Ações/Botões
```tsx
import { ProtectedAction } from "@/components/auth/ProtectedAction";

// Ocultar botão
<ProtectedAction permission="sales.create">
  <Button>Nova Venda</Button>
</ProtectedAction>

// Desabilitar botão
<ProtectedAction permission="sales.delete" fallbackMode="disable">
  <Button>Excluir</Button>
</ProtectedAction>

// Mostrar mensagem
<ProtectedAction permission="reports.sales" fallbackMode="message">
  <RelatorioContent />
</ProtectedAction>
```

### 3. `<ProtectedRoute>` - Para Páginas Inteiras
```tsx
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function VendasPage() {
  return (
    <ProtectedRoute permission="sales.view">
      <VendasContent />
    </ProtectedRoute>
  );
}
```

## 🗺️ Mapeamento de Páginas → Permissões

### Dashboard
- **Página**: `/dashboard`
- **Permissão**: `dashboard.view`
- **Ação**: Adicionar `<ProtectedRoute>` na página

### Vendas
- **Página**: `/dashboard/vendas`
- **Permissão**: `sales.view`
- **Botão "Nova Venda"**: `sales.create`
- **Botão "Editar"**: `sales.edit`
- **Botão "Excluir"**: `sales.delete`
- **Botão "Detalhes"**: `sales.view`

### PDV
- **Página**: `/dashboard/pdv`
- **Permissão**: `sales.create`

### Orçamentos
- **Página**: `/dashboard/orcamentos`
- **Permissão**: `quotes.view`
- **Botão "Novo Orçamento"**: `quotes.create`
- **Botão "Editar"**: `quotes.edit`
- **Botão "Excluir"**: `quotes.delete`
- **Botão "Converter em Venda"**: `quotes.convert`

### Ordens de Serviço
- **Página**: `/dashboard/ordens-servico`
- **Permissão**: `service_orders.view`
- **Botão "Nova OS"**: `service_orders.create`
- **Botão "Editar"**: `service_orders.edit`
- **Botão "Excluir"**: `service_orders.delete`

### Caixa
- **Página**: `/dashboard/caixa`
- **Permissão**: `cash.view`
- **Botão "Abrir Caixa"**: `cash.open`
- **Botão "Fechar Caixa"**: `cash.close`
- **Botão "Sangria"**: `cash.withdrawal`
- **Botão "Suprimento"**: `cash.supply`
- **Histórico**: `cash.view`

### Contas a Receber
- **Página**: `/dashboard/financeiro` (tab receber)
- **Permissão**: `receivables.view`
- **Botão "Adicionar"**: `receivables.create`
- **Botão "Receber"**: `receivables.receive`
- **Botão "Editar"**: `receivables.edit`
- **Botão "Excluir"**: `receivables.delete`

### Contas a Pagar
- **Página**: `/dashboard/financeiro` (tab pagar)
- **Permissão**: `payables.view`
- **Botão "Adicionar"**: `payables.create`
- **Botão "Pagar"**: `payables.pay`
- **Botão "Editar"**: `payables.edit`
- **Botão "Excluir"**: `payables.delete`

### Produtos
- **Página**: `/dashboard/produtos`
- **Permissão**: `products.view`
- **Botão "Novo Produto"**: `products.create`
- **Botão "Editar"**: `products.edit`
- **Botão "Excluir"**: `products.delete`
- **Botão "Importar"**: `products.import`
- **Botão "Exportar"**: `products.export`

### Estoque
- **Página**: `/dashboard/estoque`
- **Permissão**: `stock.view`
- **Botão "Ajuste Manual"**: `stock.adjust`
- **Botão "Transferência"**: `stock.transfer`

### Clientes
- **Página**: `/dashboard/clientes`
- **Permissão**: `customers.view`
- **Botão "Novo Cliente"**: `customers.create`
- **Botão "Editar"**: `customers.edit`
- **Botão "Excluir"**: `customers.delete`
- **Botão "Importar"**: `customers.import`
- **Botão "Exportar"**: `customers.export`

### Fornecedores
- **Página**: `/dashboard/fornecedores`
- **Permissão**: `suppliers.view`
- **Botão "Novo Fornecedor"**: `suppliers.create`
- **Botão "Editar"**: `suppliers.edit`
- **Botão "Excluir"**: `suppliers.delete`
- **Botão "Importar"**: `suppliers.import`
- **Botão "Exportar"**: `suppliers.export`

### Funcionários/Usuários
- **Página**: `/dashboard/funcionarios`
- **Permissão**: `users.view`
- **Botão "Novo Usuário"**: `users.create`
- **Botão "Editar"**: `users.edit`
- **Botão "Ativar/Desativar"**: `users.toggle_active`
- **Botão "Excluir"**: `users.delete`
- **Botão "Permissões"**: `users.permissions` (ADMIN only)

### Relatórios
- **Página**: `/dashboard/relatorios`
- **Permissão**: `reports.view`
- **Vendas**: `reports.sales`
- **Comissões**: `reports.commissions`
- **Produtos Vendidos**: `reports.products_sold`
- **Posição Estoque**: `reports.stock_position`
- **Produtos Sem Giro**: `reports.no_rotation`
- **Contas a Receber**: `reports.receivables`
- **Contas a Pagar**: `reports.payables`
- **DRE**: `reports.dre`
- **Histórico Caixas**: `reports.cash_history`

### Metas
- **Página**: `/dashboard/metas`
- **Permissão**: `goals.view`
- **Botão "Nova Meta"**: `goals.create`
- **Botão "Editar"**: `goals.edit`
- **Botão "Excluir"**: `goals.delete`

### Configurações
- **Página**: `/dashboard/configuracoes`
- **Permissão**: `settings.view`
- **Editar Configurações**: `settings.edit`
- **Permissões do Sistema**: `settings.permissions` (ADMIN only)
- **Regras de Negócio**: `settings.rules`

## 📝 Exemplos Práticos de Implementação

### Exemplo 1: Proteger Página de Vendas

```tsx
// src/app/(dashboard)/dashboard/vendas/page.tsx
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function VendasPage() {
  return (
    <ProtectedRoute permission="sales.view">
      <VendasContent />
    </ProtectedRoute>
  );
}

function VendasContent() {
  return (
    <div>
      <h1>Vendas</h1>

      {/* Botão Nova Venda - só aparece se tiver permissão */}
      <ProtectedAction permission="sales.create">
        <Button onClick={() => router.push('/dashboard/pdv')}>
          Nova Venda
        </Button>
      </ProtectedAction>

      {/* Lista de vendas */}
      <VendasTable />
    </div>
  );
}
```

### Exemplo 2: Botões de Ação com Diferentes Comportamentos

```tsx
import { ProtectedAction } from "@/components/auth/ProtectedAction";

function VendaActions({ venda }) {
  return (
    <div className="flex gap-2">
      {/* Ocultar se não tiver permissão */}
      <ProtectedAction permission="sales.view">
        <Button variant="ghost" onClick={() => viewDetails(venda.id)}>
          <Eye className="h-4 w-4" />
        </Button>
      </ProtectedAction>

      {/* Desabilitar se não tiver permissão */}
      <ProtectedAction permission="sales.edit" fallbackMode="disable">
        <Button variant="ghost" onClick={() => editSale(venda.id)}>
          <Edit className="h-4 w-4" />
        </Button>
      </ProtectedAction>

      {/* Ocultar se não tiver permissão */}
      <ProtectedAction permission="sales.delete">
        <Button variant="ghost" onClick={() => deleteSale(venda.id)}>
          <Trash className="h-4 w-4" />
        </Button>
      </ProtectedAction>
    </div>
  );
}
```

### Exemplo 3: Múltiplas Permissões

```tsx
// Precisa ter TODAS as permissões
<ProtectedAction permission={["sales.create", "products.view"]}>
  <Button>Nova Venda</Button>
</ProtectedAction>

// Precisa ter ALGUMA das permissões
<ProtectedAction
  permission={["reports.sales", "reports.view"]}
  requireAny
>
  <RelatorioVendas />
</ProtectedAction>
```

### Exemplo 4: Usar Hook para Lógica Condicional

```tsx
import { usePermissions } from "@/hooks/usePermissions";

function ProductsPage() {
  const { hasPermission, hasAnyPermission } = usePermissions();

  // Lógica condicional
  const canExport = hasPermission('products.export');
  const canManage = hasAnyPermission(['products.edit', 'products.delete']);

  return (
    <div>
      {canExport && <ExportButton />}
      {canManage && <ManagementTools />}
    </div>
  );
}
```

## 🚀 Próximos Passos

1. ✅ Aplicar `<ProtectedRoute>` nas páginas principais
2. ✅ Aplicar `<ProtectedAction>` nos botões de ação
3. ✅ Testar com diferentes roles (VENDEDOR, CAIXA, GERENTE)
4. ✅ Ajustar mensagens de erro personalizadas
5. ✅ Documentar permissões específicas do negócio

## 🔒 Regras de Negócio

- **ADMIN**: Tem acesso a TUDO automaticamente
- **GERENTE**: Geralmente tem acesso a tudo exceto configurações críticas
- **VENDEDOR**: Acesso a vendas, produtos (view), clientes
- **CAIXA**: Acesso a caixa, recebimentos, vendas (view)
- **ATENDENTE**: Acesso a clientes, produtos (view), orçamentos

## 📊 Permissões por Cargo (Padrão)

Consulte o arquivo `prisma/seeds/permissions.seed.ts` para ver o mapeamento completo de permissões por cargo.
