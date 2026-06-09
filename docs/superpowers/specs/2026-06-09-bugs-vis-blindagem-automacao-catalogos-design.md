# Bugs Vis — Blindagem, Automação de Setup e Catálogos de Marca

**Data:** 2026-06-09
**Branch:** `fix/bugs-vis-fase1`
**Status:** Design aprovado pelo dono (aguardando review da spec)

## Contexto

O dono reportou ~8 itens de bug/melhoria a partir do uso real do sistema (dogfood)
em produção (vis.app.br). As Fases 1–3 já foram commitadas (consertos do pop-up,
logout, impersonate, CNPJ, produtos de exemplo, erro de estoque) e a Fase 4
(resync manual + motor de email) também. Uma **auditoria adversarial** dos
consertos revelou que eles funcionam no caminho feliz, mas têm **furos em casos
de borda** e **não têm testes que impeçam a recorrência** — exatamente a
preocupação do dono: *"foi realmente consertado e estudado a fundo para não
acontecer de novo?"*.

Esta spec cobre três frentes, em ordem de prioridade:

- **Fase A — Blindagem:** corrigir os furos encontrados na auditoria + adicionar
  testes de regressão que travam a recorrência.
- **Fase B — Automação "correções chegam a todos":** mecanismo controlado pelo
  admin (tela + liga/desliga + simulação) que propaga melhorias de setup a TODAS
  as empresas automaticamente, sem apagar personalizações.
- **Fase C — Catálogos de marca:** estrutura para, no onboarding, oferecer o
  cadastro automático de lentes de marcas (Essilor/Zeiss/Hoya/SenseView) como
  produtos vendáveis (custo da tabela + preço sugerido = custo × 3, editável).

## Mapa: pedido do dono → cobertura

| # | Pedido do dono | Status atual | Esta spec |
|---|---|---|---|
| 1 | Pop-up "não saia" repetindo | 🟡 resolvido 80% (furo em anônimo/quota) | Fase A — blinda + teste |
| 2 | Logout vai pro domínio antigo | 🟠 resolvido 60% (NEXTAUTH_URL=localhost, fallback localhost) | Fase A — blinda + teste |
| 3 | "Acessar como empresa" abre a errada | 🟢 resolvido (risco: role/name mutam) | Fase A — fixa role/name + teste |
| 4 | CNPJ obrigatório sem aviso | 🟢 resolvido (risco: race sem findFirst) | Fase A — preventivo + teste |
| 5 | Produtos de exemplo com valores absurdos / "tem estoque mas dá erro" | 🟢 resolvido (caminho único confirmado) | Fase C reusa a engrenagem correta |
| 6 | Erro de estoque só no console | 🟢 resolvido 95% (override não propaga na conversão) | Fase A — propaga override + teste |
| 7 | PDF de lentes Essilor no sistema | ❌ não feito | Fase C (estrutura agora, dados quando houver os 4 PDFs) |
| 8 | Correções não chegam a todos os usuários | 🟡 parcial (resync manual existe) | Fase B — automação |

## Decisões do dono (travadas)

- **Nível de rigor:** blindagem total + testes (impedir recorrência).
- **Automação:** entra na MESMA spec; Onda 1 = financeiro + mensagens. Onda 2
  (permissões) fica documentada para depois, fora desta spec.
- **Sincronizar mensagens:** NUNCA sobrescrever personalização (só preenche vazio).
- **Disparo da automação:** cron diário de madrugada.
- **Controle da automação:** tela no admin (liga/desliga + ver relatórios), não
  variável de ambiente.
- **Essilor/marcas:** importar nome + custo, preço sugerido = custo × 3 (fixo na
  sugestão, editável por lente depois). Disponível como pergunta no onboarding do
  trial. Catálogo gerenciável por tela no admin. Iniciar só quando os 4 PDFs
  (Essilor, Zeiss, Hoya, SenseView) estiverem disponíveis — a estrutura é
  construída agora; os dados entram depois pela tela.

---

## Fase A — Blindagem dos consertos

Objetivo: transformar "funciona no caminho feliz" em "blindado + com rede de
testes". Cada item tem correção mínima e um teste que falha se o bug voltar.

### A1. Logout → domínio errado (PRIORIDADE — risco em produção)

**Furo:** `header.tsx` usa `window.location.origin` (ok), mas:
- `.env` tem `NEXTAUTH_URL="http://localhost:3000"` — se não for sobrescrito em
  prod, redirects relativos vão para localhost.
