# Pre-Deploy — Antes de mergear a branch

## Objetivo
Subir o código de feature gating em produção SEM efeito visível (kill switch ligado por padrão). Isso permite testar gradualmente e ativar só quando estiver tudo pronto.

## Checklist

### 1. Garantir kill switch em produção
Antes de fazer o deploy, no painel da Vercel:

- Settings → Environment Variables → adicionar:
  - **Name:** `DISABLE_PLAN_FEATURE_GATING`
  - **Value:** `true`
  - **Environment:** Production (e Preview se quiser)
- Salvar. NÃO precisa redeploy ainda.

### 2. Abrir PR e mergear
```bash
cd "/Users/matheusreboucas/PDV OTICA"
git fetch
git checkout feature/plano-basico-gating
git push -u origin feature/plano-basico-gating
gh pr create --base main --title "feat: feature gating do plano Básico (R$ 149,90)" --body-file docs/superpowers/runbooks/pr-body.md
```
(Crie `pr-body.md` se quiser um body customizado — pode também usar o conteúdo do INDEX como base.)

### 3. Mergear a PR
Após aprovação, merge para `main`. Vercel deploya automaticamente.

### 4. Smoke pós-deploy
- Logar com qualquer conta (Básico ou Pro) — deve carregar tudo normal (kill switch ON)
- Visitar `/dashboard/financeiro/dre` — deve abrir (não redireciona)
- `curl https://prod/api/finance/entries` autenticado — deve responder 200 (não 403)

### 5. Confirmar `/api/plan-features`
```bash
# Logar no app, copiar cookie de sessão e:
curl -s -H "Cookie: <sessão>" https://prod/api/plan-features | jq '.features | keys'
```
Esperado: lista incluindo as 13 keys novas (`lens_treatments`, `dre_report`, etc) marcadas como `"true"` (porque kill switch).

Se algum desses smoke falha → não prosseguir. Investigar. Não é seguro avançar para D-7 sem isso.
