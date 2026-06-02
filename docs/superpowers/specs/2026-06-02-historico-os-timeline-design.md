# Spec — Histórico da OS (linha do tempo de derivações)

**Data:** 2026-06-02
**Status:** aprovado pelo dono (brainstorming + mockup visual aprovados)
**Depende de:** Bug 3 da spec `2026-06-02-bugs-crm-whatsapp-os-design.md` (encadeamento de derivações à OS-raiz).
**Sem migration de schema.** Reusa campos existentes do `ServiceOrder`.

---

## Problema / objetivo

Hoje a tela de detalhes de uma OS mostra um card simples ("Esta OS possui N garantia(s)/retrabalho(s)") com chips soltos, sem distinguir tipo, sem datas, sem motivo e sem noção de quantas garantias × retrabalhos × erros médicos a OS teve. O dono quer um **histórico/linha do tempo** da OS que mostre todas as derivações (garantias, retrabalhos, erros médicos) com contadores e como o prazo correu em cada etapa.

Com o Bug 3 fazendo todas as derivações apontarem à OS-raiz (número-base compartilhado, ex. `#000015`, `#000015-RT`, `#000015-G`, `#000015-G2`), a OS-raiz passa a ser a fonte única da verdade dessa família.

## Decisões de produto (fixas)

1. **Onde:** só na **OS-raiz**. Cada derivação mostra o card de vínculo atual + link "Ver histórico completo" → raiz. Sem duplicar a timeline.
2. **Layout:** linha do tempo **vertical** (cards conectados por linha + bolinha colorida por tipo). Layout "A" do mockup aprovado.
3. **Ordem:** mais recente no topo → OS original embaixo.
4. **Resumo no topo:** contadores por tipo (`N Garantias · N Retrabalhos · N Erros médicos`), contando **apenas não-canceladas**.
5. **Por item:** badge do tipo + número de exibição, status, motivo, datas (aberta · prometida · entregue) e **indicador de prazo** (verde "no prazo" / vermelho "atrasou Xd").
6. **Não** mostrar "quem abriu/entregou" na timeline (vive na OS específica). Card clicável abre a OS.
7. **Escopo:** só na tela. PDF/impressão fica para depois.

## Cores / semântica (alinhadas ao que o sistema já usa)

- Garantia → azul (`blue-600` / badge `blue-100/800`) — ícone `Shield`.
- Retrabalho → laranja/âmbar (`amber-600`) — ícone `RotateCcw`.
- Erro médico → vermelho (`red-600`) — ícone `Stethoscope`.
- OS original → cinza/slate — sem ícone de derivação.
- Status: Entregue = verde; Em produção/aberta = índigo; Cancelada = cinza riscado.
- Prazo: no prazo = `emerald-600`; atrasou = `red-600`.
- Acessibilidade: contraste ≥ 4.5:1, ícones SVG (Lucide, não emoji), `cursor-pointer` nos cards, foco visível, cor nunca é o único indicador (sempre acompanha texto/badge), `prefers-reduced-motion` respeitado.

---

## Arquitetura

### Dados (sem mudança de schema)
Todos os campos já existem em `ServiceOrder`:
`number`, `status`, `isWarranty/isRework/isMedicalError`, `warrantySeq`, `warrantyReason/reworkReason/medicalErrorReason`, `createdAt`, `promisedDate`, `deliveredAt`, `isDelayed`, `delayDays`, `originalOrder.number`.

A raiz já carrega `reworkOrders` em `service-order.service.ts:207-214`. **Ajuste necessário no include:** o `select` de `reworkOrders` hoje traz só `id/number/status/isWarranty/isRework/isMedicalError/warrantySeq/createdAt/originalOrder.number`. Adicionar os campos que a timeline precisa: `promisedDate`, `deliveredAt`, `isDelayed`, `delayDays`, `warrantyReason`, `reworkReason`, `medicalErrorReason`. (Apenas mais colunas no select — sem nova query.)

Com o Bug 3, `reworkOrders` da raiz contém **todas** as derivações (lista plana sob a raiz) = exatamente o conjunto da timeline.

### Helper puro (testável) — `buildOsTimeline`
Novo módulo `src/lib/os-timeline.ts`:

```ts
export type OsTimelineEventType = "ORIGINAL" | "WARRANTY" | "REWORK" | "MEDICAL_ERROR";
export interface OsTimelineEvent {
  id: string;
  type: OsTimelineEventType;
  displayNumber: string;        // via osDisplayNumber
  status: ServiceOrderStatus;
  reason: string | null;        // warranty/rework/medicalError reason
  createdAt: Date;
  promisedDate: Date | null;
  deliveredAt: Date | null;
  deadline: { state: "ON_TIME" | "LATE" | "PENDING"; lateDays: number | null };
  isCanceled: boolean;
}
export interface OsTimeline {
  events: OsTimelineEvent[];               // ordenado desc por createdAt (recente no topo)
  counts: { warranty: number; rework: number; medicalError: number }; // exclui canceladas
}
export function buildOsTimeline(root: OsTimelineRootInput): OsTimeline;
// OsTimelineRootInput é derivado do RETORNO enriquecido de service-order.service.getById
// (raiz + reworkOrders já com os campos de prazo/motivo/datas), para o tipo não driftar.
```