- `src/app/admin/logout/route.ts` tem fallback `process.env.NEXTAUTH_URL || "http://localhost:3000"`.
- Múltiplos pontos de logout (header, force-logout, login, admin) sem padrão único.

**Correção:**
1. Criar helper `doLogout()` em `src/lib/auth/logout.ts` que centraliza
   `signOut({ callbackUrl: \`${window.location.origin}/login\` })` para o app
   (NextAuth/cliente). Usar em todos os pontos de logout do app.
2. Remover o fallback `"http://localhost:3000"` de `admin/logout/route.ts`;
   se `NEXTAUTH_URL` não estiver setado, falhar de forma visível (log de erro),
   não redirecionar para localhost silenciosamente.
3. Adicionar `NEXTAUTH_URL=https://vis.app.br` ao checklist de deploy (documentar
   no `.env.example` que em prod DEVE ser o domínio público).

**Teste:** teste unitário/regressão que garante que o helper deriva a URL de
`window.location.origin` e que nenhum ponto de logout do app usa URL hardcoded
de domínio. Para o admin, teste que sem `NEXTAUTH_URL` o handler não cai em
localhost.

### A2. Pop-up exit-intent reaparece (anônimo / localStorage cheio)

**Furo:** em `src/hooks/use-exit-intent.ts`, se `localStorage.setItem` falhar
(quota/anônimo), o timestamp não grava e o pop-up reaparece em nova aba; e o
`catch` retornando `true` pode esconder o pop-up para sempre numa sessão.

**Correção:** após `setItem`, validar que a gravação funcionou (ler de volta).
Tratar indisponibilidade de localStorage de forma coerente: usar fallback em
memória no escopo da sessão para não reaparecer repetidamente nem sumir para
sempre por engano.

**Teste:** teste do hook simulando `localStorage` indisponível e quota excedida —
o pop-up não deve reaparecer em loop nem ser marcado incorretamente.

### A3. Impersonate — role/name ainda mutam

**Furo:** em `src/auth.ts`, a revalidação periódica do JWT já preserva
`companyId`/`branchId`/`networkId` durante impersonação, mas ainda sobrescreve
`token.role` e `token.name` do targetUser. Se o usuário-alvo for rebaixado, o
admin impersonador herda o novo role.

**Correção:** durante impersonação (`token.impersonation?.sessionId` presente),
NÃO sobrescrever `role`/`name` — tratá-los como imutáveis, igual ao companyId.
A empresa/identidade impersonada é fixada na criação da sessão.

**Teste:** simular revalidação do JWT durante impersonação com targetUser
rebaixado → `role`/`name` do token não mudam.

### A4. CNPJ — race em cadastros simultâneos

**Furo:** `customer.service.ts` faz checagem preventiva (findFirst) para CPF e
email, mas não para CNPJ — que depende só do índice único `@@unique([companyId, cnpj])`.
Dois cadastros simultâneos com o mesmo CNPJ passam o findFirst inexistente.

**Correção:** adicionar checagem preventiva de CNPJ duplicado (igual CPF/email),
mantendo a trava do índice único como defesa final. Normalizar o CNPJ (trim,
só dígitos) antes da checagem.

**Teste:** dois cadastros com o mesmo CNPJ → um sucede, o outro retorna erro
tratado e visível no campo (não erro genérico/500).

### A5. Override de gerente não propaga na conversão de orçamento

**Furo:** `quote.service.ts:convertToSale` chama `applyStockDebitInTx` sem passar
o `override`. Se o estoque mudou entre o PDV e a conversão, o gerente não
consegue autorizar a conversão (o override não chega ao débito).

**Correção:** propagar o `override` recebido na rota de conversão até o
`applyStockDebitInTx`, espelhando o que `sale.service.create` já faz.

**Teste:** conversão de orçamento sem estoque + override do gerente → a venda é
gravada (estoque negativo autorizado), igual ao fluxo do PDV.

### Resultado da Fase A

Os 6 consertos passam a ter correção de borda + teste de regressão. Validação
padrão do projeto: `tsc` limpo + suíte completa verde + build de produção OK
antes de cada commit.

---

## Fase B — Automação "correções chegam a todos"

Objetivo: quando o dono melhora um padrão do sistema, a melhoria alcança TODAS as
empresas automaticamente, toda madrugada, sem nunca apagar personalizações e sem
risco de derrubar o sistema. Controlado pelo dono via tela no admin.

### B1. Modelo de configuração — `AutoSyncConfig`

Novo model (migration aditiva), instância única:

