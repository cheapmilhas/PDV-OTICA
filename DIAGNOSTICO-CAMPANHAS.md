# Diagnóstico: Problema na Seleção de Produtos nas Campanhas

## 🔴 Problema Reportado

A funcionalidade de seleção de produtos nas campanhas de bonificação não está funcionando em produção (Vercel).

**Sintomas:**
- Campo "Produto Específico" não retorna resultados ao digitar (ex: "RAY")
- Dropdowns de Categoria, Marca e Fornecedor não carregam opções
- Mensagem exibida: "Nenhum produto encontrado" ou lista vazia

## 📍 Localização do Código

### Componentes Criados (Frontend)
```
src/components/campaigns/
├── product-combobox.tsx      # Busca produtos com autocomplete
├── category-select.tsx        # Dropdown de categorias
├── brand-select.tsx          # Dropdown de marcas
└── supplier-select.tsx       # Dropdown de fornecedores
```

### Formulário Principal
```
src/app/(dashboard)/dashboard/campanhas/campaign-form.tsx
- Linha 378-466: Seção "Produtos Elegíveis"
```

### Endpoints de API (Backend)
```
src/app/api/
├── products/route.ts         # GET /api/products (já existia)
├── categories/route.ts       # GET /api/categories (CRIADO)
├── brands/route.ts          # GET /api/brands (CRIADO)
└── suppliers/route.ts       # GET /api/suppliers (já existia)
```

## 🔍 Análise Técnica

### 1. ProductCombobox (Busca de Produtos)

**Requisição esperada:**
```
GET /api/products?search=RAY&pageSize=50&status=ativos
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": [
    { "id": "xxx", "name": "Armação Ray-Ban XXX", "code": "RB123" }
  ]
}
```

**Possíveis causas do erro:**
- ❓ Endpoint retorna dados mas interface não renderiza
- ❓ Erro de autenticação (401)
- ❓ Erro de CORS
- ❓ Timeout na requisição
- ❓ Dados retornados em formato diferente

### 2. CategorySelect, BrandSelect, SupplierSelect

**Requisições esperadas:**
```
GET /api/categories
GET /api/brands
GET /api/suppliers?pageSize=1000&status=ativos
```

**Resposta esperada (categories/brands):**
```json
{
  "success": true,
  "data": [
    { "id": "xxx", "name": "Nome da Categoria/Marca" }
  ]
}
```

**Possíveis causas do erro:**
- ❓ Novos endpoints não foram deployed corretamente no Vercel
- ❓ Erro de build/compilação
- ❓ Cache do Vercel
- ❓ Arquivo não foi commitado/pushed

## 🧪 Como Testar Localmente

### 1. Verificar se endpoints funcionam

```bash
# Iniciar servidor de desenvolvimento
npm run dev

# Em outro terminal, testar endpoints (precisa estar logado no navegador)
# Abrir http://localhost:3000 e fazer login

# Abrir console do navegador e executar:
fetch('/api/categories').then(r => r.json()).then(console.log)
fetch('/api/brands').then(r => r.json()).then(console.log)
fetch('/api/products?search=ray&pageSize=10&status=ativos').then(r => r.json()).then(console.log)
fetch('/api/suppliers?pageSize=10&status=ativos').then(r => r.json()).then(console.log)
```

### 2. Verificar dados no banco

```bash
# Verificar se existem categorias cadastradas
npx prisma studio
# Abrir modelo "Category" e verificar se há registros

# Verificar se existem marcas
# Abrir modelo "Brand" e verificar se há registros

# Verificar se existem produtos
# Abrir modelo "Product" e verificar se há registros
```

### 3. Verificar console do navegador

1. Abrir DevTools (F12)
2. Ir para aba "Console"
3. Abrir modal de criar campanha
4. Selecionar "Categoria" no dropdown
5. Verificar se há erros no console

**Erros possíveis:**
```
- Network error: Failed to fetch
- 401 Unauthorized
- 404 Not Found
- TypeError: Cannot read property 'map' of undefined
```

## 🔧 Soluções Propostas

### Solução 1: Verificar Deploy no Vercel

```bash
# Verificar último commit
git log --oneline -5

# Verificar status do Vercel
# Acessar: https://vercel.com/cheapmilhas/pdv-otica/deployments
# Verificar se último deploy foi bem-sucedido
# Verificar logs de build
```

### Solução 2: Forçar Rebuild no Vercel

1. Acessar dashboard Vercel
2. Ir em "Deployments"
3. Clicar em "Redeploy" no último deployment
4. Marcar opção "Use existing Build Cache" como DESABILITADO
5. Aguardar novo deploy

