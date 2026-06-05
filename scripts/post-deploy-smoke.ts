// scripts/post-deploy-smoke.ts
//
// Smoke test pós-deploy (Fase 6). Bate em rotas-chave e sai com código != 0 se algo
// estiver 5xx ou o banco estiver fora. Rodar manualmente após `vercel deploy --prod`:
//
//   npx tsx scripts/post-deploy-smoke.ts https://vis.app.br
//   npx tsx scripts/post-deploy-smoke.ts            # default vis.app.br
//
// Não depende de DB/env do projeto — só faz HTTP. Pensado p/ rodar do terminal local
// ou de um passo de CI após o deploy.

const BASE = (process.argv[2] ?? "https://vis.app.br").replace(/\/$/, "");

interface Check {
  name: string;
  path: string;
  expect: (status: number, body: string) => boolean;
  describe: string;
}

const checks: Check[] = [
  {
    name: "health",
    path: "/api/health",
    describe: "health público responde 200 com status ok",
    expect: (s, b) => s === 200 && /"status"\s*:\s*"ok"/.test(b),
  },
  {
    name: "health-deep",
    path: "/api/health?deep=1",
    // db pode dar 'degraded' num cold start do Neon; só falha se 'down' ou HTTP 503.
    describe: "health deep não está down (banco acessível)",
    expect: (s, b) => s !== 503 && !/"db"\s*:\s*"down"/.test(b),
  },
  {
    name: "login",
    path: "/login",
    describe: "página de login carrega (200)",
    expect: (s) => s === 200,
  },
  {
    name: "admin-protected",
    path: "/api/admin/observability",
    // sem cookie de admin → 401 é o esperado (rota viva e protegida, não 5xx).
    describe: "endpoint admin está protegido (401, não 5xx)",
    expect: (s) => s === 401,
  },
];

async function run(): Promise<void> {
  console.log(`\nSmoke pós-deploy → ${BASE}\n`);
  let failed = 0;

  for (const c of checks) {
    const url = `${BASE}${c.path}`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const body = await res.text().catch(() => "");
      const ok = c.expect(res.status, body);
      // 5xx é sempre falha, independente do predicado.
      const is5xx = res.status >= 500;
      if (ok && !is5xx) {
        console.log(`  ✅ ${c.name.padEnd(16)} HTTP ${res.status} — ${c.describe}`);
      } else {
        failed++;
        console.log(`  ❌ ${c.name.padEnd(16)} HTTP ${res.status} — esperado: ${c.describe}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${c.name.padEnd(16)} ERRO de rede — ${msg}`);
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`Smoke FALHOU: ${failed} de ${checks.length} checagens. Considere rollback (ver docs/runbooks/rollback.md).\n`);
    process.exit(1);
  }
  console.log(`Smoke OK: ${checks.length}/${checks.length} checagens passaram.\n`);
  process.exit(0);
}

run();
