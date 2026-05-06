# 15 — Segurança e LGPD

## Parte A — Segurança

### 1. Headers HTTP

Configurados em `next.config.ts:17-29` para todas as rotas (`source: "/(.*)"`):
| Header | Valor |
|---|---|
| `X-Frame-Options` | `DENY` ✅ |
| `X-Content-Type-Options` | `nosniff` ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` ✅ |

❌ **Faltando:**
- `Content-Security-Policy` (CSP) — qualquer XSS pode injetar script de domínio externo
- `Strict-Transport-Security` (HSTS) — sem força de HTTPS no browser
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` — sem isolation

🟠 **CSP ausente** é o gap mais crítico aqui.

### 2. Rate limiting

Implementado em `src/lib/rate-limit.ts` (in-memory Map). Aplicado em apenas **3 routes** (rel. 13 N6):
- `/api/sales` POST — 30/min/user
- `/api/cash/shift` POST — 10/min/user
- `/api/cash/shift/close` POST — 10/min/user

🟠 **Cobertura insuficiente.** Endpoints **sem rate limit** que deveriam ter:
- `/api/auth/[...nextauth]` (login — alvo de credential stuffing)
- `/api/admin-auth/login` (admin)
- `/api/ocr/prescription` (Anthropic SDK — caro)
- `/api/upload/prescription-image` (10MB upload)
- `/api/company/logo` (upload)
- `/api/customers/import`, `/api/products/import` (XLSX caro)
- `/api/customers/export`, `/api/products/export` (XLSX caro)
- `/api/sales/[id]/pdf`, `/api/sales/[id]/carne` (geração de PDF)
- `/api/barcodes/generate-image` (público + CPU/memory abuse)
- Toda `/api/public/*` (sem auth — bot pode abusar)

### 3. CSRF

NextAuth v5 — proteção CSRF nativa via cookie HttpOnly + SameSite=Lax.

✅ **Adequado para JWT em cookie HttpOnly.** Mas:
- `sameSite: "lax"` permite navegação top-level (mitigado por método POST + JSON content-type para mutações)
- 🟡 Login admin paralelo (`admin-auth/login`) — não vi proteção CSRF explícita, mas usa POST + JSON

### 4. Uso de `$queryRaw`/`$executeRaw`

7 arquivos (rel. 14):
- `src/services/stock.service.ts` — `atomicStockDebit/Credit` ✅ tagged template literals (parametrizado, safe)
- `src/services/customer.service.ts` — ⚪ verificar
- `src/services/product.service.ts` — ⚪
- `src/services/product-campaign.service.ts` — ⚪
- `src/app/api/products/print/route.ts` — ⚪
- `src/app/api/dashboard/metrics/route.ts` — ⚪
- `src/app/api/reports/branch-comparison/route.ts` — ⚪

Risco SQL injection: `$queryRaw` com tagged templates é seguro. `$queryRawUnsafe` seria perigoso — **não vi uso em grep simples**, mas auditoria detalhada recomendada.

### 5. `dangerouslySetInnerHTML`

**1 ocorrência** — em `src/app/layout.tsx`, para JSON-LD SEO:
```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify({...}) }}
/>
```
✅ **Seguro** — conteúdo é objeto literal estático, sem input do usuário.

### 6. Auditoria

#### 6.1 `AuditLog` — automática via Prisma middleware ✅

`src/lib/prisma-audit-middleware.ts:4-16` — registra em `AuditLog` para:
- `Sale`, `SalePayment`, `ServiceOrder`, `CashMovement`, `CashShift`
- `StockMovement`, `StockAdjustment`
- `AccountReceivable`, `AccountPayable`
- `Customer`, `Product`

Ações: `create`, `update`, `delete`, `upsert`. Captura `oldData` antes do change.

**🚨 Ativo:** registrado em `src/lib/prisma.ts:10`. ✅

**Limitação:** `userId` fica **null** (Prisma middleware não tem async context para acessar a session). 🟡 reduz o valor da auditoria — sabe-se O QUE mudou mas não QUEM.

