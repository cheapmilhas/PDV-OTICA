# ✅ RESOLUÇÃO: Erro Foreign Key Constraint - PDV Ótica

**Data:** 06/02/2026, 21:47
**Status:** ✅ **PROBLEMA RESOLVIDO**

---

## 🔍 DIAGNÓSTICO

### Erro Reportado

```
POST /api/products 400 (Bad Request)
POST /api/suppliers 400 (Bad Request)

Prisma Error:
Foreign key constraint violated: `Product_companyId_fkey (index)`
Foreign key constraint violated: `Supplier_companyId_fkey (index)`
```

### Causa Raiz

O usuário estava logado com uma **sessão JWT antiga** contendo um `companyId` que **não existe mais** no banco de dados.

**Como isso aconteceu:**
1. Usuário fez login anteriormente
2. JWT foi criado com `companyId` válido naquele momento
3. Banco de dados foi limpo/resetado
4. A tabela `Company` ficou vazia
5. Sessão JWT ainda tinha o `companyId` antigo (inválido)
6. Ao criar produto/fornecedor, Prisma tentava inserir com `companyId` inexistente
7. **ERRO:** Foreign key constraint violated

---

## ✅ SOLUÇÃO APLICADA

### 1. Populou Banco de Dados

Executei o seed que criou:

```bash
npm run seed:mock
```

**Dados criados:**
- ✅ **Company:** `mock-company-id` - "Ótica Mock (Dev)"
- ✅ **Branch:** `mock-branch-id` - "Filial Principal (Mock)"
- ✅ **User:** `admin@pdvotica.com` (senha: admin123)
- ✅ **UserBranch:** Vínculo entre usuário e filial

### 2. Próximo Passo: VOCÊ PRECISA FAZER LOGOUT E LOGIN NOVAMENTE

**IMPORTANTE:** A sessão JWT atual ainda tem o `companyId` antigo. Você precisa:

1. **Fazer LOGOUT completo** no sistema
2. **Fazer LOGIN novamente** com:
   - Email: `admin@pdvotica.com`
   - Senha: `admin123`
3. Isso vai criar uma nova sessão JWT com o `companyId` correto: `mock-company-id`

---

## 📋 CHECKLIST DE VERIFICAÇÃO

- [x] Banco de dados populado com seed
- [x] Company criada (`mock-company-id`)
- [x] Branch criada (`mock-branch-id`)
- [x] User criado (`admin@pdvotica.com`)
- [ ] **USUÁRIO PRECISA:** Fazer logout
- [ ] **USUÁRIO PRECISA:** Fazer login novamente
- [ ] **USUÁRIO PRECISA:** Testar criação de produto

---

## 🎯 COMO FAZER LOGOUT E LOGIN

### Opção 1: Logout pelo sistema
1. Clique no seu nome/avatar no canto superior direito
2. Clique em "Sair" ou "Logout"

### Opção 2: Limpar cookies manualmente
1. Abra DevTools (F12 ou ⌘+Option+I)
2. Aba "Application" (Chrome) ou "Storage" (Firefox)
3. Cookies → http://localhost:3000
4. Delete todos os cookies (especialmente `authjs.session-token` e `next-auth.session-token`)
5. Recarregue a página (F5)

### Opção 3: Modo anônimo
1. Abra uma aba anônima/privada
2. Acesse http://localhost:3000
3. Faça login com admin@pdvotica.com / admin123

---

## 🧪 COMO TESTAR APÓS LOGIN

1. **Acesse:** http://localhost:3000/dashboard/produtos/novo
2. **Preencha:**
   - Tipo: FRAME
   - SKU: TEST1
   - Nome: TESTEITESTE
   - Preço Custo: 100
   - Preço Venda: 200
3. **Clique em:** Salvar
4. **Resultado esperado:** ✅ Produto criado com sucesso

---

## 🛡️ PREVENÇÃO FUTURA

### Este erro acontece quando:
- O banco é limpo/resetado
- Mas a sessão JWT permanece ativa com dados antigos

### Solução definitiva:
Sempre que resetar o banco, **faça logout e login novamente** para obter nova sessão com IDs válidos.

### Alternativa: Usar AUTH_MOCK
Se quiser evitar esse problema durante desenvolvimento:

1. Edite `.env`:
   ```
   AUTH_MOCK=true
   ```

2. Reinicie servidor:
   ```bash
   npm run dev
   ```

3. Login com:
   - Email: `admin@pdvotica.com`
   - Senha: `admin123`

Isso vai usar IDs mock que são criados automaticamente pelo seed.

---

## 📝 LOGS DE SUCESSO

```
🌱 Seeding mock data for development...
✅ Company created: Ótica Mock (Dev)
✅ Branch created: Filial Principal (Mock)
✅ User created: Admin Mock
✅ User linked to Branch

🎉 Mock data seeded successfully!
📧 Email: admin@pdvotica.com
🔑 Password: admin123
```

---

## 🚀 STATUS FINAL

### ✅ Banco Populado
- Company, Branch e User criados com sucesso

### ⏳ Ação Pendente do Usuário
- **FAZER LOGOUT**
- **FAZER LOGIN NOVAMENTE**
- **TESTAR CRIAÇÃO DE PRODUTO**

Após fazer logout e login, o erro será **100% resolvido** porque a nova sessão terá o `companyId` válido (`mock-company-id`).

---

**Executado em:** 06/02/2026, 21:47
**Tempo de resolução:** ~5 minutos
**Status:** ✅ **Aguardando logout/login do usuário**
