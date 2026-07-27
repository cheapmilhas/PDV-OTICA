# N7 — Trilha de acesso de suporte no super admin: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O operador do Vis passa a ver, no detalhe do cliente medical, a trilha de quem acessou o PHI daquela clínica — hoje visível só para o cliente.

**Architecture:** Primeiro canal de LEITURA máquina-a-máquina Vis→Domus. `GET` assinado com a primitiva HMAC path-bound que já existe (sem alterá-la), `clinicId` num header que entra na assinatura, projeção por allowlist no Domus, junção com a trilha local (`GlobalAudit`) feita em memória no Vis. Nada é replicado; o Domus segue fonte única.

**Tech Stack:** Domus = Next.js + Drizzle. Vis = Next.js 16 + Prisma. Vitest nos dois.

**Environment notes:**
- **SEM migração** em nenhum dos dois repos. Nenhum schema muda.
- **SEM segredo novo:** reusa `VIS_DOMUS_SUPPORT_SECRET`, já configurado nos dois projetos.
- Trabalhar na **`main` dos dois repos** (ambas limpas e sincronizadas). ⚠️ Conferir `git branch --show-current` antes de cada commit — commit em branch errada já aconteceu nesta feature e exigiu cherry-pick.
- **NÃO fazer `git push`.** Push na `main` dispara deploy de produção; é decisão do dono.
- **Teste de integração novo é inviável no Domus:** `TEST_DATABASE_URL` não está configurada e `hasTestDatabase()` só checa se a variável existe (não conecta), então integração **falha** em vez de pular. Cobertura por unidade e fakes.
- Rodar só `npx vitest run tests/vis-support/` no Domus. A suíte completa tem falhas pré-existentes de infraestrutura (~151), idênticas no baseline. **Não reinvestigar.**

**Spec:** `docs/superpowers/specs/2026-07-26-n7-trilha-acesso-suporte-design.md` (repo Vis). Em caso de divergência, a spec vence.

---

## Estrutura de arquivos

### Domus (`/Users/matheusreboucas/SISTEMACLINICADOMUS`)

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/support-audit-projection.ts` **(criar)** | O contrato de fronteira: converte linha crua → objeto público por allowlist. Função pura, sem `db`. |
| `src/app/api/internal/vis/support/audit/route.ts` **(criar)** | Receptor `GET`: guardas na ordem canônica + leitura + projeção. |
| `tests/vis-support/support-audit-projection.test.ts` **(criar)** | Trava o allowlist (o teste mais importante da entrega). |
| `tests/vis-support/support-audit-route.test.ts` **(criar)** | Trava a ordem das guardas. |

### Vis (`/Users/matheusreboucas/PDV OTICA`)

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/vis-support-audit-client.ts` **(criar)** | Assina e chama o Domus. Resultado discriminado em 3. |
| `src/services/support-trail.service.ts` **(criar)** | Junção pura das duas trilhas + ordenação. Domus injetado. |
| `src/app/api/admin/companies/[id]/support-trail/route.ts` **(criar)** | `GET` autenticado, **gate de papel**, devolve a lista pronta. |
| `src/app/admin/(painel)/clientes/[id]/company-support-trail.tsx` **(criar)** | O card, sob demanda, 4 estados. |
| `src/app/admin/(painel)/clientes/[id]/page.tsx` **(modificar)** | Montar o card na aba "clinica", só para papel autorizado. |
| `src/services/__tests__/support-trail.service.test.ts` **(criar)** | Junção, ordenação, corrida causa/efeito. |
| `src/app/api/admin/companies/[id]/support-trail/route.test.ts` **(criar)** | Gate de papel na rota. |

---

## Task 1: Projeção — o contrato de fronteira (Domus)

**Files:**
- Create: `src/lib/support-audit-projection.ts`
- Test: `tests/vis-support/support-audit-projection.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";

import { projectSupportAuditForVis } from "@/lib/support-audit-projection";

/**
 * O CONTRATO DE FRONTEIRA. `details` é jsonb sem schema e `event` é text sem
 * CHECK — então a única defesa que não apodrece é allowlist: campo novo fica de
 * fora POR PADRÃO. Se este teste for enfraquecido, o próximo campo que alguém
 * gravar em details atravessa para o Vis sem ninguém decidir isso.
 */
describe("projectSupportAuditForVis", () => {
  const linhaCrua = {
    id: "11111111-1111-4111-8111-111111111111",
    grantId: "22222222-2222-4222-8222-222222222222",
    codeId: "33333333-3333-4333-8333-333333333333",
    clinicId: "44444444-4444-4444-8444-444444444444",
    visOperatorRef: "vis-op-abc123",
    event: "session_activated",
    details: {
      reason: "client",
      expiresAt: "2026-07-26T12:00:00.000Z",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      campoNovoQueAlguemAdicionou: "vaza?",
    },
    actorUserId: "user_da_clinica",
    createdAt: new Date("2026-07-26T10:00:00.000Z"),
  };

  it("deixa passar só os campos da allowlist", () => {
    const [out] = projectSupportAuditForVis([linhaCrua]);
    expect(Object.keys(out).sort()).toEqual(
      ["createdAt", "details", "event", "grantId", "id", "visOperatorRef"].sort(),
    );
  });

  it("NUNCA vaza identidade de funcionário da clínica", () => {
    const [out] = projectSupportAuditForVis([linhaCrua]);
    expect(out).not.toHaveProperty("actorUserId");
    expect(out).not.toHaveProperty("codeId");
    expect(JSON.stringify(out)).not.toContain("user_da_clinica");
  });

  it("NUNCA vaza IP/user-agent do operador", () => {
    const [out] = projectSupportAuditForVis([linhaCrua]);
    expect(out.details).not.toHaveProperty("ipAddress");
    expect(out.details).not.toHaveProperty("userAgent");
    expect(JSON.stringify(out)).not.toContain("203.0.113.7");
    expect(JSON.stringify(out)).not.toContain("Mozilla");
  });

  it("campo DESCONHECIDO em details fica de fora por padrão (allowlist, não deleção)", () => {
    const [out] = projectSupportAuditForVis([linhaCrua]);
    expect(out.details).not.toHaveProperty("campoNovoQueAlguemAdicionou");
    expect(Object.keys(out.details ?? {}).sort()).toEqual(["expiresAt", "reason"]);
  });

  it("preserva o que a tela precisa", () => {
    const [out] = projectSupportAuditForVis([linhaCrua]);
    expect(out.event).toBe("session_activated");
    expect(out.grantId).toBe("22222222-2222-4222-8222-222222222222");
    expect(out.visOperatorRef).toBe("vis-op-abc123");
    expect(out.details?.reason).toBe("client");
    expect(out.createdAt).toBe("2026-07-26T10:00:00.000Z");
  });

  it("grantId null do code_generated é legítimo, não defeito", () => {
    const [out] = projectSupportAuditForVis([
      { ...linhaCrua, event: "code_generated", grantId: null, visOperatorRef: null },
    ]);
    expect(out.grantId).toBeNull();
    expect(out.event).toBe("code_generated");
  });

  it("details ausente não quebra", () => {
    const [out] = projectSupportAuditForVis([{ ...linhaCrua, details: null }]);
    expect(out.details).toBeNull();
  });

  it("evento fora do vocabulário conhecido atravessa (a coluna não tem CHECK)", () => {
    // Descartar o desconhecido apagaria evento de uma trilha de LGPD.
    const [out] = projectSupportAuditForVis([{ ...linhaCrua, event: "evento_futuro" }]);
    expect(out.event).toBe("evento_futuro");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/support-audit-projection.test.ts`