**❌ Modelos sensíveis ausentes:**
- `Prescription`, `PrescriptionValues` — **dado de saúde** sem auditoria automática! 🟠
- `User`, `UserPermission`, `RolePermission` — mudança de permissões sem audit
- `Commission`, `CommissionRule`
- `Refund`, `RefundItem`
- `Quote` (orçamento)
- `CompanySettings`, `SystemRule`

#### 6.2 `GlobalAudit` (admin)

Rel. 06 §5: usado em `/api/admin/impersonate` para registrar `IMPERSONATION_STARTED`. 🟢

#### 6.3 `ServiceOrderHistory`

Sem dúvida ✅ — registrado em todas mudanças de status de OS (rel. 07 §4.4).

### 7. Upload de arquivos

#### `/api/upload/prescription-image`
- ✅ Whitelist de tipos: `["image/jpeg", "image/png", "image/webp", "image/heic"]`
- ✅ Tamanho máximo: 10MB
- ✅ Path no Supabase: `{companyId}/{timestamp}-{uuid}.{ext}`
- 🟡 **Validação por header `file.type`** — não checa magic bytes (cliente pode forjar). Para imagem que vai pra storage e nunca executada, risco baixo.
- ✅ Bucket dedicado (`PRESCRIPTION_IMAGES_BUCKET`) — cliente precisa de Supabase signed URL para leitura (depende de policy)

#### `/api/company/logo`
- ✅ Whitelist: PNG, JPEG, JPG
- ✅ Tamanho máximo: 2MB
- 🟡 **Salva como base64 no banco** (visto na docstring) — não escala bem se logos crescem; mas para 2MB max, OK para SaaS pequeno.

#### `/api/admin/clientes/[id]/notes` etc.
- 🟡 `attachments String[]` em `StockAdjustment`, `WarrantyClaim` — ⚪ INCERTO se há endpoint de upload + validação para esses casos.

### 8. IDs em querystring (vazamento)

Padrão: rotas usam `[id]` em path (não querystring). Querystrings carregam apenas:
- `branchId`, `customerId`, `productId` (para filtros) — IDs de RECURSOS, não PII
- `startDate`, `endDate`
- `page`, `pageSize`, `search`

✅ **CPF/RG/email NÃO aparecem em querystring.** Boa prática.

### 9. CORS

❌ **NÃO ENCONTRADO** configuração CORS explícita em `next.config.ts`. Padrão Next.js: same-origin only para `/api/*`. ✅ **OK** se o sistema é apenas web.

### 10. Endpoints "perigosos" expostos

| Route | Risco | Status |
|---|---|---|
| `/api/admin/seed` | reseta admin/admin123 + cria planos | Protegido por admin cookie 🟠 (mas se admin invadido, reseta tudo) |
| `/api/data-management/delete` | apaga TODOS os dados operacionais | `requireRole(["ADMIN"])` ✅ |
| `/api/permissions/seed` | popula permissões | `requireRole(["ADMIN"])` ✅ |
| `/api/cash/debug` | inspeciona caixa | gated `NODE_ENV === "development"` ✅ |
| `/api/admin/impersonate` | gera JWT como qualquer empresa | `["SUPER_ADMIN", "ADMIN"]` + audit ✅ |

🟠 **`/api/admin/seed` é o mais arriscado** — comportamento destrutivo em endpoint protegido apenas por role. Recomenda-se ENV gate adicional (`ALLOW_DESTRUCTIVE_SEED=true`) ou remoção em produção.

---

## Parte B — LGPD

### 11. Classificação dos dados coletados

#### Dados pessoais (PII) — `Customer`
| Campo | Sensível? |
|---|---|
| `name` | PII |
| `cpf`, `rg`, `cnpj` | PII (identificadores únicos) |
| `phone`, `phone2`, `email` | PII (contato) |
| `birthDate`, `gender` | PII |
| Endereço (8 campos) | PII |

#### Dados sensíveis (LGPD art. 11) — saúde
| Tabela | Conteúdo |
|---|---|
| `Prescription` | Receituário médico (médico, validade, anexo) |
| `PrescriptionValues` | **Grau, eixo, DNP, prismas** — diagnóstico óptico |
| `ServiceOrder.prescriptionData` Json | Snapshot inline da receita |
| `ServiceOrder.prescriptionImageUrl` | Imagem da receita médica |
| `QuoteItem.prescriptionData` Json | Idem em orçamento |
| `FrameMeasurement` | Medições corporais (DNP, alturas, ângulos) |

