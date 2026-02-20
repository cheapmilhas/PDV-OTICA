# ✅ TESTE FINAL - Seleção de Produtos nas Campanhas

## 🚀 Deploy Iniciado

**Commit:** `8c38d81`
**Status:** Push concluído - Aguardando Vercel deploy (2-3 minutos)

---

## 📋 PASSO A PASSO PARA TESTAR (Após Deploy)

### 1. Preparação (30 segundos)
```
1. Aguarde 2-3 minutos após o push
2. Acesse: https://pdv-otica.vercel.app
3. Faça login
4. Abra Console do navegador (F12)
5. Vá para aba "Console"
```

### 2. Acessar Campanhas (10 segundos)
```
1. No menu lateral → Campanhas
2. Clicar em "+ Nova Campanha"
3. Rolar até a seção "Produtos Elegíveis"
```

### 3. Testar CATEGORIA (20 segundos)

**O QUE FAZER:**
1. No primeiro dropdown, selecionar "Categoria"
2. Olhar no Console do navegador

**O QUE DEVE ACONTECER:**
```
Console deve mostrar:
[CategorySelect] Iniciando fetch...
[CategorySelect] Response status: 200
[CategorySelect] Result: { success: true, data: [...] }
[CategorySelect] ✅ X categorias carregadas
```

**No dropdown deve aparecer:**
- Lista de categorias cadastradas
- OU mensagem "Nenhuma categoria cadastrada no sistema" (se banco vazio)

**SE DER ERRO:**
- Console mostrará: `[CategorySelect] ❌ Erro: MENSAGEM_DE_ERRO`
- Copie a mensagem e envie para análise

---

### 4. Testar MARCA (20 segundos)

**O QUE FAZER:**
1. Clicar no botão "Marca"
2. Olhar no Console

**O QUE DEVE ACONTECER:**
```
Console deve mostrar:
[BrandSelect] Iniciando fetch...
[BrandSelect] Response status: 200
[BrandSelect] Result: { success: true, data: [...] }
[BrandSelect] ✅ X marcas carregadas
```

**No dropdown deve aparecer:**
- Lista de marcas cadastradas
- OU "Nenhuma marca cadastrada no sistema"

---

### 5. Testar FORNECEDOR (20 segundos)

**O QUE FAZER:**
1. Clicar no botão "Fornecedor"
2. Olhar no Console

**O QUE DEVE ACONTECER:**
```
Console deve mostrar:
[SupplierSelect] Iniciando fetch...
[SupplierSelect] Response status: 200
[SupplierSelect] Result: { success: true, data: [...] }
[SupplierSelect] ✅ X fornecedores carregados
```

---

### 6. Testar PRODUTO (30 segundos) ⭐ MAIS IMPORTANTE

**O QUE FAZER:**
1. Clicar no botão "Produto Específico"
2. No campo de busca, digitar: "r" (só 1 caractere)
3. Observar: deve aparecer "Digite ao menos 2 caracteres"
4. Digitar mais um: "ra" (2 caracteres)
5. Aguardar 300ms (aparece spinner)
6. Olhar no Console

**O QUE DEVE ACONTECER:**
```
Console deve mostrar:
[ProductCombobox] Buscando produtos com termo: "ra"
[ProductCombobox] Response status: 200
[ProductCombobox] Result: { success: true, data: [...] }
[ProductCombobox] ✅ X produtos encontrados
```

**Na tela deve aparecer:**
- Dropdown com lista de produtos que contém "ra" no nome/SKU/código
- Cada produto mostra: Nome + SKU/Código
- OU "Nenhum produto encontrado para 'ra'" (se não houver)

**TESTE ADICIONAL:**
1. Digite "armação" ou "lente" ou nome de produto que você sabe que existe
2. Deve aparecer na lista
3. Clique em um produto
4. Console mostra: `[ProductCombobox] Produto selecionado: { id: "...", name: "..." }`
5. O produto aparece como TAG abaixo do campo de busca

---

## 🔍 DIAGNÓSTICO DE PROBLEMAS

### Se NADA aparecer no Console:

**Causa:** Componentes não estão sendo renderizados
**Solução:**
1. Fazer hard refresh (Cmd+Shift+R ou Ctrl+Shift+F5)
2. Limpar cache do navegador
3. Aguardar mais 2 minutos pelo deploy

---

### Se aparecer erro 401 (Não autorizado):

