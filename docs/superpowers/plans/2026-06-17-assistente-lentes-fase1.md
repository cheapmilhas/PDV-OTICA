# Assistente de Lentes — Fase 1 (Motor Óptico + Governança Base) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o motor óptico determinístico (faixa de índice + estimativa de espessura/peso em FAIXA com disclaimer + sanity-check do grau, com falha fechada) exibido num painel na tela de OS, mais o seletor de modelo por-feature (`lensAdvisorModel`) no super admin — tudo funcionando SEM IA no caminho crítico e com custo zero de token.

**Architecture:** Uma função pura `lens-optics.ts` (sem IA, sem I/O) calcula faixas/alertas a partir do grau (obrigatório) + medida da armação (opcional). Um painel React na tela de OS consome o resultado. O schema ganha um campo aditivo `AiGlobalConfig.lensAdvisorModel` e o super admin ganha o seletor (reusando a allowlist e o padrão das telas de IA já existentes do Bloco D).

**Tech Stack:** Next.js App Router · Prisma 5.22 · TypeScript · Vitest · React (client components, padrão do projeto). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-06-17-assistente-lentes-ia-design.md` (Camada 1 + Governança D + Fase 1).

---

## Fatos verificados (seguir à risca)

- **rtk quebra binários no worktree:** rodar direto — `node node_modules/vitest/vitest.mjs run <path>`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/prisma/build/index.js <args>`. Commitar com `git commit --no-verify`.
- **Sem banco local:** migration via `node node_modules/prisma/build/index.js migrate diff` com `--script` (NÃO aplicar; aplicar com `migrate deploy` só no deploy).
- **Build:** `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build` (evita ENOSPC).
- **Allowlist de modelos já existe:** `QUALIFIER_MODELS = ["claude-haiku-4-5","claude-sonnet-4-6","claude-opus-4-8"]` em `src/services/ai-config.service.ts:10`. IDs batem com `TEXT_PRICING` em `src/lib/ai-pricing.ts` (haiku-4-5, sonnet-4-6, opus-4-8). REUSAR — não inventar string nova (resolve M1 da spec).
- **Medida da armação já existe no schema:** model `FrameMeasurement` (`lensWidth`, `bridgeSize`, `templeLength`, todos `Decimal? @db.Decimal(4,1)`) ligado a `ServiceOrder` (`frameMeasurements`). A Fase 1 NÃO precisa criar campo — a medida é entrada opcional do painel (manual ou lida da OS quando existir).
- **Padrão de tela de config de IA no super admin:** `src/app/admin/configuracoes/ia/ia-client.tsx` (form controlado) + `src/app/admin/configuracoes/ia/page.tsx` (server, monta a prop manualmente — ATENÇÃO: lembrar de passar o campo novo). Rota `src/app/api/admin/ai-config/route.ts` (GET/PUT, `getAdminSession`). O Bloco D já adicionou `qualifierModel` lá — seguir EXATAMENTE o mesmo padrão para `lensAdvisorModel`.
- **`AiGlobalConfig`** singleton id="global" em `prisma/schema.prisma` (~linha 4362). Migrations recentes têm timestamp `20260616xxxxxx`. Usar timestamp posterior ao último (`20260616120000_whatsapp_queue`).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/lens-optics.ts` | Criar | Motor puro: grau (+armação opcional) → faixa de índice, espessura/peso em faixa, alertas, falha fechada. Sem IA, sem I/O. |
| `src/lib/lens-optics.test.ts` | Criar | Testes de referência + propriedades + guarda-corpos + falha fechada. |
| `src/lib/lens-optics.constants.ts` | Criar | Faixas de índice por grau + limites plausíveis (entrada/saída) + texto do disclaimer. Calibração ancorada (ver Task 1). |
| `prisma/schema.prisma` | Modificar | `+ lensAdvisorModel String @default("claude-haiku-4-5")` em `AiGlobalConfig`. |
| `prisma/migrations/<ts>_lens_advisor_model/migration.sql` | Criar | Migration aditiva (1 ADD COLUMN com default). |
| `src/services/ai-config.service.ts` | Modificar | `AiConfigView` + `getAiConfig`/`updateAiConfig` incluem `lensAdvisorModel` (mesma allowlist). |
| `src/services/ai-config.service.test.ts` | Modificar | Casos para `lensAdvisorModel` (default haiku; allowlist; view). |
| `src/app/api/admin/ai-config/route.ts` | Modificar | PUT aceita `lensAdvisorModel` (valida allowlist, ignora inválido). |
| `src/app/api/admin/ai-config/route.test.ts` | Modificar | Casos: lensAdvisorModel válido encaminhado; inválido ignorado. |
| `src/app/admin/configuracoes/ia/ia-client.tsx` | Modificar | `<select>` "Modelo do Assistente de Lentes" + envia no PUT. |
| `src/app/admin/configuracoes/ia/page.tsx` | Modificar | Passar `lensAdvisorModel` na prop (server monta manual). |
| `src/components/ordens-servico/lens-advisor-panel.tsx` | Criar | Painel React na OS: inputs de grau (+armação opcional) → chama o motor → mostra faixa/alertas/disclaimer. Client-side puro (motor é função importável, sem rede na Fase 1). |
| (integração na tela de OS) | Modificar | Renderizar `<LensAdvisorPanel/>` na tela de OS em edição/criação. Identificar o arquivo exato na Task 8. |

> **Ordem:** Task 1 constantes/calibração → Task 2 motor (faixa índice) → Task 3 motor (espessura/peso faixa + disclaimer) → Task 4 motor (sanity-check + falha fechada) → Task 5 schema lensAdvisorModel → Task 6 ai-config.service → Task 7 rota admin PUT → Task 8 painel na OS + seletor na UI admin → Task 9 verificação.

---

## Task 1: Constantes e calibração do motor

**Files:**
- Create: `src/lib/lens-optics.constants.ts`

- [ ] **Step 1: Criar as constantes calibradas**

Ancorar nas faixas padrão de óptica (resolve I7 — fonte nomeada: tabela de índice por grau usada na indústria; o dono/óptico valida a planilha no playground antes de ativar). Conteúdo:

```typescript
/**
 * Constantes do motor óptico (Fase 1). Calibração ancorada na tabela de índice
 * por grau padrão da indústria óptica; o dono/óptico valida no playground antes
 * de ativar a feature (ver spec, Fase 1 — fonte de calibração).
 *
 * REGRA: o motor NUNCA é fonte de número de produção. Espessura/peso saem como
 * FAIXA + disclaimer. Falha fechada: entrada/saída atípica → não exibe número.
 */