🔴 **Tudo isso é dado sensível de saúde** — exige tratamento especial sob LGPD (consentimento específico, base legal, segurança reforçada).

### 12. Quais perfis acessam dados sensíveis?

Permissões granulares no enum `Permission` **NÃO incluem** controle específico para prescrição:
- Não existe `prescriptions.view`, `prescriptions.edit`, `prescriptions.export`
- Acesso a `Prescription` é via `service_orders.view` ou `customers.view` — **gateway grosseiro**

🔴 **Risco LGPD:** vendedor com `customers.view` consegue ler grau/eixo de qualquer cliente. Sem segregação por papel clínico.

### 13. Relatórios que expõem dados pessoais

| Relatório | PII exposto |
|---|---|
| `/api/customers/export` | TODOS os campos de Customer (CPF, RG, telefone, endereço, email) — Excel |
| `/api/admin/export/clientes` | Idem (admin SaaS — vê todos os tenants) |
| `/api/admin/export/auditoria` | Logs com possível PII em `oldData/newData` JSON |
| `/api/customers/[id]/receivables` | dados financeiros |
| `/dashboard/relatorios/customers` | clientes |

🟠 **Sem rate limit nem watermark/audit** ao exportar. Funcionário malicioso pode baixar base completa.

### 14. APIs que retornam dados pessoais demais (overfetch)

⚪ Não auditado caso a caso. Padrão observado:
- Routes retornam objetos completos (sem `select` granular)
- Ex: `GET /api/sales/[id]` provavelmente retorna `customer { ...todos os campos PII }` no include

🟡 Recomendação fase 2: auditar `select` em queries.

### 15. Logs gravam PII?

| Log | PII exposta? |
|---|---|
| `console.log` em `auth.ts:76, 84, 98, 126, 142, 150` | **Email + role do user** — gravado nos logs do Vercel/Cloudwatch | 🔴 |
| `console.log` em `usePermission` (frontend, vai pro DevTools) | **Email + lista completa de permissões** | 🟠 |
| `console.error` em vários routes | stack traces (sem PII direta — depende do erro) | 🟡 |
| `AuditLog.oldData/newData` Json | Pode conter CPF/email/prescrição em mudanças de Customer/Prescription | 🟠 |
| `GlobalAudit.metadata` Json | `IMPERSONATION_STARTED` grava `adminEmail` | 🟡 |

### 16. Direitos do titular (LGPD art. 18)

| Direito | Suportado? |
|---|---|
| Confirmação de tratamento (art. 18, I) | ❌ Não há endpoint público |
| Acesso aos dados (II) | ❌ Não há endpoint dedicado para o titular |
| Correção (III) | 🟡 Apenas via funcionário (`PATCH /api/customers/[id]`) |
| Anonimização/bloqueio (IV) | ❌ Não encontrado |
| Eliminação (VI) | 🟡 `DELETE /api/customers/[id]` faz soft delete (`deletedAt`) — não anonimização real |
| Portabilidade (V) | ❌ Não há export individual JSON estruturado |
| Revogação de consentimento (IX) | ❌ `acceptsMarketing` pode ser desligado, mas não há fluxo formal |

🔴 **Sistema não atende explicitamente os direitos do titular.** Para uso real em ótica BR, precisa adicionar.

### 17. Consentimento

| Item | Status |
|---|---|
| `Customer.acceptsMarketing` default `true` | 🔴 viola opt-in (LGPD art. 7º, IX) |
| `consentGivenAt`, `consentVersion` | ❌ não existe |
| Texto de consentimento versionado | ❌ não encontrado |
| Consentimento específico para dados de saúde | ❌ não encontrado |
| `dataDeletedAt`, `anonymizedAt` | ❌ não existe |

### 18. Audit log para acesso/edição de prescrição

