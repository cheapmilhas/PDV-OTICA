# Vulnerabilidades conhecidas e mitigações

Documento de transparência sobre CVEs não corrigidos imediatamente, com justificativa e plano.

## xlsx (SheetJS) — Prototype Pollution + ReDoS

**CVEs**: GHSA-4r6h-8v6p-xvw6 (Prototype Pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS)
**Severidade**: high
**Status**: ⚠️ mitigado, migração planejada

### Onde é usado
- `src/app/api/customers/{template,export,import}/route.ts`
- `src/app/api/products/{template,export,import}/route.ts`
- `src/app/api/suppliers/{template,export,import}/route.ts`
- `src/components/configuracoes/import-data.tsx`

### Avaliação de risco
- **Vetor**: arquivos XLSX maliciosos enviados via endpoints `/import`.
- **Mitigação atual**: endpoints `/import` exigem autenticação + permissão (`PROTECTED ADMIN`),
  são multi-tenant (filtro `companyId`) e processam dados em escopo restrito.
- **Não-exploitable** por: usuários anônimos, outros tenants, ou via XSS — vetor exige
  upload autenticado com permissão de admin no próprio tenant.
- **Risco residual**: admin malicioso ou comprometido pode tentar Prototype Pollution
  no Node.js do servidor. Como o processo é serverless (Vercel Functions, isolado por
  invocation), o blast radius é limitado.

### Plano de migração
Substituir `xlsx` por `exceljs` (sem CVEs conhecidos, API similar). Migração arquivo-por-arquivo
em Sprint 3 ou conforme tocarmos cada endpoint para outras features. Não bloqueia o S2.

### Verificação
```bash
npm audit | grep -A 3 "xlsx"
```

---

## @anthropic-ai/sdk — Insecure Default File Permissions

**CVE**: GHSA-p7fg-763f-g4gf
**Severidade**: moderate
**Status**: ⚠️ não afeta uso atual

### Onde é usado
- `src/app/api/ocr/prescription/route.ts` — Vision API para OCR de receita

### Avaliação de risco
A CVE afeta o **Local Filesystem Memory Tool** do SDK, que **não é usado** no projeto.
Usamos apenas chamadas HTTP de inferência (`anthropic.messages.create`).

### Plano
Atualizar para `@anthropic-ai/sdk@>=0.98.0` no próximo update geral de dependências
(breaking change menor, planejado para S3+).