Expected: FAIL — `Cannot find module '@/lib/support-audit-projection'`

- [ ] **Step 3: Implementar**

Criar `src/lib/support-audit-projection.ts`:

```ts
/**
 * CONTRATO DE FRONTEIRA da trilha de suporte (N7): o que o Domus deixa
 * atravessar para o Vis.
 *
 * Allowlist, JAMAIS deleção de campos indesejados. `details` é jsonb sem schema
 * e `event` é text sem CHECK constraint — com deleção, o próximo campo que
 * alguém gravar em details vaza sozinho. Com allowlist, ele fica de fora até
 * alguém DECIDIR incluí-lo.
 *
 * Fora, em definitivo:
 *  - `actorUserId`: identidade de funcionário DA CLÍNICA (quem gerou o código,
 *    quem revogou). O operador não tem o que fazer com ela.
 *  - `ipAddress`/`userAgent`: são do OPERADOR, não do paciente — mas são dado
 *    pessoal de funcionário sem consumidor nesta tela, e o Vis é PHI-free por
 *    desenho. Não se importa PII para "talvez ser útil".
 *  - `codeId`: identificador interno do código, sem uso do outro lado.
 */

/** Chaves de `details` que atravessam. Adicionar aqui é uma DECISÃO. */
const DETAILS_ALLOWLIST = ["reason", "expiresAt"] as const;

export interface SupportAuditRowForVis {
  id: string;
  /** Null em `code_generated` — o acesso ainda não existia. Não é defeito. */
  grantId: string | null;
  event: string;
  visOperatorRef: string | null;
  /** ISO 8601. String, não Date: atravessa JSON. */
  createdAt: string;
  details: Record<string, unknown> | null;
}

interface RawRow {
  id: string;
  grantId: string | null;
  event: string;
  visOperatorRef: string | null;
  createdAt: Date;
  details: unknown;
  [k: string]: unknown;
}

function projectDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object") return null;
  const src = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DETAILS_ALLOWLIST) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

export function projectSupportAuditForVis(rows: RawRow[]): SupportAuditRowForVis[] {
  // Construção campo a campo (não spread + delete): é o que garante que uma
  // coluna nova na tabela não apareça do outro lado sem alguém decidir.
  return rows.map((r) => ({
    id: r.id,
    grantId: r.grantId,
    event: r.event,
    visOperatorRef: r.visOperatorRef,
    createdAt: r.createdAt.toISOString(),
    details: projectDetails(r.details),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/support-audit-projection.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: SABOTAR para provar que o teste protege**

Trocar temporariamente o corpo de `projectDetails` por `return (details as Record<string, unknown>) ?? null;` (deixa passar tudo) e rodar de novo.
Expected: **FAIL** nos testes de IP/user-agent e de campo desconhecido.
Depois **desfazer a sabotagem** e confirmar PASS de novo.

> Se o teste passar sabotado, ele não protege nada — conserte o teste antes de seguir.

- [ ] **Step 6: Commit**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS
git branch --show-current   # tem que ser: main
git add src/lib/support-audit-projection.ts tests/vis-support/support-audit-projection.test.ts
git commit -m "feat(n7): contrato de fronteira da trilha de suporte

Allowlist explicita, nao delecao: details e jsonb sem schema e event e
text sem CHECK, entao campo novo tem que ficar de fora POR PADRAO.
Fora em definitivo: actorUserId (funcionario da clinica), ipAddress e
userAgent (PII de funcionario sem consumidor)."
```

---

## Task 2: Endpoint de leitura (Domus)

