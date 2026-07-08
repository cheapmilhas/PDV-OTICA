# Detalhe de Tarefa Automática (drawer) — Design

**Data:** 2026-07-08
**Tela:** `/admin/configuracoes/saude` ("O Pulso" — Saúde do Sistema), seção "Tarefas automáticas"
**Origem:** pedido do dono ("linha clicável → detalhe/config de cada tarefa"), passado por painel adversarial (forja). Ver "Decisões do painel" no fim.

## Objetivo

Cada linha da tabela "Tarefas automáticas" (os ~13 crons) fica **clicável** e abre um **drawer lateral (Sheet)** read-only com informações detalhadas da tarefa, em linguagem de dono não-técnico. É informativo, não configurável.

## Não-objetivos (fora de escopo — adiado, YAGNI)

Explicitamente NÃO fazem parte desta entrega:
- Histórico de execuções (tabela `CronRun`) — não há consumidor real (SaaS pequeno; ninguém lê MTBF). O modelo atual guarda só o último batimento.
- Configuração editável por tarefa (`CronConfig`: ligar/desligar, threshold, e-mail de alerta). É anti-controle perigoso (dono não-técnico desligar monitoramento) e o pedido foi "informações OU configurar" — fica em informações.
- "Rodar agora" genérico para crons.
- Linha do tempo de incidentes **por tarefa**: impossível sem migração — `SystemEvent` não tem coluna `jobKey` e os incidentes de cron são colapsados num único registro (`dedupeKey="cron:auto"`) para todos os crons juntos.

Se um dia forem necessários, são a "Onda 2" documentada no painel (exigem migração + mudança no `health-alert` para emitir incidente por jobKey).

## Arquitetura — 4 unidades

### 1. Sanitização de erro no servidor (correção de segurança)

**Problema achado pelo painel:** `CronHealthRow.lastError` é `err.message` cru (capturado em `cron-instrument.ts`) e **já cruza a fronteira server→client hoje** — `getCronHealth()` o serializa e `PulsoView` recebe o snapshot inteiro como prop de client component. Erros de Prisma/Asaas/Resend/Evolution podem embutir PII de clientes das óticas (e-mail, CPF, CNPJ, telefone, IDs). Isso é risco LGPD numa tela do super admin, independente desta feature.

**Correção:**
- Novo helper puro `sanitizeCronError(raw: string | null): string | null` (arquivo próprio, ex. `src/lib/cron-error-sanitizer.ts`).
  - Redige por regex: e-mail, CPF (`###.###.###-##` e 11 dígitos soltos), CNPJ, telefone brasileiro → substitui por marcador (`[redigido]`). **A lista de redação é best-effort** (erros Prisma podem embutir connection strings, tokens, UUIDs que a regex não cobre) — não sobre-investir em regex exaustiva.
  - Trunca a um teto (ex. 300 caracteres) com reticências. **Esta truncagem é o backstop real de contenção**, não a lista de regex.
  - Retorna `null` se a entrada é `null`.
- Em `cron-heartbeat.service.ts` (onde monta `CronHealthRow`), o campo cru **deixa de ser exposto**: substituir `lastError` por `lastErrorSafe` (aplicando `sanitizeCronError`). O `CronHealthRow` que vai ao client passa a conter **apenas** a versão sanitizada. Nenhum consumidor do client recebe mais o texto cru.
- O campo cru continua no banco (`CronHeartbeat.lastError`) — a sanitização é só na fronteira de exibição.

### 2. Metadados enriquecidos (`system-health-labels.ts`)

Adicionar 2 campos opcionais a `interface CronMeta` e preencher para os 13 crons de `CRON_META`:
- `ifStops?: string` — 1 frase "se esta tarefa parar, o efeito no negócio é X". Ex. (dunning): "Clientes inadimplentes deixam de receber cobrança — dinheiro parado na rua."
- `frequencyLabel?: string` — frequência em linguagem de dono. Ex.: "1× por dia, de manhã"; "a cada 5 minutos".

Fallbacks (função `cronMeta(jobKey)` já tem fallback genérico para jobKey desconhecido):
- `ifStops` ausente → não renderiza o bloco (degrada com elegância, não inventa texto).
- `frequencyLabel` ausente → derivar de `expectedEveryMs` uma frase aproximada ("a cada ~X h" / "~1× por dia"). Helper puro `frequencyLabelFor(expectedEveryMs, override?)`.

Metadados permanecem em **código** (versionados com deploy), NÃO migram para banco — o `jobKey` é constante de código; um label em banco pode descrever um cron que o código nem chama mais.

### 3. `CronDetailSheet` (client component, novo)

Sheet do shadcn (já instalado). Props: `row: CronHealthRow | null`, `onOpenChange: (open: boolean) => void`. Aberto quando `row` não é null.