### Solução 3: Verificar Estrutura de Pastas

```bash
# Verificar se arquivos existem
ls -la src/app/api/categories/route.ts
ls -la src/app/api/brands/route.ts

# Verificar se componentes existem
ls -la src/components/campaigns/
```

### Solução 4: Adicionar Logs de Debug

Editar `src/components/campaigns/category-select.tsx`:

```typescript
const fetchCategories = async () => {
  try {
    setLoading(true);
    console.log('🔍 Buscando categorias...');
    const response = await fetch("/api/categories");
    console.log('📡 Response status:', response.status);
    const result = await response.json();
    console.log('📦 Result:', result);

    if (result.success) {
      console.log('✅ Categorias carregadas:', result.data.length);
      setCategories(result.data || []);
    } else {
      console.error('❌ Erro na resposta:', result.error);
    }
  } catch (error) {
    console.error("❌ Erro ao buscar categorias:", error);
  } finally {
    setLoading(false);
  }
};
```

Fazer o mesmo para `brand-select.tsx`, `supplier-select.tsx` e `product-combobox.tsx`.

### Solução 5: Verificar Autenticação

Os endpoints usam `requireAuth()` que pode estar bloqueando em produção.

Testar se sessão está válida:
```typescript
// No console do navegador (após login)
fetch('/api/auth/session').then(r => r.json()).then(console.log)
```

## 📋 Checklist de Verificação

- [ ] Arquivos foram commitados corretamente
- [ ] Push foi feito para branch main
- [ ] Vercel detectou e fez deploy
- [ ] Deploy foi bem-sucedido (sem erros)
- [ ] Endpoints retornam dados quando testados localmente
- [ ] Existem dados no banco (categorias, marcas, produtos)
- [ ] Console do navegador não mostra erros
- [ ] Sessão de autenticação está válida
- [ ] Cache do navegador foi limpo

## 🚨 Informações para o Desenvolvedor

### Contexto do Problema

O sistema de campanhas de bonificação estava enviando `items: []` (array vazio), fazendo com que TODOS os produtos gerassem bônus. Isso foi corrigido adicionando uma UI para selecionar produtos específicos, categorias, marcas ou fornecedores.

### O Que Foi Implementado

1. ✅ 4 componentes de seleção (product/category/brand/supplier)
2. ✅ 2 novos endpoints de API (/api/categories, /api/brands)
3. ✅ Seção "Produtos Elegíveis" no formulário
4. ✅ Validação no backend (impede ativar campanha sem produtos)
5. ✅ Correção na lógica de filtro de itens elegíveis

### Commits Relevantes

```
33b355d - feat: Adiciona seleção de produtos nas campanhas de bonificação
3189daa - fix: Corrige busca de produtos no ProductCombobox
c31ad0b - feat: Adiciona endpoints de API para categorias e marcas
```

### Tecnologias Usadas

- Next.js 14 (App Router)
- Prisma ORM
- TypeScript
- Shadcn UI (Select, Command, Popover)
- Padrão de autenticação: `requireAuth()` + `getCompanyId()`

### Perguntas a Investigar

1. **Os endpoints estão acessíveis em produção?**
   - Testar: `https://pdv-otica.vercel.app/api/categories`
   - Testar: `https://pdv-otica.vercel.app/api/brands`

2. **O Vercel fez build dos novos arquivos?**
   - Verificar logs de build no dashboard Vercel
   - Procurar por "src/app/api/categories/route.ts" nos logs

3. **Há dados cadastrados no banco de produção?**
   - Verificar se existem categorias, marcas e produtos
   - Se banco estiver vazio, componentes vão mostrar listas vazias (correto)

4. **O problema é específico de produção ou ocorre em dev também?**
   - Testar localmente com `npm run dev`
   - Se funcionar local mas não em produção = problema de deploy

## 📞 Próximos Passos Sugeridos

1. **Investigação Inicial (5 min)**
   - Abrir console do navegador em produção
   - Verificar erros de rede/JavaScript
   - Testar endpoints diretamente via fetch()

2. **Se endpoints retornam 404** (10 min)
   - Verificar se arquivos existem no repositório
   - Forçar redeploy no Vercel
   - Verificar logs de build

3. **Se endpoints retornam dados mas UI não atualiza** (15 min)
   - Adicionar console.logs nos componentes
   - Verificar se useState está funcionando
   - Verificar se useEffect está sendo chamado

4. **Se tudo mais falhar** (30 min)
   - Comparar código local vs código em produção
   - Fazer deploy de teste em branch separada
   - Considerar problema de cache do Vercel

---

**Última atualização:** 2026-02-20 09:35 BRT
**Status:** Aguardando investigação