/** Faixa de índice recomendada por |grau equivalente esférico| (dioptrias). */
export interface IndexBand {
  /** limite superior (inclusive) de |grau| para esta faixa */
  maxAbsPower: number;
  /** índices recomendados, do mais barato/grosso ao mais fino */
  indices: string[];
}

export const INDEX_BANDS: IndexBand[] = [
  { maxAbsPower: 2, indices: ["1.50", "1.56"] },
  { maxAbsPower: 4, indices: ["1.56", "1.61"] },
  { maxAbsPower: 6, indices: ["1.61", "1.67"] },
  { maxAbsPower: Infinity, indices: ["1.67", "1.74"] },
];

/** Limites plausíveis de entrada (guarda-corpo). Fora disso → falha fechada. */
export const INPUT_LIMITS = {
  sphMin: -30,
  sphMax: 30,
  cylMin: -10, // cilíndrico em notação negativa
  cylMax: 0,
  axisMin: 0,
  axisMax: 180,
  addMin: 0,
  addMax: 4,
} as const;

/** Limites plausíveis da medida da armação (mm). */
export const FRAME_LIMITS = {
  lensWidthMin: 30,
  lensWidthMax: 70,
  bridgeMin: 10,
  bridgeMax: 30,
} as const;

/** Disclaimer fixo, não-removível, em toda saída que envolva espessura/peso. */
export const THICKNESS_DISCLAIMER =
  "Estimativa para orientação de venda. A espessura/peso final dependem do laboratório, material e montagem.";
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/lens-optics.constants.ts
git commit --no-verify -m "feat(lens): constantes e calibração do motor óptico"
```

---

## Task 2: Motor — faixa de índice recomendada

**Files:**
- Create: `src/lib/lens-optics.ts`
- Test: `src/lib/lens-optics.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { recommendIndex } from "./lens-optics";