Conteúdo (de cima para baixo), tudo derivado do `row` + `cronMeta(row.jobKey)`:
1. **Título** = `label`.
2. **Selo de situação** = `state` (healthy/warning/critical/unknown) — reusa os estilos/paleta de estado já existentes em `pulso-view.tsx` (`STATE_STYLES`). **Nota de implementação:** `STATE_STYLES` é hoje módulo-privado em `pulso-view.tsx`; o plano deve exportá-lo ou lift para um módulo compartilhado (ex. `saude/state-styles.ts`) para o `CronDetailSheet` reusar sem duplicar a paleta.
3. **"O que faz"** = `does`.
4. **"Se esta tarefa parar"** = `cronMeta(...).ifStops` (só se presente).
5. **Frequência** = `frequencyLabel` (ou derivada de `expectedEveryMs`).
6. **Último ciclo**: último início (`lastStartedAt`), último sucesso (`lastSucceededAt`) em BRT com linguagem relativa (reusar `formatSince`/helper existente), duração da última rodada (`lastDurationMs`).
7. **Erro** (só se `lastErrorSafe` presente): caixa recolhível "ver detalhe técnico" com o texto **já sanitizado** + frase-guia ("Se persistir, avise o suporte técnico.").
8. **Aviso de gatilho externo** (só se `row.external`): "Esta tarefa é acionada por um serviço externo (cron-job.org). Se ficar muito tempo sem rodar, reative o gatilho."

Nenhum fetch, endpoint ou rota nova. O componente é 100% alimentado por dados que já chegam ao client.

### 4. Linha clicável (`pulso-view.tsx`)

- Estado `selected: CronHealthRow | null` no `PulsoView`.
- Cada `<tr>` de cron ganha: `onClick={() => setSelected(row)}`, `role="button"`, `tabIndex={0}`, handler de tecla (Enter/Space abre), `cursor-pointer`, `hover:bg-muted/40`.
- `<CronDetailSheet row={selected} onOpenChange={(o) => !o && setSelected(null)} />` renderizado uma vez ao final da seção.

## Autorização

Nenhuma rota/endpoint novo → nenhuma superfície de authz nova. A tela `/admin/configuracoes/saude` já exige `SUPER_ADMIN` (`requireAdminRole(["SUPER_ADMIN"])` no `page.tsx`). O drawer herda esse gate por ser client-side dentro da mesma página. Comentário-âncora no `CronDetailSheet` e no ponto de sanitização: "se um dia afrouxar a role desta tela, revalidar a sanitização de erro".

## Fluxo de dados

`page.tsx` (server, SUPER_ADMIN) → `getSystemHealthSnapshot()` → `getCronHealth()` monta `CronHealthRow[]` **com `lastErrorSafe` (sanitizado), sem `lastError` cru** → `PulsoView` (client) recebe `snapshot.cronRows` → clique seta `selected` → `CronDetailSheet` lê o `row` + `cronMeta(jobKey)`. Sem I/O adicional.

## Tratamento de erros / edge cases

- `lastErrorSafe === null` → bloco de erro não renderiza.
- `ifStops` ausente → bloco "se parar" não renderiza.
- jobKey desconhecido (cron novo sem meta) → `cronMeta` já dá fallback genérico; drawer mostra o que tiver.
- Datas null (`lastStartedAt`/`lastSucceededAt` nunca executou) → exibir "ainda não rodou".

## Testes

- **`sanitizeCronError`** (unit, prioritário): redige e-mail, CPF (com e sem máscara), CNPJ, telefone; trunca acima do teto; passa `null` → `null`; texto limpo permanece intacto.
- **Não-exposição do cru**: `getCronHealth()` retorna `lastErrorSafe` e NÃO um campo `lastError` cru no objeto client-facing (teste do shape do `CronHealthRow` / do snapshot).
- **`frequencyLabelFor`** (unit): override vence; sem override deriva de `expectedEveryMs` (DAY→"~1× por dia", 5min→"a cada 5 minutos", HOUR→"a cada hora").
- **`cronMeta` fallback**: jobKey desconhecido retorna genérico sem quebrar; `ifStops` opcional ausente é tolerado.

Componente `CronDetailSheet` e a linha clicável são cobertos indiretamente (render puro de props) — foco de teste é a lógica pura (sanitização, frequência, fallback).

## Decisões do painel adversarial (forja)

- **Escolhida:** abordagem A (drawer read-only). Duas objeções FATAL independentes mataram a página dedicada com narrativa (B): prosa curada por jobKey apodrece/engana + a timeline de incidentes por tarefa é factualmente impossível (`SystemEvent` sem `jobKey`, incidentes colapsados). A Onda 2 de C (tabelas `CronRun`/`CronConfig`) foi julgada YAGNI (Neon já foi punido por custo de invocações; nenhum consumidor de MTBF).
- **Enxerto aprovado de B:** a frase "se parar" (`ifStops`) — 1 campo em `cronMeta`, não prosa × blocos × rota.
- **Fix transversal obrigatório (de segurança):** sanitizar `lastError`, que já vaza hoje.