**Files:**
- Create: `src/app/api/internal/vis/support/audit/route.ts`
- Test: `tests/vis-support/support-audit-route.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

/**
 * Invariantes ESTRUTURAIS do receptor de leitura da trilha (N7).
 *
 * São propriedades de ORDEM dentro do handler: só apareceriam num teste de
 * comportamento com banco real (inviável aqui — TEST_DATABASE_URL não
 * configurada). O que se trava é a estrutura que as garante, no mesmo estilo
 * dos testes já existentes do kill-switch.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/app/api/internal/vis/support/audit/route.ts"),
  "utf8",
);

describe("GET /api/internal/vis/support/audit — ordem das guardas", () => {
  it("a feature flag vem ANTES de tudo", () => {
    // Com a flag desligada o endpoint não pode nem tocar o banco.
    const flag = SRC.indexOf("isSupportAccessEnabled");
    const hmac = SRC.indexOf("verifyVisProvision");
    const leitura = SRC.indexOf("listSupportAudit");
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(hmac);
    expect(flag).toBeLessThan(leitura);
  });

  it("valida a janela de tempo ANTES do HMAC (fecha o bypass por NaN)", () => {
    const ts = SRC.indexOf("isValidHmacTimestamp");
    const hmac = SRC.indexOf("verifyVisProvision");
    expect(ts).toBeGreaterThan(-1);
    expect(ts).toBeLessThan(hmac);
  });

  it("HMAC vem antes do guard de host e da leitura", () => {
    const hmac = SRC.indexOf("verifyVisProvision");
    const host = SRC.indexOf("isDbHostAllowed");
    const leitura = SRC.indexOf("listSupportAudit");
    expect(hmac).toBeLessThan(host);
    expect(host).toBeLessThan(leitura);
  });

  it("NADA é lido antes de todas as guardas passarem", () => {
    const leitura = SRC.indexOf("listSupportAudit");
    for (const guarda of [
      "isSupportAccessEnabled",
      "isValidHmacTimestamp",
      "verifyVisProvision",
      "isDbHostAllowed",
    ]) {
      expect(SRC.indexOf(guarda)).toBeLessThan(leitura);
    }
  });
});

describe("GET /api/internal/vis/support/audit — decisões da spec", () => {
  it("o path assinado é uma CONSTANTE de módulo, nunca derivado de req.url", () => {
    // Derivar do request abriria canonicalização (ordem de params, encoding,
    // chave duplicada) — o furo que matou a abordagem de querystring assinada.
    expect(SRC).toMatch(/const PATH = "\/api\/internal\/vis\/support\/audit"/);
    expect(SRC).not.toContain("new URL(req.url)");
    expect(SRC).not.toContain("searchParams");
  });

  it("o clinicId entra na ASSINATURA (header assinado), não em querystring", () => {
    expect(SRC).toContain("x-vis-clinic-id");
    // O header assinado tem que compor o body canônico da assinatura.
    const bodyDaAssinatura = SRC.slice(SRC.indexOf("verifyVisProvision"));
    expect(bodyDaAssinatura).toContain("clinicIdHeader");
  });

  it("NÃO consome nonce — leitura idempotente não precisa de anti-replay", () => {
    // Manter faria cada visualização gravar linha durável no banco com PHI e
    // transformaria retry de rede em 401 na tela usada durante incidente.
    expect(SRC).not.toContain("consumeNonce");
  });

  it("limite é 200 e o truncamento é DETECTADO (busca 201)", () => {
    expect(SRC).toContain("const LIMIT = 200");
    expect(SRC).toContain("LIMIT + 1");
    expect(SRC).toContain("truncated");
  });

  it("responde com a PROJEÇÃO, nunca com a linha crua", () => {
    expect(SRC).toContain("projectSupportAuditForVis");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/support-audit-route.test.ts`
Expected: FAIL — `ENOENT` (o arquivo da rota não existe)

- [ ] **Step 3: Implementar**

Criar `src/app/api/internal/vis/support/audit/route.ts`:

```ts
import { NextResponse } from "next/server";

import { isDbHostAllowed } from "@/lib/db-host-guard";
import { isSupportAccessEnabled } from "@/lib/support-activation";
import { listSupportAudit } from "@/lib/support-audit";
import { projectSupportAuditForVis } from "@/lib/support-audit-projection";
import { isValidHmacTimestamp } from "@/lib/vis-hmac-nonce-store";
import { verifyVisProvision } from "@/lib/vis-provision-hmac";

/**
 * GET /api/internal/vis/support/audit — PRIMEIRO canal de LEITURA Vis→Domus (N7).
 *
 * O operador do Vis precisa ver a trilha de acessos da clínica que o CLIENTE já
 * vê. O dado é autoritativo aqui; nada é replicado do outro lado.
 *
 * GET, e não POST-que-lê: `method` já é campo assinado no canonical string
 * (`version.method.path.nonce.ts.body`) e o corpo de um GET é string vazia, então
 * a primitiva EXISTENTE assina e verifica um GET sem alteração nenhuma.
 *
 * `clinicId` viaja num HEADER que entra na assinatura, não em querystring:
 * assinar query exigiria reconstruir path+query no verificador, abrindo
 * canonicalização (ordem de parâmetros, encoding, chave duplicada) que hoje não
 * existe — e mudaria a chave (nonce, path) do anti-replay.
 *
 * SEM `consumeNonce`, de propósito: anti-replay defende comando não-idempotente.
 * Reexecutar uma leitura não concede nada, e mantê-lo faria cada visualização
 * gravar linha durável no banco com PHI, além de transformar retry de rede em
 * 401 na tela usada justamente durante incidente.
 */

export const dynamic = "force-dynamic";

const PATH = "/api/internal/vis/support/audit";

/**
 * Teto de eventos por leitura. Folgado para o volume real (~7 eventos por ciclo
 * de acesso). Buscamos LIMIT+1 só para saber se há mais — truncar em SILÊNCIO
 * numa trilha de consentimento faria o operador concluir que um acesso não
 * aconteceu.
 */
const LIMIT = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  // (1) Flag primeiro: desligada, o endpoint não existe para efeito nenhum.
  if (!isSupportAccessEnabled()) {
    return NextResponse.json({ error: "not_enabled" }, { status: 503 });
  }

  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET ?? "";
  const ts = Number(req.headers.get("x-vis-timestamp"));
  const nonce = req.headers.get("x-vis-nonce") ?? "";
  const signature = req.headers.get("x-vis-signature") ?? "";
  const clinicIdHeader = req.headers.get("x-vis-clinic-id") ?? "";

  // (2) Janela de tempo ANTES do HMAC: `verifyVisProvision` compara com
  // Math.abs(now - ts), e NaN torna toda comparação falsa — sem esta checagem um
  // timestamp não-numérico passaria pela janela.
  if (!isValidHmacTimestamp(ts)) {
    return NextResponse.json({ error: "invalid_timestamp" }, { status: 401 });
  }

  // (3) HMAC path-bound. O clinicId entra no lugar do corpo: é GET, o corpo é
  // vazio, e é isto que amarra o tenant à assinatura.
  const ok = verifyVisProvision(secret, {
    version: 1,
    method: "GET",
    path: PATH,
    nonce,
    ts,
    body: clinicIdHeader,
    signature,
    now: Date.now(),
  });
  if (!ok) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // (4) Guard de host do banco: fail-closed em ambiente desconhecido.
  if (!isDbHostAllowed()) {
    return NextResponse.json({ error: "host_not_allowed" }, { status: 403 });
  }

  // (5) Formato do clinicId por ÚLTIMO, de propósito: ele veio num header
  // assinado, então no passo (3) já está autenticado. Validar formato antes do
  // HMAC daria resposta a quem não provou posse do segredo.
  if (!UUID_RE.test(clinicIdHeader)) {
    return NextResponse.json({ error: "invalid_clinic_id" }, { status: 400 });
  }

  const rows = await listSupportAudit(clinicIdHeader, LIMIT + 1);
  const truncated = rows.length > LIMIT;

  return NextResponse.json({
    events: projectSupportAuditForVis(rows.slice(0, LIMIT)),
    truncated,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/support-audit-route.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Typecheck**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx tsc --noEmit`
