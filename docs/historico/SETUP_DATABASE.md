# Configuração do Banco de Dados

## Opções para Desenvolvimento Local

### Opção 1: Neon.tech (Recomendado - Gratuito)
PostgreSQL serverless gratuito na nuvem, sem necessidade de Docker.

1. Acesse: https://neon.tech
2. Crie uma conta gratuita
3. Crie um novo projeto: "pdv-otica"
4. Copie a connection string fornecida
5. Cole no arquivo `.env` na variável `DATABASE_URL`

### Opção 2: Supabase (Gratuito)
PostgreSQL gerenciado com dashboard completo.

1. Acesse: https://supabase.com
2. Crie uma conta
3. Crie um novo projeto
   - Nome: "pdv-otica"
   - Região: South America (São Paulo)
   - Senha forte para o banco
4. Vá em: Settings → Database → Connection String → URI
5. Copie a string e substitua `[YOUR-PASSWORD]` pela senha que você definiu
6. Cole no arquivo `.env`:
   ```
   DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   ```

### Opção 3: Docker (Se tiver Docker instalado)
```bash
docker run --name pdv-postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=pdv_otica -p 5432:5432 -d postgres:16-alpine
```

Então no `.env`:
```
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/pdv_otica"
```

### Opção 4: PostgreSQL Local (macOS)
```bash
# Instalar via Homebrew
brew install postgresql@16
brew services start postgresql@16

# Criar banco
createdb pdv_otica
```

Então no `.env`:
```
DATABASE_URL="postgresql://postgres@localhost:5432/pdv_otica"
```

## Após Configurar o Banco

Execute:
```bash
npx prisma generate
npx prisma db push
npm run prisma:seed
```
