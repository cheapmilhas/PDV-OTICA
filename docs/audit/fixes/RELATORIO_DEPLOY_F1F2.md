
---

## ATUALIZAÇÃO 2026-06-10 (noite) — deploy do CÓDIGO via integração

- **Correção:** o "cockpit em prod" e o "commit órfão 963d186" foram falsos positivos (401/307 = middleware admin; produção real = `e382a0b` / branch `feat/auto-sync-fase-b` / auto-sync, confirmado via API Vercel). Não havia cockpit a preservar.
- **Integração:** branch `deploy/integracao-prod` = `e382a0b` (produção/auto-sync) + cherry-pick F1+F2 (4 commits, **zero conflitos**). Validado: tsc 0, **567 testes**, `next build` OK (426 rotas), rotas auto-sync presentes.
- **ALVO DE ROLLBACK DE CÓDIGO:** deployment de produção atual = **`dpl_5Q48SwzLrhAEdKDMKXPJ74boYaZX`** (sha `e382a0b`, auto-sync, 21:01). Rollback = Vercel → esse deployment → Promote to Production.
- **Push:** `git push origin deploy/integracao-prod:main` (fast-forward, sem force) — dispara deploy automático da Vercel (produção = branch `main`).
- **Pós-push:** `prisma migrate resolve --applied` nas 2 migrations F2 (já no banco) + seed permissões + smoke.
- ⚠️ Revogar VERCEL_TOKEN `vcp_4iN8…` (exposto no chat) ao fim.
