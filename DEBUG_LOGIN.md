# 🔍 Debug do Problema de Login

## ❓ Problema Relatado
Ao fazer login com credenciais de VENDEDOR, está entrando como ADMIN.

## ✅ Usuários Existentes no Banco

```
ADMIN:
  • Email: admin@pdvotica.com
  • Senha: admin123
  • Role: ADMIN

VENDEDOR:
  • Email: vendedor@pdvotica.com
  • Senha: vendedor123
  • Role: VENDEDOR
```

## 🔧 Soluções para Testar

### **1. Limpar Cache do Browser (RECOMENDADO)**

**Opção A - Janela Anônima:**
1. Abra uma janela anônima/privada (Ctrl+Shift+N ou Cmd+Shift+N)
2. Acesse `http://localhost:3000`
3. Faça login com `vendedor@pdvotica.com` / `vendedor123`
4. Verifique se logou como VENDEDOR

**Opção B - Limpar Cookies Manualmente:**
1. Abra DevTools (F12)
2. Vá em "Application" → "Cookies" → `http://localhost:3000`
3. Delete TODOS os cookies
4. Recarregue a página (F5)
5. Faça login novamente

**Opção C - Via API:**
1. Abra uma nova aba
2. Acesse: `http://localhost:3000/api/auth/clear-session`
3. Volte para a página de login
4. Faça login novamente

### **2. Verificar Logs do Servidor**

Agora quando você fizer login, o terminal do servidor vai mostrar:

```
✅ Login bem-sucedido: {
  name: 'Carlos Vendedor',
  email: 'vendedor@pdvotica.com',
  role: 'VENDEDOR'
}
```

**Como verificar:**
1. Olhe o terminal onde o `npm run dev` está rodando
2. Faça o login
3. Veja qual usuário aparece no log

### **3. Verificar Sessão Atual**

Adicione este código em qualquer página para ver quem está logado:

```tsx
import { useSession } from "next-auth/react";

function DebugUser() {
  const { data: session } = useSession();

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-black text-white rounded-lg">
      <p>Nome: {session?.user?.name}</p>
      <p>Email: {session?.user?.email}</p>
      <p>Role: {session?.user?.role}</p>
    </div>
  );
}
```

## 🧪 Teste Passo a Passo

1. **Limpe a sessão:**
   - Acesse: `http://localhost:3000/api/auth/clear-session`
   - OU use janela anônima

2. **Faça logout completo:**
   - Clique em "Sair" no sistema
   - Aguarde voltar para a tela de login

3. **Faça login como VENDEDOR:**
   - Email: `vendedor@pdvotica.com`
   - Senha: `vendedor123`

4. **Verifique o que aconteceu:**
   - Olhe o terminal do servidor
   - Veja qual usuário aparece no log
   - Verifique no canto superior direito qual nome aparece

## 🐛 Se Ainda Não Funcionar

1. **Verifique os logs do servidor**
   - O que aparece no terminal quando você faz login?
   - Aparece "Login bem-sucedido" com qual role?

2. **Teste a senha do vendedor:**
   ```bash
   # Execute este comando para testar a senha
   npx tsx scripts/list-users.ts
   ```

3. **Recrie o usuário vendedor:**
   Se necessário, podemos recriar o usuário vendedor do zero.

## 📋 Credenciais para Teste

| Cargo | Email | Senha | Esperado |
|-------|-------|-------|----------|
| ADMIN | admin@pdvotica.com | admin123 | Ver tudo |
| VENDEDOR | vendedor@pdvotica.com | vendedor123 | Ver apenas vendas |

## 🎯 Comportamento Esperado

**Quando logar como VENDEDOR:**
- ✅ Nome: "Carlos Vendedor"
- ✅ Role: "VENDEDOR"
- ✅ Botão "Permissões" NÃO aparece na lista de funcionários
- ✅ Não consegue acessar `/dashboard/funcionarios/[id]/permissoes`
- ✅ Botão "Nova Venda" aparece (tem permissão `sales.create`)

**Quando logar como ADMIN:**
- ✅ Nome: "Admin Mock"
- ✅ Role: "ADMIN"
- ✅ Botão "Permissões" aparece na lista de funcionários
- ✅ Consegue acessar tudo
