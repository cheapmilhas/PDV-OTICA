# ⚡ CONFIGURAR BANCO DE DADOS (2 MINUTOS)

## Opção A: Neon.tech (MAIS RÁPIDO - Recomendado)

### 1. Acesse e crie conta
https://neon.tech

### 2. Criar projeto
- Clique em "Create a project"
- Nome: `pdv-otica`
- Região: **US East** (ou mais próxima)
- Clique em "Create project"

### 3. Copiar Connection String
Após criar, você verá uma tela com:
```
postgresql://neondb_owner:XXX@ep-XXX.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 4. Colar no .env
Abra o arquivo `.env` e substitua a linha DATABASE_URL:

```env
DATABASE_URL="postgresql://neondb_owner:XXX@ep-XXX.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

### 5. PRONTO! Me avise que vou rodar as migrations

---

## Opção B: Supabase (Alternativa)

### 1. Acesse
https://supabase.com

### 2. Criar projeto
- New project
- Nome: `pdv-otica`
- Região: **South America (São Paulo)**
- Senha forte (anote!)

### 3. Copiar Connection String
Settings → Database → Connection String → URI

### 4. Colar no .env
```env
DATABASE_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

---

## ✅ Depois de configurar

**Me avise** que eu rodo automaticamente:
```bash
npx prisma db push
npx prisma db seed
```

E em 30 segundos o banco estará populado com dados realistas!