Expected: `TypeScript: No errors found`

- [ ] **Step 6: Suíte de suporte inteira (nada regrediu)**

Run: `cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/`
Expected: PASS, 0 FAIL (era 170 antes desta entrega; agora ~188)

- [ ] **Step 7: Commit**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS
git branch --show-current   # tem que ser: main
git add src/app/api/internal/vis/support/audit/route.ts tests/vis-support/support-audit-route.test.ts
git commit -m "feat(n7): endpoint de leitura da trilha de suporte

Primeiro canal de LEITURA Vis->Domus. GET (nao POST-que-le): method ja e
campo assinado e o corpo de um GET e string vazia, entao a primitiva
existente serve sem alteracao. clinicId viaja em header ASSINADO, nao em
querystring — assinar query exigiria reconstruir path+query no
verificador e abriria canonicalizacao.

Sem consumeNonce: anti-replay defende comando, nao leitura idempotente.
LIMIT 200 buscando 201 para detectar truncamento."
```

---

## Task 3: Revisão do Codex no canal (Domus)

**Files:** nenhum (revisão).

- [ ] **Step 1: Gerar o diff das Tasks 1-2**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS
git diff HEAD~2 > /tmp/n7-domus.diff
```

- [ ] **Step 2: Pedir a revisão**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS
codex exec --sandbox read-only "Revise criticamente este diff. Contexto: sistema clínico com PHI real (116 pacientes), LGPD/CFM. É o PRIMEIRO canal de LEITURA máquina-a-máquina do Vis (operadora) para o Domus, expondo a trilha imutável de acessos de suporte de uma clínica.

Decisões deliberadas (não são descuido — critique se estiverem ERRADAS, não por serem diferentes):
- GET em vez de POST: 'method' é campo assinado no canonical (version.method.path.nonce.ts.body) e o corpo de um GET é string vazia.
- clinicId viaja em header 'x-vis-clinic-id' que entra na assinatura NO LUGAR do corpo.
- SEM consumeNonce: leitura idempotente; manter faria cada view gravar linha durável e retry virar 401.
- Validação de formato do clinicId por ÚLTIMO (ele já vem autenticado pelo HMAC).
- Projeção por allowlist; actorUserId, ipAddress, userAgent NUNCA saem.

Perguntas:
1. O clinicId no lugar do 'body' da assinatura amarra mesmo o tenant? Dá para forjar/confundir com outro endpoint?
2. Sem nonce, existe algum ataque REAL (não teórico) contra uma leitura idempotente autenticada por HMAC com janela de 5min?
3. A allowlist da projeção tem furo? Considere details aninhado, prototype pollution, toJSON.
4. A ordem das guardas vaza algo por timing ou por diferença de resposta a quem não tem o segredo?
5. LIMIT 200 + busca de 201: correto para detectar truncamento?

Não edite nada. Classifique: FATAL / SERIOUS / MINOR. Diga GATE PASS ou GATE FAIL.

DIFF:
\$(cat /tmp/n7-domus.diff)" </dev/null 2>&1 | tail -60
```

- [ ] **Step 3: Tratar os achados**

Confirmar cada achado no código antes de aceitar. Corrigir os reais; rejeitar falso-positivo **com justificativa técnica escrita**. Máximo 2 rodadas. Se algo for corrigido, rodar de novo `npx vitest run tests/vis-support/` e `npx tsc --noEmit`, e commitar.

---

## Task 4: Cliente do canal (Vis)

**Files:**
- Create: `src/lib/vis-support-audit-client.ts`

- [ ] **Step 1: Implementar**

> Sem teste próprio: é I/O puro sobre uma primitiva já testada (`signVisProvision`) e a suíte do Domus já trava o outro lado. A lógica que MERECE teste (junção/ordenação) está na Task 5.

Criar `src/lib/vis-support-audit-client.ts`:

```ts
import { randomUUID } from "crypto";

import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente de LEITURA da trilha de suporte Vis → Domus (N7).
 *
 * Irmão de `vis-support-client.ts` (resgate), mesma primitiva e mesmo segredo,
 * outro path. GET: o corpo assinado é o `clinicId`, que é o que amarra o tenant
 * à assinatura sem depender de querystring.
 */

const PATH = "/api/internal/vis/support/audit";
const TIMEOUT_MS = 5000;

export interface SupportAuditEventFromDomus {
  id: string;
  /** Null em `code_generated` — o acesso ainda não existia. */
  grantId: string | null;
  event: string;
  visOperatorRef: string | null;
  createdAt: string;
  details: { reason?: string; expiresAt?: string } | null;
}

export type SupportAuditReadResult =
  | { kind: "ok"; events: SupportAuditEventFromDomus[]; truncated: boolean }
  /** Domus fora, lento, ou canal mal configurado. A tela AVISA — nunca finge vazio. */
  | { kind: "unavailable"; reason: string };

