# Runbook: Rollback de Produção

> Quando um deploy quebra produção (vis.app.br), este é o caminho para voltar ao estado anterior **rápido**.

## Sinais de que algo está errado

- O smoke pós-deploy falhou: `npx tsx scripts/post-deploy-smoke.ts https://vis.app.br` retornou ❌.
- Página principal ou `/admin` mostrando "Algo deu errado" / 500.
- `/api/health?deep=1` retornando `"db":"down"` de forma persistente (não só cold start).
- Alerta no Sentry vindo de `[monitoramento]` (db down, erro alto, latência).

## Passo 1 — Confirmar o estado

```bash
# Health público (deve ser 200 + status ok)
curl -s https://vis.app.br/api/health

# Smoke completo
npx tsx scripts/post-deploy-smoke.ts https://vis.app.br
```

Se o smoke passar, provavelmente NÃO é o deploy — investigue (banco, env var, serviço externo) antes de reverter.

## Passo 2 — Rollback instantâneo (Vercel)

O Vercel mantém os deployments anteriores prontos. `vercel rollback` repromove o deployment **imediatamente anterior** (troca o alias de produção; não rebuilda — segundos).

```bash
# Caminho do binário (não está no PATH do shell): use o caminho completo se "vercel" não for encontrado
VC="$(npm config get prefix)/bin/vercel"   # ou: ~/.nvm/versions/node/<versão>/bin/vercel

# Reverter para o deployment anterior
"$VC" rollback

# OU reverter para um deployment específico (pegue a URL em `vercel ls`)
"$VC" ls
"$VC" rollback <deployment-url>
```

Depois do rollback, **rode o smoke de novo** para confirmar que voltou ao normal:

```bash
npx tsx scripts/post-deploy-smoke.ts https://vis.app.br
```

## Passo 3 — ⚠️ Cuidado com migrations

O build de produção roda `prisma migrate deploy` (ver `package.json` → `build`). Migrations são **aditivas** neste projeto (CREATE TABLE / ADD COLUMN), então um rollback de código geralmente é seguro: o código antigo simplesmente ignora colunas/tabelas novas.

**Risco real** só existe se um deploy tiver feito uma migration **destrutiva** (DROP/ALTER que remove/renomeia). Nesse caso, reverter o código NÃO desfaz a migration — o schema do banco ficou à frente. Antes de reverter:

1. Verifique se o deploy quebrado incluiu migration destrutiva (`git log` da migration + `prisma/migrations/`).
2. Se sim, restaurar exige reverter a migration manualmente (escrever o SQL inverso) OU restaurar um backup do Neon (point-in-time recovery no painel do Neon).
3. Migrations puramente aditivas: rollback de código é seguro, sem ação no banco.

> **Regra:** evite migrations destrutivas em deploys junto com mudanças de código. Faça-as isoladas e com janela de manutenção.

## Passo 4 — Pós-rollback

- Comunique (se houver usuários ativos impactados).
- Abra a causa-raiz: o deploy quebrado continua disponível para inspeção (`vercel inspect <url>`, `vercel logs <url>`).
- Corrija na branch, rode `npx tsc --noEmit && npm test && npx next build` localmente, e só então re-deploy.

## Upgrade futuro (rollback automático)

Rollback automático por canary (Rolling Releases) é um recurso de planos **Pro+** do Vercel. Hoje (plano Hobby) o rollback é **manual** via `vercel rollback`. Se o volume crescer, migrar para Pro + Rolling Releases dá rollback automático quando a taxa de erro de um novo deploy passa de um limiar.

## Referência rápida

| Situação | Ação |
|---|---|
| Smoke falhou, deploy recente | `vercel rollback` + smoke de novo |
| db down persistente | Checar painel Neon (compute suspenso? limite atingido?) antes de reverter |
| Migration destrutiva no deploy | NÃO basta rollback de código — reverter SQL / restaurar backup Neon |
| Tudo verde mas usuário reclama | Investigar antes de reverter (pode não ser o deploy) |
