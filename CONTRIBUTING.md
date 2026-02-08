# 🤝 Guia de Contribuição

Obrigado por considerar contribuir com o **PDV Ótica**! Este documento fornece diretrizes e boas práticas para garantir que suas contribuições sejam integradas de forma eficiente e mantendo a qualidade do projeto.

---

## 📋 Índice

1. [Como Contribuir](#como-contribuir)
2. [Reportar Bugs](#reportar-bugs)
3. [Sugerir Melhorias](#sugerir-melhorias)
4. [Processo de Pull Request](#processo-de-pull-request)
5. [Convenções de Código](#convenções-de-código)
6. [Convenções de Commit](#convenções-de-commit)
7. [Estrutura do Projeto](#estrutura-do-projeto)
8. [Testes](#testes)
9. [Documentação](#documentação)

---

## 🚀 Como Contribuir

### 1. Fork o Repositório

```bash
# Clone seu fork
git clone https://github.com/seu-usuario/PDV-OTICA.git
cd PDV-OTICA

# Adicione o repositório original como upstream
git remote add upstream https://github.com/original-owner/PDV-OTICA.git
```

### 2. Crie uma Branch

Use nomes descritivos para suas branches:

```bash
# Para novas funcionalidades
git checkout -b feature/nome-da-funcionalidade

# Para correções de bugs
git checkout -b fix/descricao-do-bug

# Para melhorias de documentação
git checkout -b docs/descricao-da-melhoria

# Para refatoração
git checkout -b refactor/descricao-da-refatoracao
```

### 3. Faça suas Alterações

- Siga as [Convenções de Código](#convenções-de-código)
- Mantenha commits pequenos e focados
- Escreva testes (quando aplicável)
- Atualize a documentação

### 4. Commit suas Mudanças

Siga as [Convenções de Commit](#convenções-de-commit):

```bash
git add .
git commit -m "feat: adicionar integração com API de CEP"
```

### 5. Push para seu Fork

```bash
git push origin feature/nome-da-funcionalidade
```

### 6. Abra um Pull Request

- Vá até o repositório original no GitHub
- Clique em **"New Pull Request"**
- Selecione sua branch
- Preencha o template de PR (veja abaixo)
- Aguarde review

---

## 🐛 Reportar Bugs

Antes de reportar um bug, verifique:
- ✅ Você está usando a versão mais recente?
- ✅ O bug já foi reportado? (veja Issues abertas)
- ✅ Você consegue reproduzir o bug consistentemente?

### Template de Reporte de Bug

```markdown
**Descrição do Bug**
Uma descrição clara e concisa do bug.

**Passos para Reproduzir**
1. Vá para '...'
2. Clique em '...'
3. Role até '...'
4. Veja o erro

**Comportamento Esperado**
O que deveria acontecer.

**Comportamento Atual**
O que realmente acontece.

**Screenshots**
Se aplicável, adicione screenshots.

**Ambiente**
- OS: [ex: macOS 13.1]
- Navegador: [ex: Chrome 120]
- Node.js: [ex: 20.10.0]
- Versão do PDV: [ex: 1.0.0]

**Contexto Adicional**
Qualquer outra informação relevante.
```

---

## 💡 Sugerir Melhorias

Tem uma ideia para melhorar o PDV Ótica? Siga este template:

```markdown
**Descrição da Melhoria**
Uma descrição clara e concisa da melhoria proposta.

**Problema que Resolve**
Por que essa melhoria é necessária? Qual problema ela resolve?

**Solução Proposta**
Como você imagina que essa melhoria funcionaria?

**Alternativas Consideradas**
Quais outras soluções você considerou?

**Impacto**
- [ ] Melhoria de UX
- [ ] Melhoria de Performance
- [ ] Nova Funcionalidade
- [ ] Outro: ___________

**Complexidade Estimada**
- [ ] Baixa (poucas horas)
- [ ] Média (alguns dias)
- [ ] Alta (semanas)
```

---

## 🔀 Processo de Pull Request

### Checklist de PR

Antes de enviar seu PR, certifique-se de:

- [ ] ✅ Código segue as [Convenções de Código](#convenções-de-código)
- [ ] ✅ Commits seguem [Conventional Commits](#convenções-de-commit)
- [ ] ✅ Build passa localmente (`npm run build`)
- [ ] ✅ Lint passa sem erros (`npm run lint`)
- [ ] ✅ Testes passam (se aplicável)
- [ ] ✅ Documentação atualizada (README, CHANGELOG, etc.)
- [ ] ✅ Branch está atualizada com `main`
- [ ] ✅ PR tem título descritivo
- [ ] ✅ PR inclui descrição clara das mudanças

### Template de Pull Request

```markdown
## Descrição

Descreva brevemente as mudanças feitas.

## Tipo de Mudança

- [ ] 🐛 Bug fix (correção de bug)
- [ ] ✨ Nova funcionalidade
- [ ] 🔨 Refatoração
- [ ] 📖 Documentação
- [ ] 🎨 UI/UX
- [ ] ⚡ Performance
- [ ] 🔒 Segurança

## Checklist

- [ ] Build passa localmente
- [ ] Lint passa sem erros
- [ ] Testes passam
- [ ] Documentação atualizada
- [ ] CHANGELOG.md atualizado

## Screenshots (se aplicável)

Adicione screenshots das mudanças visuais.

## Como Testar

1. Passo 1
2. Passo 2
3. Resultado esperado

## Issues Relacionadas

Fixes #123
Closes #456
```

### Revisão de Código

Seu PR será revisado por um mantenedor. Espere:
- Feedback construtivo sobre o código
- Solicitações de mudanças (se necessário)
- Aprovação e merge (quando tudo estiver ok)

**Tempo de resposta esperado**: 2-5 dias úteis

---

## 🏗️ Convenções de Código

### TypeScript

- ✅ **Sempre** use TypeScript (não JavaScript puro)
- ✅ Evite `any` - prefira tipos explícitos
- ✅ Use interfaces para objetos complexos
- ✅ Exporte tipos reutilizáveis de `src/types/`

**Exemplo**:
```typescript
// ❌ Evite
function createUser(data: any) {
  return data;
}

// ✅ Prefira
interface CreateUserDTO {
  name: string;
  email: string;
  role: UserRole;
}

function createUser(data: CreateUserDTO): Promise<User> {
  // ...
}
```

### React Components

- ✅ Use **function components** (não class components)
- ✅ Use hooks (useState, useEffect, etc.)
- ✅ Componentes pequenos e focados (Single Responsibility)
- ✅ Props tipadas com TypeScript

**Exemplo**:
```tsx
// ❌ Evite
export default function Component(props: any) {
  return <div>{props.title}</div>;
}

// ✅ Prefira
interface ComponentProps {
  title: string;
  onClose?: () => void;
}

export function Component({ title, onClose }: ComponentProps) {
  return (
    <div>
      <h1>{title}</h1>
      {onClose && <button onClick={onClose}>Fechar</button>}
    </div>
  );
}
```

### API Routes

- ✅ Use **Service Layer** para lógica de negócio
- ✅ Valide input com **Zod**
- ✅ Use funções auxiliares (`apiResponse`, `errorHandler`)
- ✅ Sempre extraia `companyId` da sessão (nunca do body)

**Exemplo**:
```typescript
// src/app/api/customers/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { apiResponse } from "@/lib/api-response";
import { customerService } from "@/services/customer.service";

const createCustomerSchema = z.object({
  name: z.string().min(3),
  cpf: z.string().length(11),
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return apiResponse.error("Unauthorized", 401);
    }

    const body = await req.json();
    const data = createCustomerSchema.parse(body);

    const customer = await customerService.create(data, session.user.companyId);

    return apiResponse.success(customer, 201);
  } catch (error) {
    return errorHandler(error);
  }
}
```

### Prisma / Banco de Dados

- ✅ **Sempre** use transações para operações críticas
- ✅ Inclua `companyId` em todos os queries multi-tenant
- ✅ Use soft delete quando possível (`deletedAt` ao invés de DELETE)
- ✅ Nomeie relacionamentos de forma clara

**Exemplo**:
```typescript
// ❌ Evite (sem transação, sem companyId)
const sale = await prisma.sale.create({ data: { total: 100 } });
await prisma.product.update({ where: { id: "123" }, data: { stock: 90 } });

// ✅ Prefira
await prisma.$transaction(async (tx) => {
  const sale = await tx.sale.create({
    data: {
      total: 100,
      companyId: session.user.companyId, // ✅ Multi-tenant
    },
  });

  await tx.product.update({
    where: { id: "123", companyId: session.user.companyId },
    data: { stock: { decrement: 10 } },
  });
});
```

### Estilo de Código

- ✅ Use **Prettier** para formatação (já configurado)
- ✅ Use **ESLint** para linting (`npm run lint`)
- ✅ Nomes em inglês para código, português para UI/UX
- ✅ Indentação: 2 espaços
- ✅ Aspas duplas para strings
- ✅ Ponto e vírgula no final das linhas

**Verificar antes de commitar**:
```bash
npm run lint        # Verificar linting
npm run build       # Verificar se build passa
```

---

## 📝 Convenções de Commit

Este projeto segue [Conventional Commits](https://www.conventionalcommits.org/).

### Formato

```
<tipo>(<escopo>): <descrição curta>

[corpo opcional]

[rodapé opcional]
```

### Tipos

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `feat` | Nova funcionalidade | `feat(pdv): adicionar suporte a PIX` |
| `fix` | Correção de bug | `fix(caixa): corrigir cálculo de troco` |
| `docs` | Mudanças em documentação | `docs(readme): atualizar guia de setup` |
| `style` | Formatação, ponto e vírgula | `style: formatar código com prettier` |
| `refactor` | Refatoração (sem mudar funcionalidade) | `refactor(api): extrair lógica para service` |
| `perf` | Melhoria de performance | `perf(queries): otimizar query de vendas` |
| `test` | Adicionar/corrigir testes | `test(sale): adicionar testes unitários` |
| `chore` | Tarefas de build, CI, etc. | `chore: atualizar dependências` |
| `ci` | Mudanças em CI/CD | `ci: adicionar GitHub Actions` |

### Escopos Comuns

- `pdv` - Ponto de Venda
- `caixa` - Controle de Caixa
- `clientes` - Gestão de Clientes
- `produtos` - Gestão de Produtos
- `ordens` - Ordens de Serviço
- `api` - API Routes
- `auth` - Autenticação
- `db` - Banco de Dados/Prisma

### Exemplos

```bash
# Nova funcionalidade
git commit -m "feat(pdv): adicionar desconto por item"

# Correção de bug
git commit -m "fix(caixa): corrigir validação de saldo negativo"

# Documentação
git commit -m "docs: atualizar README com instruções de deploy"

# Refatoração
git commit -m "refactor(api): extrair validação para helpers"

# Com corpo e rodapé
git commit -m "feat(relatorios): adicionar export para CSV

Implementa export de relatórios de vendas em formato CSV.
Usa biblioteca fast-csv para geração eficiente.

Closes #42"
```

---

## 📁 Estrutura do Projeto

Familiarize-se com a estrutura antes de contribuir:

```
PDV OTICA/
├── prisma/
│   ├── schema.prisma       # Schema do banco (49 models)
│   └── seed-mock.ts        # Seed de dados de exemplo
├── src/
│   ├── app/
│   │   ├── (auth)/         # Páginas de autenticação
│   │   ├── (dashboard)/    # Páginas protegidas do dashboard
│   │   └── api/            # API Routes (50+ endpoints)
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── layout/         # Layout components (Header, Sidebar)
│   │   └── shared/         # Components reutilizáveis
│   ├── lib/
│   │   ├── prisma.ts       # Prisma client singleton
│   │   ├── auth-helpers.ts # Helpers de autenticação
│   │   └── validations/    # Zod schemas
│   ├── services/           # Business logic (Service Layer)
│   ├── types/              # TypeScript types e interfaces
│   ├── auth.ts             # NextAuth config
│   └── middleware.ts       # Auth middleware
├── CHANGELOG.md            # Histórico de versões
├── CONTRIBUTING.md         # Este arquivo
└── README.md               # Documentação principal
```

### Onde Adicionar Código

| O quê | Onde |
|-------|------|
| Nova página | `src/app/(dashboard)/dashboard/` |
| Nova API | `src/app/api/` |
| Lógica de negócio | `src/services/` |
| Componente reutilizável | `src/components/shared/` |
| Validação Zod | `src/lib/validations/` |
| Type/Interface | `src/types/` |
| Model do banco | `prisma/schema.prisma` |

---

## 🧪 Testes

**Status atual**: ❌ 0% de cobertura (débito técnico)

**Roadmap**:
- Testes unitários (Vitest)
- Testes de integração (API Routes)
- Testes E2E (Playwright)

Quando implementado, todos os PRs deverão incluir testes.

---

## 📖 Documentação

### Quando Atualizar Documentação

- ✅ Ao adicionar nova funcionalidade → Atualizar README + CHANGELOG
- ✅ Ao adicionar nova API → Atualizar seção "API Reference" do README
- ✅ Ao corrigir bug → Adicionar ao CHANGELOG
- ✅ Ao mudar variáveis de ambiente → Atualizar tabela de env vars

### Arquivos de Documentação

- **README.md**: Guia principal (setup, uso, features)
- **CHANGELOG.md**: Histórico de versões
- **CONTRIBUTING.md**: Este arquivo (guia para contribuidores)
- **DOCUMENTACAO_360_PDV_OTICA_COMPLETA.md**: Documentação técnica completa

---

## ❓ Dúvidas?

Se tiver dúvidas sobre como contribuir:
1. Leia este guia novamente
2. Consulte o [README.md](./README.md)
3. Abra uma **Issue** com a tag `question`
4. Entre em contato com os mantenedores

---

## 📜 Código de Conduta

Este projeto adota um código de conduta baseado no [Contributor Covenant](https://www.contributor-covenant.org/). Esperamos que todos os contribuidores:

- ✅ Sejam respeitosos e inclusivos
- ✅ Aceitem críticas construtivas
- ✅ Foquem no que é melhor para a comunidade
- ❌ Não toleramos assédio, discriminação ou comportamento ofensivo

---

**Obrigado por contribuir!** 🎉

Sua ajuda é fundamental para tornar o PDV Ótica ainda melhor.

---

**Versão**: 1.0.0
**Última atualização**: 2026-02-07