export async function getSupportAuditFromDomus(
  clinicId: string,
): Promise<SupportAuditReadResult> {
  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET ?? "";
  const baseUrl = process.env.DOMUS_WEBHOOK_URL ?? "";
  if (!secret || !baseUrl) {
    return { kind: "unavailable", reason: "canal_nao_configurado" };
  }

  const ts = Date.now();
  const nonce = randomUUID();
  const signature = signVisProvision(secret, {
    version: 1,
    method: "GET",
    path: PATH,
    nonce,
    ts,
    // O clinicId ocupa o lugar do corpo: é GET, o corpo é vazio.
    body: clinicId,
  });

  try {
    const res = await fetch(`${baseUrl}${PATH}`, {
      method: "GET",
      headers: {
        "x-vis-timestamp": String(ts),
        "x-vis-nonce": nonce,
        "x-vis-signature": signature,
        "x-vis-clinic-id": clinicId,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      return { kind: "unavailable", reason: `http_${res.status}` };
    }

    const json = (await res.json()) as {
      events?: SupportAuditEventFromDomus[];
      truncated?: boolean;
    };
    if (!Array.isArray(json.events)) {
      return { kind: "unavailable", reason: "resposta_invalida" };
    }
    return { kind: "ok", events: json.events, truncated: json.truncated === true };
  } catch {
    // Timeout, DNS, TLS, JSON quebrado — tudo indisponibilidade do ponto de
    // vista de quem lê a tela. NUNCA devolver lista vazia aqui.
    return { kind: "unavailable", reason: "falha_de_rede" };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: sem saída (0 erros)

- [ ] **Step 3: Commit**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
git branch --show-current   # tem que ser: main
git add src/lib/vis-support-audit-client.ts
git commit -m "feat(n7): cliente de leitura da trilha no Domus

Mesma primitiva e mesmo segredo do resgate, outro path. GET com o
clinicId ocupando o corpo assinado. Falha nunca vira lista vazia: o
resultado distingue ok de unavailable para a tela poder avisar."
```

---

## Task 5: Junção das duas trilhas (Vis)

**Files:**
- Create: `src/services/support-trail.service.ts`
- Test: `src/services/__tests__/support-trail.service.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";

import { mergeSupportTrail } from "@/services/support-trail.service";

/**
 * A JUNÇÃO das duas trilhas. Vis e Domus são deployments independentes com
 * relógios independentes (a camada HMAC tolera ±5min), então ordenar por
 * timestamp cru pode INVERTER causa e efeito. As regras aqui são a spec §3.3.
 */

const evDomus = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "d1",
  grantId: "g1",
  event: "session_activated",
  visOperatorRef: "vis-op-abc",
  createdAt: "2026-07-26T10:00:00.000Z",
  details: null,
  ...over,
});

const evVis = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "v1",
  action: "SUPPORT_ACCESS_GRANTED",
  createdAt: new Date("2026-07-26T10:00:00.000Z"),
  supportGrantId: "g1",
  operatorName: "Maria",
  ...over,
});

describe("mergeSupportTrail — origem", () => {
  it("marca cada item com a origem (autoridades diferentes)", () => {
    const out = mergeSupportTrail({
      domus: [evDomus() as never],
      vis: [evVis() as never],
    });
    expect(out.map((e) => e.origem).sort()).toEqual(["medical", "vis"]);
  });
});