❌ **NÃO ENCONTRADO.**
- `Prescription`, `PrescriptionValues` **NÃO estão** em `AUDITED_MODELS` do middleware (linha 4-16)
- Sem log de "quem acessou a prescrição X"
- Sem log de "quem editou a prescrição X"

🔴 **Para dado sensível de saúde, isto é gap crítico.**

### 19. Retenção e eliminação automática

❌ Sem políticas de retenção:
- `GlobalAudit`, `AuditLog` crescem indefinidamente
- Soft delete (`deletedAt`) sem TTL para hard delete
- Sem job para anonimizar `Customer` X anos após inatividade
- Imagens de prescrição no Supabase — sem política de expiração

🟠 LGPD art. 16 — dados não devem ser tratados além do necessário.

### 20. DPO / canal LGPD

⚪ Não auditado. Sem rota `/api/lgpd/*` ou `/dashboard/lgpd`. Provavelmente fora do escopo do MVP, mas exigido para empresas com base de clientes substancial.

## Parte C — Achados consolidados

| # | Achado | Classe | Origem |
|---|---|---|---|
| O1 | Sem CSP (Content-Security-Policy) | 🟠 | next.config |
| O2 | Sem HSTS (Strict-Transport-Security) | 🟡 | next.config |
| O3 | Rate limit em 3/254 routes | 🟠 | rel. 03 §6 |
| O4 | Login (NextAuth + admin) sem rate limit | 🟠 | grep |
| O5 | OCR `/api/ocr/prescription` (Anthropic SDK caro) sem rate limit | 🟠 | grep |
| O6 | Uploads PDF/XLSX/imagem sem rate limit | 🟡 | grep |
| O7 | `/api/barcodes/generate-image` público + sem rate limit | 🟠 | rel. 03 §5 |
| O8 | `console.log` com email/role em produção | 🔴 | rel. 14 #12, #13 |
| O9 | `AuditLog` middleware ativo MAS sem `userId` (Prisma middleware sem async context) | 🟠 | `prisma-audit-middleware.ts:24` |
| O10 | `Prescription`/`PrescriptionValues` **fora** dos `AUDITED_MODELS` | 🔴 | `prisma-audit-middleware.ts:4-16` |
| O11 | `User`, `UserPermission`, `RolePermission` fora dos `AUDITED_MODELS` (mudanças de permissão sem audit) | 🟠 | idem |
| O12 | Sem CORS configuration explícita (Next.js default OK para same-origin) | 🟢 | grep |
| O13 | Uploads validam tipo via `file.type` (header) — sem magic bytes | 🟡 | upload/route.ts |
| O14 | `AuditLog.oldData/newData` Json pode conter CPF/email/grau de prescrição | 🟠 | schema 353-354 |
| O15 | `Customer.acceptsMarketing` default `true` viola LGPD opt-in | 🔴 | rel. 14 #14 |
| O16 | Sem `consentGivenAt`/`consentVersion`/`anonymizedAt` em Customer | 🟠 | rel. 14 #30 |
| O17 | Sem endpoint para "exportar dados do titular" (LGPD art. 18, II/V) | 🟠 | grep |
| O18 | Sem endpoint para "anonimização" — apenas soft delete | 🟠 | grep |
| O19 | Sem políticas de retenção para AuditLog/GlobalAudit/imagens | 🟡 | grep |
| O20 | Acesso a `Prescription` controlado por permissões grosseiras (`customers.view`/`service_orders.view`) — não há `prescriptions.view` granular | 🔴 | rel. 05 §9, schema |
| O21 | `Lab.apiKey` armazenado em texto puro | 🟠 | rel. 10 K11 |
| O22 | `dangerouslySetInnerHTML` apenas para JSON-LD SEO (seguro) | 🟢 | layout.tsx |
| O23 | `/api/admin/seed` reseta senha admin para `admin123` | 🟠 | rel. 14 #16 |
| O24 | Páginas de export (clientes/produtos/admin) sem rate limit nem watermark | 🟠 | grep |
| O25 | `requirePermission` ausente em routes de relatório (LGPD: pode vazar PII se URL for adivinhada) | 🟠 | rel. 11 L1 |
