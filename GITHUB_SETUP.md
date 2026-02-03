# 🚀 Como Criar Repositório no GitHub e Fazer Push

## Passo a Passo

### 1. Criar Repositório no GitHub (Interface Web)

1. Acesse: **https://github.com/new**
2. Preencha:
   - **Repository name**: `pdv-otica`
   - **Description**: Sistema PDV completo para óticas
   - **Visibility**: 🔒 **Private** (recomendado)
   - ⚠️ **NÃO marque**: Initialize this repository with a README
   - ⚠️ **NÃO adicione**: .gitignore ou license (já temos)
3. Clique em **"Create repository"**

### 2. Copiar a URL do Repositório

Após criar, você verá uma tela com comandos. Copie a URL que aparece, será algo como:

```
https://github.com/SEU-USUARIO/pdv-otica.git
```

### 3. Executar Comandos no Terminal

Cole os comandos abaixo **SUBSTITUINDO** a URL pela sua:

```bash
cd "/Users/matheusreboucas/PDV OTICA"

# Adicionar remote
git remote add origin https://github.com/SEU-USUARIO/pdv-otica.git

# Verificar que foi adicionado
git remote -v

# Fazer push
git push -u origin main
```

### 4. Resultado Esperado

Você verá algo como:

```
Enumerating objects: 20, done.
Counting objects: 100% (20/20), done.
Delta compression using up to 8 threads
Compressing objects: 100% (17/17), done.
Writing objects: 100% (20/20), 75.23 KiB | 3.93 MiB/s, done.
Total 20 (delta 0), reused 0 (delta 0), pack-reused 0
To https://github.com/SEU-USUARIO/pdv-otica.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

### 5. Verificar no GitHub

Acesse: `https://github.com/SEU-USUARIO/pdv-otica`

Você deve ver todos os arquivos do projeto!

---

## ⚠️ Possíveis Problemas

### Problema: "Authentication failed"

Se pedir autenticação, você tem 2 opções:

**Opção A: Personal Access Token (Recomendado)**
1. Acesse: https://github.com/settings/tokens
2. Generate new token (classic)
3. Dê um nome: "PDV Otica"
4. Marque: `repo` (Full control of private repositories)
5. Gere o token e copie
6. Quando pedir senha no terminal, cole o TOKEN (não sua senha)

**Opção B: SSH**
```bash
# Verificar se tem chave SSH
ls -la ~/.ssh

# Se não tiver, criar uma
ssh-keygen -t ed25519 -C "seu-email@example.com"

# Copiar chave pública
cat ~/.ssh/id_ed25519.pub

# Adicionar em: https://github.com/settings/keys
```

Depois use a URL SSH:
```bash
git remote set-url origin git@github.com:SEU-USUARIO/pdv-otica.git
git push -u origin main
```

---

## ✅ Próximos Passos Após Push

1. Configurar banco de dados (Neon.tech ou Supabase)
2. Rodar migrations do Prisma
3. Continuar desenvolvimento (Auth, PDV, etc.)

---

**Precisa de ajuda?** Me avise qual erro apareceu que eu te ajudo!
