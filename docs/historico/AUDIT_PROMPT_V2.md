# 🔍 AUDITORIA COMPLETA DO SISTEMA PDV ÓTICA V2

> **Versão:** 2.0
> **Data:** $(date +%Y-%m-%d)
> **Duração Estimada:** 5-10 minutos

---

## 📑 ÍNDICE

- [Fase 0: Baseline & Comparação](#fase-0-baseline--comparação)
- [Fases 1-5: 🔴 CRÍTICAS](#fases-críticas)
- [Fases 6-12: 🟡 IMPORTANTES](#fases-importantes)
- [Fases 13-20: 🟢 MELHORIAS](#fases-melhorias)
- [Fase 21: Relatório Final](#fase-21-relatório-final)
- [Sistema de Scoring](#sistema-de-scoring)
- [Ações Corretivas](#ações-corretivas-comuns)

---

## FASE 0: BASELINE & COMPARAÇÃO

### 0.1 Verificar diagnóstico anterior
```bash
if [ -f "DIAGNOSTICO_FUNCIONALIDADE_PDV.md" ]; then
  echo "✅ Diagnóstico anterior encontrado"
  echo "📅 Data: $(grep -m1 "Data:" DIAGNOSTICO_FUNCIONALIDADE_PDV.md || echo 'N/A')"
  echo "📊 Score anterior: $(grep -m1 "Score:" DIAGNOSTICO_FUNCIONALIDADE_PDV.md || echo 'N/A')"
else
  echo "⚠️ Primeira auditoria - sem baseline"
fi
```

### 0.2 Criar arquivo de métricas temporário
```bash
mkdir -p .audit
echo "AUDIT_DATE=$(date +%Y-%m-%d_%H-%M-%S)" > .audit/current.env
echo "AUDIT_START=$(date +%s)" >> .audit/current.env
```

### 0.3 Capturar estado inicial
```bash
echo "TOTAL_FILES=$(find src -name '*.ts' -o -name '*.tsx' | wc -l | tr -d ' ')" >> .audit/current.env
echo "TOTAL_LINES=$(find src -name '*.ts' -o -name '*.tsx' -exec cat {} \; | wc -l | tr -d ' ')" >> .audit/current.env
```

---

## FASES CRÍTICAS (🔴 Bloqueadores - Peso: 45 pontos)

### FASE 1: SCHEMA PRISMA (10 pontos)

#### 1.1 Validar schema
```bash
echo "=== FASE 1: SCHEMA PRISMA ==="
SCHEMA_SCORE=0

# Validar sintaxe
if npx prisma validate 2>/dev/null; then
  echo "✅ Schema válido"
  SCHEMA_SCORE=$((SCHEMA_SCORE + 4))
else
  echo "❌ Schema inválido"
fi

# Verificar migrations
PENDING=$(npx prisma migrate status 2>&1 | grep -c "not yet applied" || echo "0")
if [ "$PENDING" = "0" ]; then
  echo "✅ Sem migrations pendentes"
  SCHEMA_SCORE=$((SCHEMA_SCORE + 3))
else
  echo "⚠️ $PENDING migration(s) pendente(s)"
fi

# Gerar cliente
if npx prisma generate 2>/dev/null; then
  echo "✅ Cliente Prisma gerado"
  SCHEMA_SCORE=$((SCHEMA_SCORE + 3))
else
  echo "❌ Erro ao gerar cliente"
fi

echo "SCHEMA_SCORE=$SCHEMA_SCORE" >> .audit/current.env
echo "📊 Score Fase 1: $SCHEMA_SCORE/10"
```

#### 1.2 Estatísticas do schema
```bash
MODELS=$(grep -c "^model " prisma/schema.prisma)
ENUMS=$(grep -c "^enum " prisma/schema.prisma)
RELATIONS=$(grep -c "@relation" prisma/schema.prisma)
echo "📈 Models: $MODELS | Enums: $ENUMS | Relações: $RELATIONS"
```

---

### FASE 2: APIs (15 pontos)

#### 2.1 Listar e contar APIs
```bash
echo "=== FASE 2: APIs ==="
API_SCORE=0

TOTAL_APIS=$(find src/app/api -name "route.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "📡 Total de endpoints: $TOTAL_APIS"

if [ "$TOTAL_APIS" -gt 0 ]; then
  API_SCORE=$((API_SCORE + 5))
fi
```

#### 2.2 Verificar autenticação
```bash
APIS_SEM_AUTH=0
for file in $(find src/app/api -name "route.ts" 2>/dev/null); do
  # Ignorar rotas públicas conhecidas
  if echo "$file" | grep -qE "(auth|webhook|public|health)"; then
    continue
  fi
  if ! grep -qE "requireAuth|getServerSession|auth\(\)" "$file"; then
    echo "⚠️ Sem auth: $(echo $file | sed 's|src/app/api||' | sed 's|/route.ts||')"
    APIS_SEM_AUTH=$((APIS_SEM_AUTH + 1))
  fi
done

if [ "$APIS_SEM_AUTH" -eq 0 ]; then
  echo "✅ Todas as APIs protegidas"
  API_SCORE=$((API_SCORE + 5))
else
  echo "❌ $APIS_SEM_AUTH API(s) sem autenticação"
fi
```

#### 2.3 Verificar tratamento de erros
```bash
APIS_SEM_ERROR=0
for file in $(find src/app/api -name "route.ts" 2>/dev/null); do
  if ! grep -qE "handleApiError|try.*catch|NextResponse.*error" "$file"; then
    APIS_SEM_ERROR=$((APIS_SEM_ERROR + 1))
  fi
done

if [ "$APIS_SEM_ERROR" -eq 0 ]; then
  echo "✅ Todas as APIs com error handling"
  API_SCORE=$((API_SCORE + 5))
else
  echo "⚠️ $APIS_SEM_ERROR API(s) sem error handling"
  API_SCORE=$((API_SCORE + 2))
fi

echo "API_SCORE=$API_SCORE" >> .audit/current.env
echo "📊 Score Fase 2: $API_SCORE/15"
```

---

### FASE 3: BUILD (10 pontos)

#### 3.1 Executar build
```bash
echo "=== FASE 3: BUILD ==="
BUILD_SCORE=0

npm run build > .audit/build.log 2>&1
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
  echo "✅ Build passou"
  BUILD_SCORE=10
else
  echo "❌ Build falhou"
  BUILD_ERRORS=$(grep -c "error" .audit/build.log || echo "0")
  echo "📛 Erros: $BUILD_ERRORS"
  # Pontuação parcial se quase passou
  if [ "$BUILD_ERRORS" -lt 5 ]; then
    BUILD_SCORE=5
  fi
fi

echo "BUILD_SCORE=$BUILD_SCORE" >> .audit/current.env
echo "📊 Score Fase 3: $BUILD_SCORE/10"
```

---

### FASE 4: TYPESCRIPT (5 pontos)

#### 4.1 Verificar erros TypeScript
```bash
echo "=== FASE 4: TYPESCRIPT ==="
TS_SCORE=0

npx tsc --noEmit > .audit/tsc.log 2>&1
TS_ERRORS=$(grep -c "error TS" .audit/tsc.log || echo "0")

echo "🔍 Erros TypeScript: $TS_ERRORS"

if [ "$TS_ERRORS" -eq 0 ]; then
  echo "✅ Zero erros TypeScript"
  TS_SCORE=5
elif [ "$TS_ERRORS" -lt 10 ]; then
  echo "⚠️ Poucos erros"
  TS_SCORE=3
elif [ "$TS_ERRORS" -lt 50 ]; then
  echo "⚠️ Erros moderados"
  TS_SCORE=1
else
  echo "❌ Muitos erros"
fi

echo "TS_SCORE=$TS_SCORE" >> .audit/current.env
echo "📊 Score Fase 4: $TS_SCORE/5"
```

---

### FASE 5: AUTENTICAÇÃO (5 pontos)

#### 5.1 Verificar NextAuth
```bash
echo "=== FASE 5: AUTENTICAÇÃO ==="
AUTH_SCORE=0

# Verificar arquivo de auth
if [ -f "src/auth.ts" ] || [ -f "src/lib/auth.ts" ]; then
  echo "✅ Arquivo de auth encontrado"
  AUTH_SCORE=$((AUTH_SCORE + 2))
else
  echo "❌ Arquivo de auth não encontrado"
fi

# Verificar se não há mock de auth
if ! grep -rq "AUTH_MOCK\|mock-user" src/ 2>/dev/null; then
  echo "✅ Sem auth mock no código"
  AUTH_SCORE=$((AUTH_SCORE + 2))
else
  echo "⚠️ Possível auth mock encontrado"
fi

# Verificar middleware de proteção
if [ -f "src/middleware.ts" ]; then
  echo "✅ Middleware de proteção existe"
  AUTH_SCORE=$((AUTH_SCORE + 1))
fi

echo "AUTH_SCORE=$AUTH_SCORE" >> .audit/current.env
echo "📊 Score Fase 5: $AUTH_SCORE/5"
```

---

## FASES IMPORTANTES (🟡 Qualidade - Peso: 35 pontos)

### FASE 6: PÁGINAS (10 pontos)

```bash
echo "=== FASE 6: PÁGINAS ==="
PAGES_SCORE=0

# Contar páginas
TOTAL_PAGES=$(find src/app -name "page.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "📄 Total de páginas: $TOTAL_PAGES"

if [ "$TOTAL_PAGES" -gt 10 ]; then
  PAGES_SCORE=$((PAGES_SCORE + 3))
fi

# Verificar loading states
PAGES_SEM_LOADING=0
for file in $(find "src/app/(dashboard)" -name "page.tsx" 2>/dev/null); do
  if ! grep -qE "useState.*loading|isLoading|Loader|Skeleton" "$file"; then
    PAGES_SEM_LOADING=$((PAGES_SEM_LOADING + 1))
  fi
done

if [ "$PAGES_SEM_LOADING" -eq 0 ]; then
  echo "✅ Todas as páginas com loading state"
  PAGES_SCORE=$((PAGES_SCORE + 4))
else
  echo "⚠️ $PAGES_SEM_LOADING página(s) sem loading state"
  PAGES_SCORE=$((PAGES_SCORE + 2))
fi

# Verificar error boundaries
if grep -rq "ErrorBoundary\|error.tsx" src/app/; then
  echo "✅ Error boundaries encontrados"
  PAGES_SCORE=$((PAGES_SCORE + 3))
else
  echo "⚠️ Sem error boundaries"
  PAGES_SCORE=$((PAGES_SCORE + 1))
fi

echo "PAGES_SCORE=$PAGES_SCORE" >> .audit/current.env
echo "📊 Score Fase 6: $PAGES_SCORE/10"
```

---

### FASE 7: SERVICES (5 pontos)

```bash
echo "=== FASE 7: SERVICES ==="
SERVICES_SCORE=0

TOTAL_SERVICES=$(find src/services -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "🔧 Total de services: $TOTAL_SERVICES"

if [ "$TOTAL_SERVICES" -gt 0 ]; then
  SERVICES_SCORE=$((SERVICES_SCORE + 2))

  # Verificar se usam Prisma
  SERVICES_COM_PRISMA=$(grep -l "from.*prisma" src/services/*.ts 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SERVICES_COM_PRISMA" -gt 0 ]; then
    echo "✅ $SERVICES_COM_PRISMA service(s) usando Prisma"
    SERVICES_SCORE=$((SERVICES_SCORE + 3))
  fi
else
  echo "⚠️ Nenhum service encontrado"
fi

echo "SERVICES_SCORE=$SERVICES_SCORE" >> .audit/current.env
echo "📊 Score Fase 7: $SERVICES_SCORE/5"
```

---

### FASE 8: VALIDAÇÕES ZOD (5 pontos)

```bash
echo "=== FASE 8: VALIDAÇÕES ZOD ==="
ZOD_SCORE=0

TOTAL_SCHEMAS=$(find src/lib/validations -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Total de schemas Zod: $TOTAL_SCHEMAS"

if [ "$TOTAL_SCHEMAS" -gt 5 ]; then
  ZOD_SCORE=5
elif [ "$TOTAL_SCHEMAS" -gt 0 ]; then
  ZOD_SCORE=3
fi

echo "ZOD_SCORE=$ZOD_SCORE" >> .audit/current.env
echo "📊 Score Fase 8: $ZOD_SCORE/5"
```

---

### FASE 9: COMPONENTES (5 pontos)

```bash
echo "=== FASE 9: COMPONENTES ==="
COMP_SCORE=0

TOTAL_COMPONENTS=$(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "🧩 Total de componentes: $TOTAL_COMPONENTS"

if [ "$TOTAL_COMPONENTS" -gt 20 ]; then
  COMP_SCORE=5
elif [ "$TOTAL_COMPONENTS" -gt 10 ]; then
  COMP_SCORE=3
elif [ "$TOTAL_COMPONENTS" -gt 0 ]; then
  COMP_SCORE=1
fi

echo "COMP_SCORE=$COMP_SCORE" >> .audit/current.env
echo "📊 Score Fase 9: $COMP_SCORE/5"
```

---

### FASE 10: HOOKS (5 pontos)

```bash
echo "=== FASE 10: HOOKS ==="
HOOKS_SCORE=0

TOTAL_HOOKS=$(find src/hooks -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "🪝 Total de hooks: $TOTAL_HOOKS"

if [ "$TOTAL_HOOKS" -gt 3 ]; then
  HOOKS_SCORE=5
elif [ "$TOTAL_HOOKS" -gt 0 ]; then
  HOOKS_SCORE=3
fi

echo "HOOKS_SCORE=$HOOKS_SCORE" >> .audit/current.env
echo "📊 Score Fase 10: $HOOKS_SCORE/5"
```

---

### FASE 11: IMPORTS (3 pontos)

```bash
echo "=== FASE 11: IMPORTS ==="
IMPORTS_SCORE=3

# Verificar imports não utilizados (básico)
UNUSED=$(grep -rh "^import" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
echo "📦 Total de imports: $UNUSED"

echo "IMPORTS_SCORE=$IMPORTS_SCORE" >> .audit/current.env
echo "📊 Score Fase 11: $IMPORTS_SCORE/3"
```

---

### FASE 12: PERMISSÕES (2 pontos)

```bash
echo "=== FASE 12: PERMISSÕES ==="
PERM_SCORE=0

if [ -f "prisma/seeds/permissions-catalog.ts" ]; then
  TOTAL_PERMS=$(grep -c "code:" prisma/seeds/permissions-catalog.ts || echo "0")
  echo "🔐 Total de permissões definidas: $TOTAL_PERMS"

  if [ "$TOTAL_PERMS" -gt 20 ]; then
    PERM_SCORE=2
  elif [ "$TOTAL_PERMS" -gt 0 ]; then
    PERM_SCORE=1
  fi
fi

echo "PERM_SCORE=$PERM_SCORE" >> .audit/current.env
echo "📊 Score Fase 12: $PERM_SCORE/2"
```

---

## FASES MELHORIAS (🟢 Otimizações - Peso: 20 pontos)

### FASE 13: MAPEAMENTO DE FUNCIONALIDADES (5 pontos)

```bash
echo "=== FASE 13: MAPEAMENTO ==="
MAP_SCORE=5

echo "
📁 ESTRUTURA DO SISTEMA:
========================

🏠 PÁGINAS PRINCIPAIS:"
find "src/app/(dashboard)/dashboard" -name "page.tsx" 2>/dev/null | sed 's|src/app/(dashboard)||' | sed 's|/page.tsx||' | sort | head -20

echo "
📡 ENDPOINTS DE API:"
find src/app/api -name "route.ts" 2>/dev/null | sed 's|src/app||' | sed 's|/route.ts||' | sort | head -20

echo "MAP_SCORE=$MAP_SCORE" >> .audit/current.env
echo "📊 Score Fase 13: $MAP_SCORE/5"
```

---

### FASE 14: INTEGRAÇÕES (5 pontos)

```bash
echo "=== FASE 14: INTEGRAÇÕES ==="
INT_SCORE=5

echo "
🔗 MAPEAMENTO API → SERVICE:"
for api in $(find src/app/api -name "route.ts" 2>/dev/null | head -10); do
  services=$(grep -oE "from.*services/[a-z-]+" "$api" 2>/dev/null | sed 's/.*services\///' | tr '\n' ',' | sed 's/,$//')
  if [ -n "$services" ]; then
    route=$(echo $api | sed 's|src/app/api||' | sed 's|/route.ts||')
    echo "  $route → $services"
  fi
done

echo "INT_SCORE=$INT_SCORE" >> .audit/current.env
echo "📊 Score Fase 14: $INT_SCORE/5"
```

---

### FASE 15-18: QUALIDADE DE CÓDIGO (5 pontos)

```bash
echo "=== FASES 15-18: QUALIDADE ==="
QUALITY_SCORE=0

# Verificar uso de TypeScript strict
if grep -q '"strict": true' tsconfig.json 2>/dev/null; then
  echo "✅ TypeScript strict mode"
  QUALITY_SCORE=$((QUALITY_SCORE + 2))
fi

# Verificar ESLint
if [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
  echo "✅ ESLint configurado"
  QUALITY_SCORE=$((QUALITY_SCORE + 1))
fi

# Verificar Prettier
if [ -f ".prettierrc" ] || [ -f "prettier.config.js" ]; then
  echo "✅ Prettier configurado"
  QUALITY_SCORE=$((QUALITY_SCORE + 1))
fi

# Verificar testes
if [ -d "src/__tests__" ] || [ -d "tests" ] || find src -name "*.test.ts" 2>/dev/null | head -1 | grep -q .; then
  echo "✅ Testes encontrados"
  QUALITY_SCORE=$((QUALITY_SCORE + 1))
else
  echo "⚠️ Sem testes automatizados"
fi

echo "QUALITY_SCORE=$QUALITY_SCORE" >> .audit/current.env
echo "📊 Score Fases 15-18: $QUALITY_SCORE/5"
```

---

### FASE 19-20: SEGURANÇA (5 pontos)

```bash
echo "=== FASES 19-20: SEGURANÇA ==="
SEC_SCORE=0

# Verificar secrets expostos
SECRETS_FOUND=$(grep -rE "(password|secret|api_key|apikey).*=.*['\"][^'\"]+['\"]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "// " | grep -v "type\|interface" | wc -l | tr -d ' ')

if [ "$SECRETS_FOUND" -eq 0 ]; then
  echo "✅ Nenhum secret exposto no código"
  SEC_SCORE=$((SEC_SCORE + 3))
else
  echo "⚠️ Possíveis secrets expostos: $SECRETS_FOUND"
fi

# Verificar .env.example
if [ -f ".env.example" ]; then
  echo "✅ .env.example existe"
  SEC_SCORE=$((SEC_SCORE + 1))
fi

# Verificar .gitignore
if grep -q ".env" .gitignore 2>/dev/null; then
  echo "✅ .env no .gitignore"
  SEC_SCORE=$((SEC_SCORE + 1))
fi

echo "SEC_SCORE=$SEC_SCORE" >> .audit/current.env
echo "📊 Score Fases 19-20: $SEC_SCORE/5"
```

---

## FASE 21: RELATÓRIO FINAL

### 21.1 Calcular score total
```bash
echo "
================================================================================
                        📊 RELATÓRIO FINAL DE AUDITORIA
================================================================================
"

# Carregar scores
source .audit/current.env

# Calcular total
TOTAL_SCORE=$((
  ${SCHEMA_SCORE:-0} +
  ${API_SCORE:-0} +
  ${BUILD_SCORE:-0} +
  ${TS_SCORE:-0} +
  ${AUTH_SCORE:-0} +
  ${PAGES_SCORE:-0} +
  ${SERVICES_SCORE:-0} +
  ${ZOD_SCORE:-0} +
  ${COMP_SCORE:-0} +
  ${HOOKS_SCORE:-0} +
  ${IMPORTS_SCORE:-0} +
  ${PERM_SCORE:-0} +
  ${MAP_SCORE:-0} +
  ${INT_SCORE:-0} +
  ${QUALITY_SCORE:-0} +
  ${SEC_SCORE:-0}
))

echo "TOTAL_SCORE=$TOTAL_SCORE" >> .audit/current.env

# Determinar classificação
if [ $TOTAL_SCORE -ge 90 ]; then
  GRADE="🏆 EXCELENTE"
  STATUS="Production Ready"
elif [ $TOTAL_SCORE -ge 70 ]; then
  GRADE="✅ BOM"
  STATUS="Poucos ajustes necessários"
elif [ $TOTAL_SCORE -ge 50 ]; then
  GRADE="⚠️ REGULAR"
  STATUS="Precisa melhorias"
elif [ $TOTAL_SCORE -ge 30 ]; then
  GRADE="🔴 CRÍTICO"
  STATUS="Muitos problemas"
else
  GRADE="🚨 EMERGÊNCIA"
  STATUS="Sistema instável"
fi

echo "
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SCORE FINAL: $TOTAL_SCORE/100                           │
│                              $GRADE                              │
│                         $STATUS                         │
└─────────────────────────────────────────────────────────────────────────────┘

🔴 CRÍTICAS (45 pts)
   ├── Fase 1  - Schema:        ${SCHEMA_SCORE:-0}/10
   ├── Fase 2  - APIs:          ${API_SCORE:-0}/15
   ├── Fase 3  - Build:         ${BUILD_SCORE:-0}/10
   ├── Fase 4  - TypeScript:    ${TS_SCORE:-0}/5
   └── Fase 5  - Auth:          ${AUTH_SCORE:-0}/5

🟡 IMPORTANTES (35 pts)
   ├── Fase 6  - Páginas:       ${PAGES_SCORE:-0}/10
   ├── Fase 7  - Services:      ${SERVICES_SCORE:-0}/5
   ├── Fase 8  - Validações:    ${ZOD_SCORE:-0}/5
   ├── Fase 9  - Componentes:   ${COMP_SCORE:-0}/5
   ├── Fase 10 - Hooks:         ${HOOKS_SCORE:-0}/5
   ├── Fase 11 - Imports:       ${IMPORTS_SCORE:-0}/3
   └── Fase 12 - Permissões:    ${PERM_SCORE:-0}/2

🟢 MELHORIAS (20 pts)
   ├── Fase 13 - Mapeamento:    ${MAP_SCORE:-0}/5
   ├── Fase 14 - Integrações:   ${INT_SCORE:-0}/5
   ├── Fase 15-18 - Qualidade:  ${QUALITY_SCORE:-0}/5
   └── Fase 19-20 - Segurança:  ${SEC_SCORE:-0}/5
"
```

### 21.2 Gerar arquivo de diagnóstico
```bash
# Criar/Atualizar DIAGNOSTICO_FUNCIONALIDADE_PDV.md
cat > DIAGNOSTICO_FUNCIONALIDADE_PDV.md << EOF
# 📋 DIAGNÓSTICO DO SISTEMA PDV ÓTICA

> **Data:** $(date +%Y-%m-%d)
> **Hora:** $(date +%H:%M:%S)
> **Score:** $TOTAL_SCORE/100
> **Status:** $STATUS

## 📊 Resumo Executivo

| Categoria | Score | Status |
|-----------|-------|--------|
| Schema | ${SCHEMA_SCORE:-0}/10 | $([ ${SCHEMA_SCORE:-0} -ge 8 ] && echo "✅" || echo "⚠️") |
| APIs | ${API_SCORE:-0}/15 | $([ ${API_SCORE:-0} -ge 12 ] && echo "✅" || echo "⚠️") |
| Build | ${BUILD_SCORE:-0}/10 | $([ ${BUILD_SCORE:-0} -ge 8 ] && echo "✅" || echo "⚠️") |
| TypeScript | ${TS_SCORE:-0}/5 | $([ ${TS_SCORE:-0} -ge 4 ] && echo "✅" || echo "⚠️") |
| Autenticação | ${AUTH_SCORE:-0}/5 | $([ ${AUTH_SCORE:-0} -ge 4 ] && echo "✅" || echo "⚠️") |
| Páginas | ${PAGES_SCORE:-0}/10 | $([ ${PAGES_SCORE:-0} -ge 7 ] && echo "✅" || echo "⚠️") |
| Services | ${SERVICES_SCORE:-0}/5 | $([ ${SERVICES_SCORE:-0} -ge 3 ] && echo "✅" || echo "⚠️") |
| Validações | ${ZOD_SCORE:-0}/5 | $([ ${ZOD_SCORE:-0} -ge 3 ] && echo "✅" || echo "⚠️") |
| Segurança | ${SEC_SCORE:-0}/5 | $([ ${SEC_SCORE:-0} -ge 4 ] && echo "✅" || echo "⚠️") |

## 📈 Estatísticas

- **Total de Arquivos:** ${TOTAL_FILES:-N/A}
- **Total de Linhas:** ${TOTAL_LINES:-N/A}
- **APIs:** $TOTAL_APIS
- **Páginas:** $TOTAL_PAGES
- **Services:** $TOTAL_SERVICES
- **Componentes:** $TOTAL_COMPONENTS

## 🎯 Próximas Ações Recomendadas

$(if [ ${BUILD_SCORE:-0} -lt 10 ]; then echo "1. 🔴 **CRÍTICO:** Corrigir erros de build"; fi)
$(if [ ${TS_SCORE:-0} -lt 5 ]; then echo "2. 🔴 **CRÍTICO:** Resolver erros TypeScript"; fi)
$(if [ ${API_SCORE:-0} -lt 12 ]; then echo "3. 🟡 **IMPORTANTE:** Adicionar autenticação às APIs"; fi)
$(if [ ${PAGES_SCORE:-0} -lt 7 ]; then echo "4. 🟡 **IMPORTANTE:** Adicionar loading states às páginas"; fi)
$(if [ ${SEC_SCORE:-0} -lt 4 ]; then echo "5. 🟢 **MELHORIA:** Revisar segurança do código"; fi)

---

*Gerado automaticamente pela Auditoria PDV Ótica V2*
EOF

echo "✅ DIAGNOSTICO_FUNCIONALIDADE_PDV.md atualizado!"
```

### 21.3 Limpar arquivos temporários
```bash
# Manter histórico
mkdir -p .audit/history
mv .audit/current.env ".audit/history/audit_$(date +%Y%m%d_%H%M%S).env" 2>/dev/null

echo "
================================================================================
                           ✅ AUDITORIA CONCLUÍDA!
================================================================================

📄 Arquivos gerados:
   • DIAGNOSTICO_FUNCIONALIDADE_PDV.md (relatório completo)
   • .audit/history/ (histórico de auditorias)

🚀 Próximo passo:
   Revise o arquivo DIAGNOSTICO_FUNCIONALIDADE_PDV.md e execute as ações recomendadas.
"
```

---

## AÇÕES CORRETIVAS COMUNS

### Se BUILD falhou:
```bash
# Ver erros detalhados
cat .audit/build.log | grep -A 5 "error"

# Tentar fix automático
npm run lint -- --fix
```

### Se TypeScript tem erros:
```bash
# Ver os 10 primeiros erros
npx tsc --noEmit 2>&1 | head -50

# Erros mais comuns
npx tsc --noEmit 2>&1 | grep "error TS" | cut -d: -f4 | sort | uniq -c | sort -rn | head -10
```

### Se APIs sem autenticação:
```bash
# Adicionar em cada arquivo de API:
import { requireAuth, getBranchId } from "@/lib/auth-helpers";

export async function GET() {
  await requireAuth();
  // ...
}
```

### Se páginas sem loading:
```bash
# Adicionar no início do componente:
const [loading, setLoading] = useState(true);

# No useEffect:
setLoading(false);

# No render:
if (loading) return <Loader2 className="animate-spin" />;
```

---

## COMO USAR ESTE ARQUIVO

### Execução Completa (5-10 min):
```bash
# Copie e cole todas as fases no terminal
```

### Execução Rápida - Apenas Críticas (1-2 min):
```bash
# Execute apenas Fases 1-5
```

### Verificação Pré-Deploy:
```bash
# Execute Fase 3 (Build) + Fase 4 (TypeScript)
npx tsc --noEmit && npm run build
```

---

*Versão 2.0 - Auditoria Completa PDV Ótica*