Regras do helper (puras, sem I/O):
- Monta evento da **raiz** (type ORIGINAL) + um evento por item de `reworkOrders`.
- `type` por flag: medicalError > rework > warranty (mesma precedência de `osTypeLetter`).
- `displayNumber` via `osDisplayNumber` (raiz exibe `#000015`; derivações `#000015-G` etc.). Como pós-Bug 3 todas apontam à raiz, passar `originalOrder.number = root.number` para cada derivação ao calcular.
- **Deadline:**
  - Entregue (`deliveredAt` presente): `ON_TIME` se `deliveredAt <= promisedDate` (ou sem `promisedDate`); senão `LATE` com `lateDays = diff(deliveredAt, promisedDate)`.
  - Não entregue: usa `isDelayed`/`delayDays` → `LATE` se `isDelayed`, senão `PENDING`.
  - Comparação de datas no fuso local (America/Sao_Paulo) reusando o helper de data existente (date-utils), para não repetir o bug de timezone já corrigido em relatórios.
- `counts`: agrupa por tipo ignorando `status === CANCELED`.
- Ordena `events` por `createdAt` desc.

### Componente — `<OsHistoryTimeline />`
Novo client component `src/components/ordens-servico/os-history-timeline.tsx`:
- Recebe a `order` raiz (já com `reworkOrders` enriquecido) e chama `buildOsTimeline`.
- Renderiza: bloco de resumo (3 stats por tipo) + lista vertical de cards conectados.
- Cada card: badge tipo + `displayNumber` + status + motivo + linha de datas + indicador de prazo; `Link` para `/dashboard/ordens-servico/{id}/detalhes`.
- Só renderiza na **raiz**, definida como `!order.originalOrder`. Em derivações (que têm `originalOrder`), não renderiza a timeline — mostram só o card de vínculo + link "Ver histórico completo". O check `reworkOrders.length > 0` é apenas defensivo (esconde a seção numa raiz sem derivações); não amplia o conceito de raiz.

### Integração na tela de detalhes
`src/app/(dashboard)/dashboard/ordens-servico/[id]/detalhes/page.tsx`:
- **Substituir** o card atual "Esta OS possui N garantia(s)/retrabalho(s)" (linhas ~382-410) por `<OsHistoryTimeline order={order} />`.
- No card de vínculo das derivações (linhas ~318-347), o número-base já vem do Bug 3 via `osDisplayNumber`; acrescentar link **"Ver histórico completo"** apontando para a OS-raiz (`order.originalOrder.id`).

---

## Unidades e responsabilidades

| Unidade | Faz | Depende de |
|---|---|---|
| `os-timeline.ts` (`buildOsTimeline`) | transforma OS-raiz + derivações em eventos ordenados + contadores + estado de prazo | `osDisplayNumber`, date-utils (fuso) |
| `os-history-timeline.tsx` | renderiza resumo + timeline vertical (apresentação) | `buildOsTimeline`, ícones Lucide |
| include em `getById` | trazer os campos de prazo/motivo/datas das derivações | — |
| detalhes/page.tsx | posicionar o componente e o link "ver histórico" | componente |

Boundary clara: o helper é testável sem render; o componente é só apresentação; a query só ganha colunas.

## Testes

- **`buildOsTimeline` (unidade):**
  - ordena recente→antigo;
  - contadores por tipo ignoram canceladas;
  - deadline ON_TIME quando entregue ≤ prometida; LATE com lateDays correto quando entregue > prometida; PENDING quando aberta sem atraso; LATE quando `isDelayed`;
  - sem `promisedDate` → ON_TIME (não penaliza);
  - displayNumber usa número-base da raiz para todas as derivações.
- **Render (smoke):** raiz com 1 retrabalho + 1 garantia renderiza 3 eventos + resumo "1/1/0"; derivação não renderiza a timeline.

## Riscos / dívidas

- Depende do Bug 3 estar implementado para a lista plana sob a raiz funcionar; se rodar antes, a timeline veria só filhos diretos (degrada, não quebra).
- Derivações antigas (pré-Bug 3) que apontam ao intermediário podem não aparecer sob a raiz até o backfill opcional do Bug 3 — anotado como dívida lá.
- PDF/impressão do histórico: fora de escopo (futuro).

## Ordem de execução sugerida

1. Bugs 1, 2 e 3 (spec separada) — nessa ordem.
2. Logo após o Bug 3: enriquecer include + `buildOsTimeline` (TDD) + componente + integração na tela.
3. Gate: tsc + vitest + build + code-reviewer.