```prisma
model AutoSyncConfig {
  id         String    @id @default("singleton")
  isEnabled  Boolean   @default(false)   // começa DESLIGADO
  dryRun     Boolean   @default(true)     // começa em SIMULAÇÃO
  lastRunAt  DateTime?
  updatedBy  String?
  updatedAt  DateTime  @updatedAt
}
```

### B2. Service central — `company-resync.service.ts`

Extrai a lógica que hoje vive no endpoint `/api/admin/companies/[id]/resync` para
um service reaproveitável:

```typescript
resyncCompanySetup(companyId, {
  actorType: "ADMIN_USER" | "SYSTEM",
  actorId?: string,
  dryRun?: boolean,
}): Promise<{ before, after, created, messagesFilled }>
```

- **Financeiro:** reusa `setupCompanyFinance` (idempotente por code/name; balance
  só no create; nunca mexe em saldos).
- **Mensagens:** reusa o backfill de `settings.service.ts` (`missingMessageTemplates`)
  — preenche SÓ os campos de mensagem que estão NULL. Se a empresa escreveu algo,
  NÃO toca.
- **dry-run:** quando `true`, calcula o que MUDARIA mas não grava nada (só relatório).
- O endpoint manual `/resync` passa a chamar este service (sem duplicar lógica).
  Os testes existentes do endpoint continuam válidos.

### B3. Cron diário — `sync-all-companies`

`src/app/api/cron/sync-all-companies/route.ts`, espelhando o padrão de
`recalcAllActiveHealthScores` (loop empresa-a-empresa com try/catch isolado):

- Autenticação por `CRON_SECRET` (Bearer), igual aos 6 crons existentes.
- Lê `AutoSyncConfig`: se `isEnabled=false` → no-op (loga e retorna). Se
  `dryRun=true` → só gera relatório. Se `dryRun=false` → aplica.
- Itera `prisma.company.findMany` (empresas ativas). Cada empresa em try/catch
  isolado: uma falha registra erro, pula, e continua nas outras.
- Acumula contadores (ok / sem-mudança / erro) e grava `lastRunAt`.
- Para cada empresa com mudança, grava `GlobalAudit` com `actorType: "SYSTEM"`,
  `action: "COMPANY_AUTO_SYNCED"`, metadata `{ before, after, created, dryRun }`.
- Registrado no `vercel.json` em horário livre: `0 4 * * *` (4h; 3/5/6/8/11h já
  estão ocupados).

### B4. Tela admin — `/admin/configuracoes/sincronizacao`

Segue o padrão `page.tsx` (server component + `requireAdminRole`) + `*-client.tsx`
(client component com `useTransition` + `router.refresh`):

- **Interruptor Ligado/Desligado** — salva em `AutoSyncConfig` na hora (PATCH),
  efeito instantâneo (sem deploy).
- **Seletor de modo** — Simulação / Aplicar de verdade.
- **Card da última execução** — `lastRunAt` + contadores (✅ OK / ⏭️ sem mudança
  / ❌ erro).
- **Lista do que mudou por empresa** — lida de `GlobalAudit` (action
  `COMPANY_AUTO_SYNCED`), últimos N registros.
- Item de menu novo em `admin-nav.tsx` (seção Configurações).
- API `src/app/api/admin/auto-sync/config/route.ts` (GET/PATCH) — só **SUPER_ADMIN**
  liga/desliga; grava `GlobalAudit` `AUTO_SYNC_TOGGLED` ao mudar.

### B5. As 4 travas de segurança

1. **Liga/desliga no banco** — instantâneo, sem redeploy.
2. **Dry-run por padrão** — começa só simulando; o dono lê os relatórios e só
   então vira para o modo real.
3. **Isolamento por empresa** — erro de uma não derruba as outras nem o sistema.
4. **Auditoria completa** — cada empresa sincronizada gera um registro
   consultável na tela.

### B6. Operação (como o dono usa)

```
Entrega: AutoSyncConfig isEnabled=false, dryRun=true.
1. Dono liga (isEnabled=true) → madrugada gera relatório do que MUDARIA.
2. Dono lê os relatórios alguns dias.
3. Confiou → muda para "Aplicar de verdade" (dryRun=false).
4. Qualquer susto → desliga o interruptor. Para na hora.
```

### Onda 2 (fora desta spec)

Sincronização de permissões/papéis: maior risco (mexe em quem-pode-o-quê). Regra
futura: só ADICIONA permissão a um papel, NUNCA remove. Cron/kill-switch próprios.
Documentado aqui, NÃO implementado nesta spec.

---

## Fase C — Catálogos de marca

