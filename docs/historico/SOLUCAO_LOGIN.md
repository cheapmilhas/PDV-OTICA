# 🔧 Solução Definitiva para o Problema de Login

## 🎯 Problema Identificado

**O que estava acontecendo:**
- O browser estava mantendo cookies da sessão do ADMIN mesmo depois do logout
- Quando você tentava fazer login como VENDEDOR, o NextAuth mantinha o token JWT antigo
- Por isso sempre abria como ADMIN

**Evidência nos logs:**
```
❌ Senha inválida para vendedor@pdvotica.com
✅ Login bem-sucedido: { name: 'Carlos Vendedor', email: 'vendedor@pdvotica.com', role: 'VENDEDOR' }
```
- Você fez login com a senha correta do VENDEDOR
- Mas o browser manteve a sessão do ADMIN

## ✅ Solução Implementada

### 1. **API de Limpeza de Sessão Melhorada**
`/api/auth/clear-session` agora:
- Deleta **TODOS** os cookies (não apenas os de auth)
- Redireciona automaticamente para o login
- Mostra no console quantos cookies foram deletados

### 2. **Botão "Limpar Sessão" na Página de Login**
Agora a tela de login tem um botão grande:
- **"Limpar Sessão Anterior"**
- Faz signOut + limpa cookies + recarrega página
- Use ANTES de fazer login com outro usuário

### 3. **Credenciais Visíveis**
A página de login agora mostra:
```
ADMIN:
admin@pdvotica.com / admin123

VENDEDOR:
vendedor@pdvotica.com / vendedor123
```

## 📝 Como Testar Agora

### **Passo 1: Abra a página de login**
```
http://localhost:3000/login
```

### **Passo 2: Clique em "Limpar Sessão Anterior"**
- Vai aparecer uma mensagem de confirmação
- A página vai recarregar automaticamente
- Todos os cookies foram deletados

### **Passo 3: Faça login como VENDEDOR**
```
Email: vendedor@pdvotica.com
Senha: vendedor123
```

### **Passo 4: Verifique que logou como VENDEDOR**
- No canto superior direito deve aparecer: **"Carlos Vendedor"**
- A role deve ser: **"VENDEDOR"**
- O botão "Permissões" NÃO deve aparecer na lista de funcionários

## 🧪 Teste de Permissões

Agora que consegue logar como VENDEDOR, teste:

1. **Ir para Vendas** (`/dashboard/vendas`)
   - ✅ Deve conseguir ver a página
   - ✅ Deve ver o botão "Nova Venda"

2. **Ir para Funcionários** (`/dashboard/funcionarios`)
   - ✅ Deve conseguir ver a lista
   - ❌ NÃO deve ver o botão "Permissões"

3. **Tentar acessar página de permissões diretamente**
   - Copie a URL de alguma permissão (ex: `/dashboard/funcionarios/xxx/permissoes`)
   - ❌ Deve ser redirecionado para `/dashboard` (middleware bloqueando)

## 🔄 Para Trocar de Usuário

**SEMPRE que quiser trocar de ADMIN para VENDEDOR (ou vice-versa):**

1. Clique em "Sair"
2. Na página de login, clique em **"Limpar Sessão Anterior"**
3. Faça login com o novo usuário

## 🐛 Se Ainda Não Funcionar

Se mesmo assim continuar abrindo como ADMIN:

### **Opção 1: Janela Anônima**
- Abra janela anônima (Ctrl+Shift+N ou Cmd+Shift+N)
- Acesse `http://localhost:3000`
- Faça login como vendedor

### **Opção 2: Limpar Cache do Browser Manualmente**
1. Abra DevTools (F12)
2. Application → Storage → Clear site data
3. Recarregue a página

### **Opção 3: Testar Credenciais Offline**
```bash
# Verifica se as credenciais estão corretas no banco
npx tsx scripts/test-login.ts vendedor@pdvotica.com vendedor123
```

Deve mostrar:
```
✅ SENHA CORRETA!
🎉 Login bem-sucedido!
   Você logaria como: Carlos Vendedor (VENDEDOR)
```

## 📊 Logs para Verificar

Quando você fizer login, o terminal do servidor vai mostrar:

```
✅ Login bem-sucedido: {
  name: 'Carlos Vendedor',
  email: 'vendedor@pdvotica.com',
  role: 'VENDEDOR'
}
```

Se aparecer `name: 'Admin Mock'`, significa que o browser ainda tem cache.

## 🎉 Próximos Passos

Depois que confirmar que o login está funcionando:

1. ✅ Testar todas as permissões do VENDEDOR
2. ✅ Aplicar proteções em outras páginas (Produtos, Clientes, etc.)
3. ✅ Testar com outros roles (GERENTE, CAIXA, ATENDENTE)

---

**⚠️ IMPORTANTE:** SEMPRE use o botão "Limpar Sessão Anterior" antes de trocar de usuário!