describe("mergeSupportTrail — ordem lógica quando o horário empata", () => {
  it("code_redeemed vem antes de token_issued (mesma transação, createdAt IDÊNTICO)", () => {
    // Garantido pelo Postgres: DEFAULT now() é transaction_timestamp().
    const mesmoInstante = "2026-07-26T10:00:00.000Z";
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "b", event: "token_issued", createdAt: mesmoInstante }) as never,
        evDomus({ id: "a", event: "code_redeemed", createdAt: mesmoInstante }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("mergeSupportTrail — access_denied NÃO tem rank fixo", () => {
  it("uma recusa POSTERIOR não é reordenada para antes da sua causa", () => {
    // Corrida ordinária: o cliente revoga enquanto o operador abre o link.
    // pending_access_revoked (causa) → access_denied (efeito), mesmo grant.
    // Um rank fixo colocaria a recusa antes da revogação que a provocou —
    // inversão de causa e efeito num artefato de LGPD.
    const out = mergeSupportTrail({
      domus: [
        evDomus({
          id: "efeito",
          event: "access_denied",
          createdAt: "2026-07-26T10:00:05.000Z",
        }) as never,
        evDomus({
          id: "causa",
          event: "pending_access_revoked",
          createdAt: "2026-07-26T10:00:01.000Z",
        }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["causa", "efeito"]);
  });
});

describe("mergeSupportTrail — o evento de consentimento", () => {
  it("code_generated (sem grantId) NÃO é descartado nem vira órfão", () => {
    // É o ato de consentimento do cliente: o item mais importante para LGPD.
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "consent", event: "code_generated", grantId: null,
                  visOperatorRef: null, createdAt: "2026-07-26T09:00:00.000Z" }) as never,
        evDomus({ id: "resgate", event: "code_redeemed",
                  createdAt: "2026-07-26T10:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["consent", "resgate"]);
    expect(out[0].operador).toBeNull();
  });
});

describe("mergeSupportTrail — resolução do operador", () => {
  it("usa o nome real do GlobalAudit quando o grant casa", () => {
    const out = mergeSupportTrail({
      domus: [evDomus({ grantId: "g1" }) as never],
      vis: [evVis({ supportGrantId: "g1", operatorName: "Maria" }) as never],
    });
    const medical = out.find((e) => e.origem === "medical");
    expect(medical?.operador).toBe("Maria");
  });

  it("cai no ref opaco quando não há contraparte local — nunca em branco", () => {
    const out = mergeSupportTrail({
      domus: [evDomus({ grantId: "g-sem-par", visOperatorRef: "vis-op-xyz" }) as never],
      vis: [],
    });
    const medical = out.find((e) => e.origem === "medical");
    expect(medical?.operador).toBe("vis-op-xyz");
  });
});

describe("mergeSupportTrail — agrupamento por dia", () => {
  it("agrupa por dia, mais recente primeiro", () => {
    const out = mergeSupportTrail({
      domus: [
        evDomus({ id: "ontem", createdAt: "2026-07-25T10:00:00.000Z" }) as never,
        evDomus({ id: "hoje", createdAt: "2026-07-26T10:00:00.000Z" }) as never,
      ],
      vis: [],
    });
    expect(out.map((e) => e.id)).toEqual(["hoje", "ontem"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/services/__tests__/support-trail.service.test.ts`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

Criar `src/services/support-trail.service.ts`:

```ts
import type { SupportAuditEventFromDomus } from "@/lib/vis-support-audit-client";

/**
 * Junção das DUAS trilhas do acesso de suporte (N7).
 *
 * São complementares: o Domus tem o ciclo completo mas é cego às tentativas que
 * falharam antes de virar acesso; o Vis registra essas recusas e nada do que veio
 * depois. Junta-se em memória, no request — nada é replicado.
 *
 * ⚠️ DOIS RELÓGIOS. Vis e Domus são deployments independentes e a camada HMAC
 * tolera ±5min de diferença. Ordenar tudo por timestamp cru poderia inverter
 * causa e efeito. Por isso: agrupa por DIA, e dentro do dia o horário ordena;
 * o rank lógico só desempata quando o horário é IDÊNTICO (caso garantido:
 * code_redeemed × token_issued, gravados na mesma transação).
 */

/**
 * Ordem lógica do ciclo. Só entra em jogo com `createdAt` IDÊNTICO.
 *
 * `access_denied` está deliberadamente FORA: ele pode ocorrer DEPOIS de
 * `pending_access_revoked` para o mesmo grant (o cliente revoga enquanto o
 * operador abre o link), e um rank fixo o colocaria antes da sua própria causa.
 * Como ambos vêm do Domus, sob um relógio só, o horário já os ordena.
 */
const RANK: Record<string, number> = {
  code_generated: 1,
  code_redeemed: 2,
  token_issued: 3,
  session_activated: 4,
  pending_access_revoked: 5,
  session_revoked: 7,
};

const RANK_DESCONHECIDO = 99;

export interface TrailItem {
  id: string;
  origem: "medical" | "vis";
  event: string;
  createdAt: string;
  /** Nome real quando resolvido localmente; ref opaco como fallback; null quando o ato é do cliente. */
  operador: string | null;
  grantId: string | null;
  reason: string | null;
  /** Dia (YYYY-MM-DD) para agrupar na tela. */
  dia: string;
}

export interface VisAuditRow {
  id: string;
  action: string;
  createdAt: Date;
  supportGrantId: string | null;
  operatorName: string | null;
}

function diaDe(iso: string): string {
  return iso.slice(0, 10);
}

export function mergeSupportTrail(input: {
  domus: SupportAuditEventFromDomus[];
  vis: VisAuditRow[];
}): TrailItem[] {
  // Mapa grant → operador real. O nome vem do GlobalAudit, que já grava actorId
  // e adminEmail em CLARO. NÃO se recomputa HMAC de todo admin para montar mapa
  // reverso: isso materializaria uma tabela pseudônimo→nome de toda a equipe.
  const operadorPorGrant = new Map<string, string>();
  for (const v of input.vis) {
    if (v.supportGrantId && v.operatorName) {
      operadorPorGrant.set(v.supportGrantId, v.operatorName);
    }
  }

  const doDomus: TrailItem[] = input.domus.map((e) => ({
    id: e.id,
    origem: "medical" as const,
    event: e.event,
    createdAt: e.createdAt,
    // Sem grant (code_generated) o ato é do CLIENTE — não há operador a exibir.
    operador: e.grantId
      ? operadorPorGrant.get(e.grantId) ?? e.visOperatorRef
      : null,
    grantId: e.grantId,
    reason: e.details?.reason ?? null,
    dia: diaDe(e.createdAt),
  }));

  const doVis: TrailItem[] = input.vis.map((v) => {
    const iso = v.createdAt.toISOString();
    return {
      id: v.id,
      origem: "vis" as const,
      event: v.action,
      createdAt: iso,
      operador: v.operatorName,
      grantId: v.supportGrantId,
      reason: null,
      dia: diaDe(iso),
    };
  });

  return [...doDomus, ...doVis].sort((a, b) => {
    // Mais recente primeiro.
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    // Horário IDÊNTICO: só aqui o rank lógico decide, e em ordem crescente
    // (o ciclo lido de cima para baixo dentro do mesmo instante).
    const ra = RANK[a.event] ?? RANK_DESCONHECIDO;
    const rb = RANK[b.event] ?? RANK_DESCONHECIDO;
    return ra - rb;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run src/services/__tests__/support-trail.service.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: SABOTAR para provar o teste de causa/efeito**

Adicionar `access_denied: 6` ao objeto `RANK` (o rank fixo que a spec proíbe) e rodar de novo.
Expected: **FAIL** em "uma recusa POSTERIOR não é reordenada para antes da sua causa"?
→ **Não necessariamente**: como os horários diferem, o rank não é consultado. Se o teste passar, **isto está correto** — mas então troque também os `createdAt` dos dois eventos para o mesmo instante e confirme que aí a inversão aparece. Documente no teste qual das duas situações vale.
Depois **desfazer a sabotagem**.

- [ ] **Step 6: Commit**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
git branch --show-current   # tem que ser: main
git add src/services/support-trail.service.ts src/services/__tests__/support-trail.service.test.ts
git commit -m "feat(n7): juncao das duas trilhas de acesso de suporte

Dois relogios independentes (HMAC tolera 5min): agrupa por dia, horario
ordena dentro do dia, e o rank logico so desempata createdAt IDENTICO —
caso garantido entre code_redeemed e token_issued (mesma transacao).

access_denied fica FORA do rank de proposito: pode vir depois de
pending_access_revoked para o mesmo grant (cliente revoga enquanto o
operador abre o link) e um rank fixo o poria antes da propria causa.

Operador resolvido pelo GlobalAudit local, nunca recomputando HMAC."
```

---

## Task 6: Rota autenticada com gate de papel (Vis)

**Files:**
- Create: `src/app/api/admin/companies/[id]/support-trail/route.ts`
- Test: `src/app/api/admin/companies/[id]/support-trail/route.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

/**
 * GATE DE PAPEL — a propriedade que nenhum criativo do painel viu.
 *
 * A página de detalhe do cliente usa `requireSupportScope`, que NÃO checa papel
 * (docstring explícita), e `AdminUser.role` tem default SUPPORT com
 * scopeAllCompanies default true. Sem gate PRÓPRIO, a trilha de quem acessou o
 * PHI nasceria visível para SUPPORT e BILLING em todas as empresas.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/app/api/admin/companies/[id]/support-trail/route.ts"),
  "utf8",
);

describe("GET support-trail — autorização", () => {
  it("usa requireCompanyScope (que CHECA papel), não requireSupportScope", () => {
    expect(SRC).toContain("requireCompanyScope");
    expect(SRC).not.toContain("requireSupportScope");
  });

  it("exige sessão de admin antes de qualquer coisa", () => {
    const sessao = SRC.indexOf("getAdminSession");
    const escopo = SRC.indexOf("requireCompanyScope");
    expect(sessao).toBeGreaterThan(-1);
    expect(sessao).toBeLessThan(escopo);
  });

  it("o clinicId vem do CADASTRO, nunca do input do operador", () => {
    expect(SRC).toContain("domusClinicId");
    expect(SRC).not.toContain("searchParams.get(\"clinicId\")");
  });

  it("autoriza ANTES de falar com o Domus", () => {
    const escopo = SRC.indexOf("requireCompanyScope");
    const domus = SRC.indexOf("getSupportAuditFromDomus");
    expect(escopo).toBeLessThan(domus);
  });

  it("falha do Domus NUNCA vira lista vazia", () => {
    expect(SRC).toContain("unavailable");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/api/admin/companies/[id]/support-trail/route.test.ts"`
Expected: FAIL — `ENOENT`

- [ ] **Step 3: Implementar**

Criar `src/app/api/admin/companies/[id]/support-trail/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getSupportAuditFromDomus } from "@/lib/vis-support-audit-client";
import { mergeSupportTrail } from "@/services/support-trail.service";

/**
 * GET /api/admin/companies/[id]/support-trail — trilha de acessos de suporte da
 * clínica, para o OPERADOR (N7).
 *
 * ⚠️ GATE PRÓPRIO, e não o da página. O detalhe do cliente usa
 * `requireSupportScope`, que NÃO checa papel de propósito (a equipe de suporte
 * precisa ver a ficha). Mas `AdminUser.role` tem default SUPPORT com
 * scopeAllCompanies default true — herdar aquele gate abriria a trilha de acesso
 * a PHI para SUPPORT e BILLING em todas as empresas. `requireCompanyScope` exige
 * SUPER_ADMIN ou ADMIN, que é o mesmo gate do resgate: quem concede, audita.
 */

export const dynamic = "force-dynamic";

const ACOES_SUPORTE = [
  "SUPPORT_ACCESS_GRANTED",
  "SUPPORT_ACCESS_DENIED",
  "SUPPORT_ACCESS_STUCK",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) {
    return NextResponse.json(
      { error: "Sem permissão para esta empresa" },
      { status: 403 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { domusClinicId: true },
  });

  // Trilha local: as tentativas que nunca viraram acesso — o Domus é cego a elas.
  const visRows = await prisma.globalAudit.findMany({
    where: { companyId, action: { in: ACOES_SUPORTE } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { adminUser: { select: { name: true, email: true } } },
  });

  const vis = visRows.map((r) => {
    const meta = (r.metadata ?? {}) as { supportGrantId?: string; adminEmail?: string };
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      supportGrantId: meta.supportGrantId ?? null,
      // Nome real do operador: já está em claro no GlobalAudit. O e-mail
      // congelado no metadata é o fallback para admin removido depois.
      operatorName: r.adminUser?.name ?? r.adminUser?.email ?? meta.adminEmail ?? null,
    };
  });

  if (!company?.domusClinicId) {
    return NextResponse.json({
      data: { items: mergeSupportTrail({ domus: [], vis }), truncated: false, medical: "not_provisioned" },
    });
  }

  const remoto = await getSupportAuditFromDomus(company.domusClinicId);

  if (remoto.kind === "unavailable") {
    // Degrada com a metade local + aviso. NUNCA lista vazia: trilha vazia que
    // significa erro de rede leva a concluir que não houve acesso.
    return NextResponse.json({
      data: {
        items: mergeSupportTrail({ domus: [], vis }),
        truncated: false,
        medical: "unavailable",
      },
    });
  }

  return NextResponse.json({
    data: {
      items: mergeSupportTrail({ domus: remoto.events, vis }),
      truncated: remoto.truncated,
      medical: "ok",
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run "src/app/api/admin/companies/[id]/support-trail/route.test.ts"`
Expected: PASS (5 testes)

- [ ] **Step 5: Typecheck**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros

- [ ] **Step 6: Commit**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
git branch --show-current   # tem que ser: main
git add "src/app/api/admin/companies/[id]/support-trail/route.ts" "src/app/api/admin/companies/[id]/support-trail/route.test.ts"
git commit -m "feat(n7): rota da trilha com gate de papel proprio

A pagina de detalhe usa requireSupportScope, que NAO checa papel de
proposito — e AdminUser.role tem default SUPPORT com scopeAllCompanies
default true. Herdar aquele gate abriria a trilha de acesso a PHI para
SUPPORT e BILLING em todas as empresas. Aqui exige SUPER_ADMIN/ADMIN:
quem concede o acesso, audita o acesso.

Falha do Domus degrada para a metade local COM aviso, nunca lista vazia."
```

---

## Task 7: O card na tela (Vis)

**Files:**
- Create: `src/app/admin/(painel)/clientes/[id]/company-support-trail.tsx`
- Modify: `src/app/admin/(painel)/clientes/[id]/page.tsx`

- [ ] **Step 1: Ler os arquivos de referência**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
sed -n '1,60p' "src/app/admin/(painel)/clientes/[id]/company-support-access.tsx"
grep -n "TabPanel tabId=\"clinica\"" -A 12 "src/app/admin/(painel)/clientes/[id]/page.tsx"
grep -n "requireSupportScope\|const scoped\|const admin" "src/app/admin/(painel)/clientes/[id]/page.tsx" | head
```

Copiar as classes Tailwind e o estilo do card irmão. **Não inventar design novo.**

- [ ] **Step 2: Criar o componente**

Criar `src/app/admin/(painel)/clientes/[id]/company-support-trail.tsx` como client component seguindo estas regras:

- Props: `{ companyId: string }`.
- Fechado por padrão. Botão "Ver histórico de acessos" dispara `GET /api/admin/companies/${companyId}/support-trail`.
- Estado local: `idle | loading | ready | error`.
- Container idêntico ao card irmão: `div.rounded-xl.border.border-border.bg-card.p-5`, título `h3` com ícone (`History` de `lucide-react`), parágrafo de apoio.
- **Quatro estados de resultado**, exatamente como a spec §3.4:
  1. `medical: "ok"` com itens → lista agrupada por `dia` (cabeçalho de dia + itens).
  2. `items.length === 0` e `medical: "ok"` → "Nenhum acesso de suporte registrado para esta clínica."
  3. `medical: "unavailable"` → faixa de aviso âmbar "Não foi possível consultar o Medical agora — mostrando apenas o que o Vis registrou." **acima** da lista local.
  4. `truncated: true` → nota ao pé: "Mostrando os 200 eventos mais recentes."
- Cada item: horário (`HH:mm`), rótulo do evento em português, operador (quando houver), e um selo discreto de origem (`Medical` / `Vis`). Quando `reason` existir num encerramento, exibi-lo com destaque.
- Rótulos: mapa local `Record<string, string>` cobrindo os 7 eventos do Domus + as 3 ações do Vis, com fallback genérico para evento desconhecido (o vocabulário não tem CHECK constraint).

- [ ] **Step 3: Montar na página, atrás do gate de papel**

Em `src/app/admin/(painel)/clientes/[id]/page.tsx`, dentro do `<TabPanel tabId="clinica">`, logo após `<CompanySupportAccess ... />`:

```tsx
{podeVerTrilha && <CompanySupportTrail companyId={company.id} />}
```

E antes do return, junto das outras checagens:

```tsx
// Gate de PAPEL, separado do gate da página: `requireSupportScope` (linha ~45)
// não checa papel de propósito, e AdminUser.role tem default SUPPORT. A trilha
// de quem acessou o PHI só aparece para quem também poderia conceder o acesso.
const podeVerTrilha = scoped.role === "SUPER_ADMIN" || scoped.role === "ADMIN";
```

> A rota já barra por conta própria (Task 6). Este gate evita renderizar um card que só daria 403.

- [ ] **Step 4: Typecheck**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit`
Expected: 0 erros

- [ ] **Step 5: Build**

Run: `cd "/Users/matheusreboucas/PDV OTICA" && npm run build`
Expected: sucesso; a rota `/api/admin/companies/[id]/support-trail` aparece como `ƒ` (dinâmica)

- [ ] **Step 6: Commit**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
git branch --show-current   # tem que ser: main
git add "src/app/admin/(painel)/clientes/[id]/company-support-trail.tsx" "src/app/admin/(painel)/clientes/[id]/page.tsx"
git commit -m "feat(n7): card da trilha de acessos no detalhe do cliente

Sob demanda: a ficha abre na hora e so paga a ida ao Domus quem pede a
trilha. Quatro estados distintos — com dados, vazio de verdade, Medical
indisponivel (com a metade local) e truncado. Falha nunca vira lista
vazia, que levaria a concluir que nao houve acesso."
```

---

## Task 8: Revisão do Codex no lado Vis

**Files:** nenhum (revisão).

- [ ] **Step 1: Gerar o diff das Tasks 4-7**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
git diff HEAD~4 > /tmp/n7-vis.diff
```

- [ ] **Step 2: Pedir a revisão**

```bash
cd "/Users/matheusreboucas/PDV OTICA"
codex exec --sandbox read-only "Revise criticamente este diff do super admin de um SaaS. Ele exibe a trilha de quem acessou dado clínico (PHI) de uma clínica, juntando duas fontes: um sistema remoto (autoritativo) e a auditoria local.

Contexto de autorização (importante): a PÁGINA de detalhe do cliente usa requireSupportScope, que NÃO checa papel de propósito; AdminUser.role tem default SUPPORT e scopeAllCompanies default true. Por isso a rota nova usa requireCompanyScope, que exige SUPER_ADMIN/ADMIN.

Perguntas:
1. O gate de papel está completo? Dá para chegar aos dados por algum caminho que não passe por requireCompanyScope?
2. O clinicId vem de Company.domusClinicId no servidor. Existe algum caminho em que input do operador influencie qual clínica é consultada?
3. A junção das duas trilhas pode ATRIBUIR errado um operador a um evento (mapa grant→nome)? Considere grant repetido, metadata ausente, admin removido.
4. Falha do sistema remoto pode virar lista vazia silenciosa em algum caminho? Isso seria grave: levaria a concluir que não houve acesso.
5. Algum dado sensível vaza para o browser (props do client component, payload da rota)?

Não edite nada. Classifique: FATAL / SERIOUS / MINOR. Diga GATE PASS ou GATE FAIL.

DIFF:
\$(cat /tmp/n7-vis.diff)" </dev/null 2>&1 | tail -60
```

- [ ] **Step 3: Tratar os achados**

Confirmar no código antes de aceitar. Corrigir os reais, rejeitar falso-positivo com justificativa escrita. Máximo 2 rodadas. Rodar testes e typecheck de novo após qualquer correção, e commitar.

---

## Task 9: Verificação final (OBRIGATÓRIA)

- [ ] **Step 1: Typecheck dos dois repos**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx tsc --noEmit
cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/tsc --noEmit
```
Expected: 0 erros nos dois.

- [ ] **Step 2: Testes**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS && npx vitest run tests/vis-support/
cd "/Users/matheusreboucas/PDV OTICA" && ./node_modules/.bin/vitest run
```
Expected: Domus 0 FAIL na suíte `vis-support`. Vis: todos passam.

> ⚠️ NÃO rodar a suíte completa do Domus: ela tem ~151 falhas pré-existentes de infraestrutura (integração sem banco de teste), idênticas no baseline. Não reinvestigar.

- [ ] **Step 3: Build de produção do Vis**

```bash
cd "/Users/matheusreboucas/PDV OTICA" && npm run build
```
Expected: sucesso.

- [ ] **Step 4: Confirmar que nada de schema mudou**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS && git diff HEAD~6 --stat -- src/db/schema.ts drizzle/
cd "/Users/matheusreboucas/PDV OTICA" && git diff HEAD~5 --stat -- prisma/
```
Expected: **saída vazia nos dois**. Esta entrega não tem migração; qualquer linha aqui é erro.

- [ ] **Step 5: Commitar o que sobrou e relatar**

```bash
cd /Users/matheusreboucas/SISTEMACLINICADOMUS && git status --short
cd "/Users/matheusreboucas/PDV OTICA" && git status --short
```

Relatar ao dono: o que foi implementado, o que o Codex apontou, o que foi corrigido, o que foi rejeitado e por quê, o que rodou, e o que **não** deu para validar (integração real do canal exige os dois lados deployados).

⚠️ **NÃO fazer `git push`.** Os dois lados precisam subir coordenados — o card no Vis chama um endpoint que só existe depois do deploy do Domus. Ordem recomendada ao dono: **Domus primeiro, Vis depois**. Sem migração e sem segredo novo em nenhum dos dois.