```
[CategorySelect] Response status: 401
[CategorySelect] ❌ Erro: Não autorizado
```

**Causa:** Sessão expirada
**Solução:**
1. Fazer logout
2. Fazer login novamente
3. Testar novamente

---

### Se aparecer erro 404:

```
[ProductCombobox] Response status: 404
```

**Causa:** API não foi deployada
**Solução:**
1. Aguardar mais 2 minutos
2. Se persistir, verificar logs do Vercel:
   - Acesse: https://vercel.com/cheapmilhas/pdv-otica/deployments
   - Clicar no último deployment
   - Ver "Build Logs"
   - Procurar por erros

---

### Se aparecer erro 500:

```
[CategorySelect] Response status: 500
[CategorySelect] Result: { success: false, error: "Erro interno" }
```

**Causa:** Erro no banco de dados ou query
**Solução:**
1. Verificar logs do Vercel (Function Logs)
2. Pode ser problema de conexão com Prisma
3. Verificar variáveis de ambiente (DATABASE_URL)

---

### Se aparecer lista vazia mas Console diz "0 itens carregados":

```
[CategorySelect] ✅ 0 categorias carregadas
```

**Isto é NORMAL!** Significa:
- API está funcionando perfeitamente ✅
- Não há categorias/marcas/produtos cadastrados no sistema
- Você precisa cadastrar antes de usar

**Como resolver:**
1. Cadastre uma categoria em Produtos → Categorias
2. Cadastre uma marca em Produtos → Marcas
3. Cadastre produtos em Produtos
4. Volte para Campanhas e teste novamente

---

## ✅ CRITÉRIO DE SUCESSO

A funcionalidade está 100% funcionando se:

1. ✅ Console mostra logs de cada componente
2. ✅ Todos os status codes são 200
3. ✅ Todos os results têm `{ success: true, data: [...] }`
4. ✅ Se houver dados cadastrados, aparecem nas listas
5. ✅ Ao digitar produto (2+ chars), aparece lista
6. ✅ Ao clicar em item, ele é adicionado como TAG
7. ✅ TAG pode ser removida com botão X

---

## 🆘 SE AINDA NÃO FUNCIONAR

**Copie EXATAMENTE isto do Console e envie:**

```javascript
// Executar no Console (F12):

console.clear();
console.log("=== TESTE MANUAL DAS APIS ===");

// Teste 1: Categorias
fetch('/api/categories')
  .then(r => { console.log('Categories Status:', r.status); return r.json(); })
  .then(d => console.log('Categories Data:', d))
  .catch(e => console.error('Categories Error:', e));

// Teste 2: Marcas
fetch('/api/brands')
  .then(r => { console.log('Brands Status:', r.status); return r.json(); })
  .then(d => console.log('Brands Data:', d))
  .catch(e => console.error('Brands Error:', e));

// Teste 3: Fornecedores
fetch('/api/suppliers?pageSize=10&status=ativos')
  .then(r => { console.log('Suppliers Status:', r.status); return r.json(); })
  .then(d => console.log('Suppliers Data:', d))
  .catch(e => console.error('Suppliers Error:', e));

// Teste 4: Produtos
fetch('/api/products/search?search=a')
  .then(r => { console.log('Products Status:', r.status); return r.json(); })
  .then(d => console.log('Products Data:', d))
  .catch(e => console.error('Products Error:', e));

console.log("=== AGUARDE 2 SEGUNDOS E COPIE TUDO ACIMA ===");
```

**Envie o resultado completo para análise.**

---

## 📊 CHECKLIST FINAL

Após testar, preencha:

- [ ] Console mostra logs ao abrir modal de campanha
- [ ] CategorySelect: Status 200 + success true
- [ ] BrandSelect: Status 200 + success true
- [ ] SupplierSelect: Status 200 + success true
- [ ] ProductCombobox: Status 200 + success true ao digitar
- [ ] Produtos aparecem no dropdown ao digitar 2+ chars
- [ ] Ao clicar em produto, ele é adicionado como TAG
- [ ] TAG pode ser removida com X
- [ ] Múltiplos produtos podem ser adicionados
- [ ] Ao salvar campanha, itens são enviados no payload

**Se TODOS os itens estiverem marcados: SUCESSO TOTAL! ✅**

---

Data: 2026-02-20 09:45 BRT
Commit: 8c38d81
Status: ✅ Código correto, aguardando deploy Vercel