describe("recommendIndex", () => {
  it("grau baixo (-1.50) → índice básico 1.50/1.56", () => {
    expect(recommendIndex({ sph: -1.5, cyl: 0 })).toEqual(["1.50", "1.56"]);
  });
  it("grau médio (-3.00) → 1.56/1.61", () => {
    expect(recommendIndex({ sph: -3, cyl: 0 })).toEqual(["1.56", "1.61"]);
  });
  it("grau alto (-6.50) → 1.67/1.74", () => {
    expect(recommendIndex({ sph: -6.5, cyl: 0 })).toEqual(["1.67", "1.74"]);
  });
  it("usa o equivalente esférico (sph + cyl/2): -4.00 esf -2.00 cil → |EE|=5 → 1.61/1.67", () => {
    expect(recommendIndex({ sph: -4, cyl: -2 })).toEqual(["1.61", "1.67"]);
  });
  it("propriedade: índice nunca 'diminui' quando o grau aumenta", () => {
    const low = recommendIndex({ sph: -1, cyl: 0 });
    const high = recommendIndex({ sph: -8, cyl: 0 });
    expect(Number(high[0])).toBeGreaterThanOrEqual(Number(low[0]));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: FAIL ("recommendIndex is not a function").

- [ ] **Step 3: Implementar o mínimo**

```typescript
import { INDEX_BANDS } from "./lens-optics.constants";

export interface EyePower {
  sph: number;
  cyl: number;
  axis?: number;
  add?: number;
}

/** Equivalente esférico = esf + cil/2 (cil em notação negativa). */
export function sphericalEquivalent(p: EyePower): number {
  return p.sph + p.cyl / 2;
}

/** Faixa de índice recomendada pelo |equivalente esférico|. */
export function recommendIndex(p: EyePower): string[] {
  const absEE = Math.abs(sphericalEquivalent(p));
  const band = INDEX_BANDS.find((b) => absEE <= b.maxAbsPower) ?? INDEX_BANDS[INDEX_BANDS.length - 1];
  return band.indices;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lens-optics.ts src/lib/lens-optics.test.ts
git commit --no-verify -m "feat(lens): motor — faixa de índice por equivalente esférico"
```

---

## Task 3: Motor — espessura/peso em FAIXA + disclaimer

**Files:**
- Modify: `src/lib/lens-optics.ts`
- Test: `src/lib/lens-optics.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { estimateThickness } from "./lens-optics";
import { THICKNESS_DISCLAIMER } from "./lens-optics.constants";

describe("estimateThickness", () => {
  it("sem medida da armação → não estima espessura (faixa null), só disclaimer", () => {
    const r = estimateThickness({ sph: -4, cyl: 0 }, undefined);
    expect(r.thicknessMm).toBeNull();
    expect(r.disclaimer).toBe(THICKNESS_DISCLAIMER);
  });
  it("com medida → devolve FAIXA (min<=max), peso qualitativo e disclaimer", () => {
    const r = estimateThickness({ sph: -6, cyl: 0 }, { lensWidthMm: 55, bridgeMm: 18 });
    expect(r.thicknessMm).not.toBeNull();
    expect(r.thicknessMm!.min).toBeLessThanOrEqual(r.thicknessMm!.max);
    expect(["mais leve", "médio", "mais pesado"]).toContain(r.weight);
    expect(r.disclaimer).toBe(THICKNESS_DISCLAIMER);
  });
  it("nunca devolve espessura negativa", () => {
    const r = estimateThickness({ sph: -10, cyl: 0 }, { lensWidthMm: 60, bridgeMm: 18 });
    if (r.thicknessMm) expect(r.thicknessMm.min).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: FAIL ("estimateThickness is not a function").

- [ ] **Step 3: Implementar o mínimo**

```typescript
import { THICKNESS_DISCLAIMER } from "./lens-optics.constants";

export interface FrameSize {
  lensWidthMm: number;
  bridgeMm: number;
}

export interface ThicknessEstimate {
  /** faixa em mm, ou null quando não há medida da armação (falha fechada parcial) */
  thicknessMm: { min: number; max: number } | null;
  weight: "mais leve" | "médio" | "mais pesado";
  disclaimer: string;
}

/**
 * Estima a espessura de BORDA como FAIXA (ordem de grandeza via sagitta), nunca
 * número de produção. Sem medida da armação → não estima (thicknessMm=null).
 */
export function estimateThickness(p: EyePower, frame: FrameSize | undefined): ThicknessEstimate {
  const absEE = Math.abs(sphericalEquivalent(p));
  const weight: ThicknessEstimate["weight"] = absEE <= 2 ? "mais leve" : absEE <= 5 ? "médio" : "mais pesado";
  if (!frame) {
    return { thicknessMm: null, weight, disclaimer: THICKNESS_DISCLAIMER };
  }
  // Sagitta aproximada: t ≈ (r²/2) * (n-1) * |P| / 1000, faixa entre índice baixo e alto.
  // Mantém ORDEM DE GRANDEZA; a saída é faixa, não número exato.
  const semiDiameter = Math.max(0, (frame.lensWidthMm + frame.bridgeMm) / 2); // mm efetivo aprox.
  const base = ((semiDiameter * semiDiameter) / 2) * Math.abs(absEE) / 1000;
  const min = Math.max(0, Math.round(base * 0.5 * 10) / 10); // índice mais alto = mais fino
  const max = Math.max(min, Math.round(base * 1.0 * 10) / 10); // índice mais baixo = mais grosso
  return { thicknessMm: { min, max }, weight, disclaimer: THICKNESS_DISCLAIMER };
}
```

> Nota: os fatores 0.5/1.0 são placeholders de ordem de grandeza; a planilha de calibração da Task 1 (validada pelo óptico) deve ajustá-los. A saída sempre é FAIXA com disclaimer, então erro residual nunca vira número de produção.

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lens-optics.ts src/lib/lens-optics.test.ts
git commit --no-verify -m "feat(lens): motor — espessura em faixa + peso qualitativo + disclaimer"
```

---

## Task 4: Motor — sanity-check + falha fechada (função pública unificada)

**Files:**
- Modify: `src/lib/lens-optics.ts`
- Test: `src/lib/lens-optics.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { analyzeLens } from "./lens-optics";

describe("analyzeLens (entrada unificada + sanity-check + falha fechada)", () => {
  const ok = { od: { sph: -2, cyl: -1, axis: 90 }, oe: { sph: -2, cyl: -1, axis: 90 } };

  it("grau plausível → retorna índice + alertas (array) sem erro de validação", () => {
    const r = analyzeLens(ok, undefined);
    expect(r.valid).toBe(true);
    expect(r.od.index.length).toBeGreaterThan(0);
    expect(Array.isArray(r.alerts)).toBe(true);
  });

  it("FALHA FECHADA: esf fora da faixa (-40) → valid=false, sem números, pede conferir", () => {
    const r = analyzeLens({ od: { sph: -40, cyl: 0 }, oe: { sph: -2, cyl: 0 } }, undefined);
    expect(r.valid).toBe(false);
    expect(r.od.index).toEqual([]); // não exibe recomendação em entrada atípica
    expect(r.alerts.some((a) => /atípico|confir/i.test(a))).toBe(true);
  });

  it("sanity: cilíndrico alto com eixo 0 → alerta", () => {
    const r = analyzeLens({ od: { sph: 0, cyl: -3, axis: 0 }, oe: { sph: 0, cyl: -3, axis: 0 } }, undefined);
    expect(r.alerts.some((a) => /eixo/i.test(a))).toBe(true);
  });

  it("sanity: assimetria grande OD x OE → alerta", () => {
    const r = analyzeLens({ od: { sph: -1, cyl: 0 }, oe: { sph: -7, cyl: 0 } }, undefined);
    expect(r.alerts.some((a) => /assimetr/i.test(a))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: FAIL ("analyzeLens is not a function").

- [ ] **Step 3: Implementar o mínimo**

```typescript
import { INPUT_LIMITS, FRAME_LIMITS } from "./lens-optics.constants";

export interface LensInput {
  od: EyePower;
  oe: EyePower;
}

export interface EyeResult {
  index: string[]; // [] quando entrada atípica (falha fechada)
  thickness: ThicknessEstimate;
}

export interface LensAnalysis {
  valid: boolean;
  od: EyeResult;
  oe: EyeResult;
  alerts: string[];
}

function inputPlausible(p: EyePower): boolean {
  if (p.sph < INPUT_LIMITS.sphMin || p.sph > INPUT_LIMITS.sphMax) return false;
  if (p.cyl < INPUT_LIMITS.cylMin || p.cyl > INPUT_LIMITS.cylMax) return false;
  if (p.axis != null && (p.axis < INPUT_LIMITS.axisMin || p.axis > INPUT_LIMITS.axisMax)) return false;
  if (p.add != null && (p.add < INPUT_LIMITS.addMin || p.add > INPUT_LIMITS.addMax)) return false;
  return true;
}

function framePlausible(f: FrameSize): boolean {
  return (
    f.lensWidthMm >= FRAME_LIMITS.lensWidthMin && f.lensWidthMm <= FRAME_LIMITS.lensWidthMax &&
    f.bridgeMm >= FRAME_LIMITS.bridgeMin && f.bridgeMm <= FRAME_LIMITS.bridgeMax
  );
}

function eyeResult(p: EyePower, frame: FrameSize | undefined): EyeResult {
  return { index: recommendIndex(p), thickness: estimateThickness(p, frame) };
}

export function analyzeLens(input: LensInput, frame: FrameSize | undefined): LensAnalysis {
  const alerts: string[] = [];
  const safeFrame = frame && framePlausible(frame) ? frame : undefined;
  if (frame && !safeFrame) alerts.push("Medida da armação atípica — confirme antes de estimar espessura.");

  const odOk = inputPlausible(input.od);
  const oeOk = inputPlausible(input.oe);
  if (!odOk || !oeOk) {
    alerts.push("Valor de grau atípico — confirme a receita.");
    const empty: EyeResult = { index: [], thickness: estimateThickness({ sph: 0, cyl: 0 }, undefined) };
    return { valid: false, od: odOk ? eyeResult(input.od, safeFrame) : empty, oe: oeOk ? eyeResult(input.oe, safeFrame) : empty, alerts };
  }

  // sanity-checks (não invalidam, só alertam)
  for (const [label, p] of [["OD", input.od], ["OE", input.oe]] as const) {
    if (Math.abs(p.cyl) >= 2 && (p.axis === 0 || p.axis === 180)) {
      alerts.push(`${label}: cilíndrico alto com eixo ${p.axis} — confira o eixo.`);
    }
    if (p.add != null && p.add > 0) {
      alerts.push(`${label}: adição informada — confirme se é multifocal/perto.`);
    }
  }
  if (Math.abs(sphericalEquivalent(input.od) - sphericalEquivalent(input.oe)) >= 4) {
    alerts.push("Assimetria grande entre OD e OE — confirme a receita.");
  }

  return { valid: true, od: eyeResult(input.od, safeFrame), oe: eyeResult(input.oe, safeFrame), alerts };
}
```

- [ ] **Step 4: Rodar e ver passar (toda a suíte do motor)**

Run: `node node_modules/vitest/vitest.mjs run src/lib/lens-optics.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lens-optics.ts src/lib/lens-optics.test.ts
git commit --no-verify -m "feat(lens): motor — sanity-check + falha fechada (analyzeLens)"
```

---

## Task 5: Schema — `lensAdvisorModel` em AiGlobalConfig

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_lens_advisor_model/migration.sql`

- [ ] **Step 1: Editar o schema**

Em `model AiGlobalConfig`, adicionar perto de `qualifierModel`:

```prisma
  lensAdvisorModel String @default("claude-haiku-4-5")
```

- [ ] **Step 2: Gerar o client**

Run: `node node_modules/prisma/build/index.js generate`
Expected: sucesso (schema válido).

- [ ] **Step 3: Gerar a migration via diff (NÃO aplicar)**

Criar `prisma/migrations/20260617090000_lens_advisor_model/migration.sql` com o SQL gerado por:
```bash
node node_modules/prisma/build/index.js migrate diff \
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script
```
(se `--from-migrations` exigir shadow db, diffar `HEAD:prisma/schema.prisma` contra o working schema, como nos blocos anteriores.) O SQL deve ser EXATAMENTE 1 `ALTER TABLE "AiGlobalConfig" ADD COLUMN "lensAdvisorModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5';`.

- [ ] **Step 4: Verificar additivo**

Run: `grep -i drop prisma/migrations/20260617090000_lens_advisor_model/migration.sql`
Expected: vazio (sem DROP).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260617090000_lens_advisor_model/
git commit --no-verify -m "feat(lens): lensAdvisorModel em AiGlobalConfig (aditiva)"
```

---

## Task 6: ai-config.service — incluir lensAdvisorModel

**Files:**
- Modify: `src/services/ai-config.service.ts`
- Test: `src/services/ai-config.service.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `ai-config.service.test.ts` (espelhar o estilo dos testes de `qualifierModel`):
- `getAiConfig` retorna `lensAdvisorModel` (default "claude-haiku-4-5" no create).
- `updateAiConfig` com `lensAdvisorModel` válido (ex "claude-sonnet-4-6") seta; inválido ("gpt-4") NÃO seta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/services/ai-config.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar (espelhar qualifierModel exatamente)**

- `AiConfigView` ganha `lensAdvisorModel: string`.
- `getAiConfig` retorna `lensAdvisorModel: c.lensAdvisorModel`.
- `UpdateAiConfigInput` ganha `lensAdvisorModel?: string`.
- `updateAiConfig`: `if (patch.lensAdvisorModel && (QUALIFIER_MODELS as readonly string[]).includes(patch.lensAdvisorModel)) data.lensAdvisorModel = patch.lensAdvisorModel;` (reusa a allowlist existente — resolve M1).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/services/ai-config.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai-config.service.ts src/services/ai-config.service.test.ts
git commit --no-verify -m "feat(lens): ai-config inclui lensAdvisorModel (reusa allowlist)"
```

---

## Task 7: Rota admin PUT aceita lensAdvisorModel

**Files:**
- Modify: `src/app/api/admin/ai-config/route.ts`
- Test: `src/app/api/admin/ai-config/route.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Espelhar os casos de `qualifierModel`: PUT com `lensAdvisorModel` válido → encaminhado a `updateAiConfig`; inválido → não encaminhado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/admin/ai-config/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

No builder do `patch` do PUT, adicionar (espelhando qualifierModel):
```typescript
if (typeof body.lensAdvisorModel === "string" && (QUALIFIER_MODELS as readonly string[]).includes(body.lensAdvisorModel)) {
  patch.lensAdvisorModel = body.lensAdvisorModel;
}
```
(importar `QUALIFIER_MODELS` de `@/services/ai-config.service` se ainda não importado; adicionar `lensAdvisorModel?: string` ao tipo do patch.)

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/app/api/admin/ai-config/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/ai-config/route.ts src/app/api/admin/ai-config/route.test.ts
git commit --no-verify -m "feat(lens): rota admin PUT aceita lensAdvisorModel"
```

---

## Task 8: UI — seletor no super admin + painel na OS

**Files:**
- Modify: `src/app/admin/configuracoes/ia/ia-client.tsx`, `src/app/admin/configuracoes/ia/page.tsx`
- Create: `src/components/ordens-servico/lens-advisor-panel.tsx`
- Modify: a tela de OS em edição/criação (localizar o arquivo)

- [ ] **Step 1: Seletor no super admin (espelhar o select de qualifierModel)**

Em `ia-client.tsx`: estender a interface local com `lensAdvisorModel: string`; adicionar `<select>` "Modelo do Assistente de Lentes" (mesmas 3 opções/labels do qualifierModel); incluir no body do PUT.
Em `page.tsx`: passar `lensAdvisorModel` na prop manual (igual ao qualifierModel).

- [ ] **Step 2: Verificar tipos**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Criar o painel da OS (client component, sem rede)**

`lens-advisor-panel.tsx`: inputs controlados de grau OD/OE (esf/cil/eixo/add) + campos opcionais de armação (lensWidthMm/bridgeMm; pré-preencher de `FrameMeasurement` da OS quando existir); ao mudar, chama `analyzeLens(...)` (import direto do motor — função pura, roda no client) e renderiza: faixa de índice por olho, faixa de espessura + peso + **disclaimer fixo**, lista de alertas. Quando `valid=false`, mostrar só os alertas ("valor atípico, confirme"). Estado vazio amigável. Usar tokens Tailwind/estilo dos componentes de OS existentes.

- [ ] **Step 4: Integrar na tela de OS**

Localizar o componente da tela de OS em edição/criação (`grep -rl "FrameMeasurement\|frameMeasurement\|ordens-servico" src/app/(dashboard)/dashboard/ordens-servico src/components/ordens-servico`) e renderizar `<LensAdvisorPanel/>` (só em criação/edição — resolve I6; NÃO em OS finalizada). Confirmar o arquivo certo antes de editar.

- [ ] **Step 5: Verificar tipos + build**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/configuracoes/ia/ia-client.tsx src/app/admin/configuracoes/ia/page.tsx src/components/ordens-servico/lens-advisor-panel.tsx <arquivo-da-OS>
git commit --no-verify -m "feat(lens): seletor de modelo no super admin + painel do assistente na OS"
```

---

## Task 9: Verificação final da Fase 1

- [ ] **Step 1: Suíte completa**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: tudo verde (incluindo lens-optics + ai-config + ai-config route).

- [ ] **Step 2: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Migração aditiva**

Run: `grep -ri "drop\|delete\|truncate" prisma/migrations/20260617090000_lens_advisor_model/migration.sql`
Expected: vazio.

- [ ] **Step 4: Build**

Run: `TMPDIR=/Users/matheusreboucas/.cache/claude-tmp node node_modules/next/dist/bin/next build`
Expected: "✓ Compiled successfully" + a tela de OS e `/admin/configuracoes/ia` no route table.

- [ ] **Step 5: Resumo**

Confirmar: motor funciona sem IA (custo zero), painel aparece só em OS em edição/criação, seletor de modelo salvo, migração aditiva. PARAR antes do deploy (igual aos blocos anteriores — deploy é decisão do dono, com `migrate status` contra o banco antes).

---

## Fora do escopo desta Fase (planos seguintes)
- Base de conhecimento + Playground (Fase 2 — `LensKnowledgeDoc`, `companyId` opcional em `AiTokenUsage`, abas no super admin, ligar/desligar em massa).
- Camada de IA por cima do motor (Fase 3 — `lens-advisor.service.ts`, getAnthropicKey, cache, rate-limit, logAiUsage).
- Foto da receita → preenche OS (Fase 4 — migrar OCR para getAnthropicKey + logAiUsage + modelo configurável).
- Comparativo com preço da loja (depende de popular `LabPriceRange`).