Objetivo: no onboarding do trial, oferecer cadastro automático de lentes de marca
como produtos vendáveis. Estrutura construída agora; dados entram quando os 4 PDFs
estiverem disponíveis (decisão do dono: esperar as 4 marcas).

### C1. Modelo — `BrandCatalog` / `BrandCatalogItem`

Catálogo central (gerenciável pelo dono), migration aditiva:

```prisma
model BrandCatalog {
  id        String              @id @default(cuid())
  brand     String              @unique  // "ESSILOR" | "ZEISS" | "HOYA" | "SENSEVIEW"
  label     String                       // "Essilor"
  isActive  Boolean             @default(true)
  items     BrandCatalogItem[]
  updatedAt DateTime            @updatedAt
}

model BrandCatalogItem {
  id            String       @id @default(cuid())
  catalogId     String
  catalog       BrandCatalog @relation(fields: [catalogId], references: [id])
  name          String       // nome da lente
  cost          Decimal      // custo da tabela
  lensType      String?      // tipo (opcional)
  suggestedMultiplier Decimal @default(3)  // markup sugerido
  isActive      Boolean      @default(true)
}
```

### C2. Tela admin — `/admin/configuracoes/catalogos-marca`

Gerenciada pelo dono (sem programador):
- Lista marcas e suas lentes.
- Adiciona/edita/remove lente, ajusta custo e multiplicador.
- É onde o dono "cola" os dados dos PDFs quando os tiver.
- Só SUPER_ADMIN. Item de menu em `admin-nav.tsx`.

### C3. Pergunta no onboarding

No fluxo de trial, adicionar a pergunta:
```
Quer já cadastrar lentes destas marcas?
  ☐ Essilor   ☐ Zeiss   ☐ Hoya   ☐ SenseView
```
Para cada marca marcada, criar os produtos na ótica:
- `costPrice` = `cost` do item de catálogo.
- `salePrice` = `cost × suggestedMultiplier` (3 por padrão), **editável depois**.
- Estoque real via `atomicStockCredit` + `InventoryLot` — **reusando a engrenagem
  corrigida no item 5** para que os produtos nasçam certos e vendam sem erro.
- Idempotente (não duplica se rodar de novo).

### C4. Sequenciamento

A estrutura (banco + telas + engrenagem de importação) é construída junto com A e
B. Os DADOS das 4 marcas entram quando o dono fornecer os PDFs — via tela, sem
mexer em código.

---

## Como as fases se conectam

- O conserto de **estoque real** (itens 5/6, Fase A) é REUSADO pelos produtos de
  marca (Fase C) → nascem certos, vendem sem erro.
- A blindagem de **impersonate/CNPJ** (Fase A) garante que o onboarding (onde a
  Fase C roda) não tropece nos bugs antigos.
- A **automação** (Fase B) usa o mesmo `company-resync.service` que a Fase A deixa
  sólido → uma engrenagem só.

## Testes (rede anti-recorrência)

- **Fase A:** 1 teste por furo — logout-URL, pop-up sem localStorage, impersonate
  role/name imutável, CNPJ race, override na conversão.
- **Fase B:** idempotência, não-sobrescrita de personalização, dry-run não aplica,
  cron desligado = no-op, erro de uma empresa não para as outras.
- **Fase C:** preço = custo × 3, produto de marca cria estoque real e vende,
  pergunta do onboarding respeita as marcas marcadas, idempotência.
- **Sempre:** `tsc` + suíte completa + build verde antes de cada commit.

## Ordem de entrega e deploy

1. **Fase A** (segurança/urgente) → deploy.
2. **Fase B** (entregue desligada + em simulação) → deploy → dono liga quando quiser.
3. **Fase C estrutura** → deploy → dono preenche catálogos quando tiver os PDFs.
4. **Onda 2 (permissões)** documentada, fora desta spec.

## Fora de escopo (YAGNI)

- Sincronização automática de permissões (Onda 2, risco alto, depois).
- Dados reais das 4 marcas (esperando os PDFs).
- Refatorações não relacionadas aos furos auditados.

## Notas de deploy / armadilhas conhecidas

- O `build` é só `next build` — NÃO roda `migrate deploy`. Rodar
  `npm run migrate:deploy` manualmente pós-deploy (migrations das Fases B e C).
- Confirmar `NEXTAUTH_URL=https://vis.app.br` em produção (Fase A1 depende disso).
- Banco Neon (scale-to-zero) pode exigir retry em seeds/migrations.
- O `.env` local aponta para um banco que parece produção (tem migrations à frente
  da branch). NÃO mexer em `_prisma_migrations` sem confirmar o alvo.
