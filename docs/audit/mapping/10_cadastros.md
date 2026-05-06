# 10 — Cadastros

> Para detalhamento completo dos schemas ver relatório **04**. Este relatório foca no fluxo de cadastro: validação, importação, LGPD.

## 1. Cliente (`Customer`)

### Schema (rel. 04 §2.9)
- `name`, `cpf`, `rg`, `phone`, `phone2`, `email`, `birthDate`, `gender`, `personType` (PF/PJ), `cnpj`, `companyName`, `tradeName`
- Endereço completo (8 campos)
- `acceptsMarketing` Boolean default **true** 🟠
- `originBranchId?` — filial onde foi cadastrado
- `notes`, `referralSource`, `externalId`
- `active`, `deletedAt` ✅ soft delete

### Validações
- **Frontend:** Zod via `customer.schema.ts` (⚪ não lido) — provavelmente `customerCreateSchema`
- **Backend:** `customer.service.ts` (⚪ não lido em detalhe)
- **Banco:** `@@unique([companyId, cpf])` — impede mesmo CPF na mesma empresa (mas permite mesmo CPF em empresas diferentes ✅ multi-tenant correto)

### Páginas
- Lista: `/dashboard/clientes` — permission `customers.create` (deveria ser `view`)
- Criar: `/dashboard/clientes/novo` — `customers.create`
- Detalhar: `/dashboard/clientes/[id]` — `customers.view`
- Editar: `/dashboard/clientes/[id]/editar` — `customers.edit`

### APIs
- `GET/POST /api/customers` — listagem + criação
- `GET/PATCH/DELETE /api/customers/[id]` — CRUD individual
- `GET /api/customers/[id]/receivables` — contas a receber do cliente
- `GET /api/customers/export` — Excel
- `POST /api/customers/import` — Excel (validação ad-hoc, sem Zod)
- `GET /api/customers/template` — template Excel (🟠 público)
- `GET /api/customers/filters` — opções de filtro

### Importação em massa
**Formato:** Excel (`xlsx`).
**Identificador para upsert:** `cpf` (linha 147 do route): `findFirst { companyId, cpf }`. Se existe → update, senão → create.
**Validações:** parsing de CPF, telefone, data, gênero — **manual, sem Zod**.

### 🟠 LGPD — Cliente

**Dados pessoais coletados:**
- Nome (PII)
- CPF, RG (PII sensível)
- Telefone, telefone secundário
- E-mail
- Data de nascimento (PII)
- Endereço completo
- CNPJ (se PJ)

**Dados sensíveis vinculados:**
- `Prescription` + `PrescriptionValues` — **dado de saúde** (LGPD art. 11)

**Faltas detectadas:**
| Item | Status |
|---|---|
| `acceptsMarketing` default `true` | 🔴 viola opt-in (LGPD art. 7º, IX) |
| Campo `consentGivenAt` | ❌ não existe |
| Campo `consentVersion` | ❌ não existe |
| Campo `dataDeletedAt` / `anonymizedAt` | ❌ não existe |
| Endpoint `DELETE /api/customers/[id]` | ✅ existe |
| Endpoint para **anonimização** (manter histórico mas sumir PII) | ❌ não encontrado |
| Endpoint para **exportar dados do titular** | ❌ não encontrado (só export geral por admin) |
| Audit log para acesso/leitura de dados sensíveis | ❌ não verificado |
| Audit log para edição de prescrição | ❌ não verificado |

## 2. Produto (`Product`)

### Schema (rel. 04 §2.10)
- `type` enum `ProductType` (12 valores — frame, lens, contact lens, accessory, etc.)
- `sku @@unique[companyId,sku]`, `barcode`, `manufacturerCode`
- Preços: `costPrice`, `salePrice`, `promoPrice`, `marginPercent` (Decimal(5,2))
- `stockControlled`, `stockQty`, `stockMin`, `stockMax`, `reorderPoint`
- `abcClass`, `turnoverDays`
- `ncm`, `cest` (fiscal)
- Mídia: `mainImage`, `images String[]`
- `active`, `featured`, `launch`, `deletedAt` ✅ soft delete
- `sharedToNetwork` (compartilhamento entre empresas da rede)

### Distinção armação × lente × acessório
✅ Via `type` (enum) + tabelas 1:1 detalhadas:
- `FrameDetail` (frame size, bridge, temple, material, gender)
- `ContactLensDetail` (curva, diâmetro, sphRange, etc.)
- `AccessoryDetail` (subtype)
- `ServiceDetail` (serviceType, durationMin)
- `LensServiceDetail` (lab, lensType, refractionIndex, treatments Json, leadTimeDays)

🟢 Modelo rico — permite cadastro especializado por tipo.

### APIs
- Standard CRUD + `import`, `export`, `template`, `filters`, `print`, `search`, `search-by-barcode`
- `barcodes/[barcodeId]`, `barcodes/generate-all` — múltiplos códigos por produto
- Filtros: 25 routes

### Lente — campos clínicos
- `LensServiceDetail.refractionIndex` Decimal(5,2)
- `LensTreatment` model + `LabPriceRange` (faixas de preço por grau)
- `Lens.material`, `lensType`, `treatments Json`

✅ Cobertura adequada.

## 3. Fornecedor (`Supplier`)

- `name`, `tradeName`, `cnpj @@unique[companyId,cnpj]`, `phone`, `email`, `contactPerson`, endereço
- `active` (sem soft delete)
- Relacionamentos: AccountPayable, InventoryLot, Product, ProductCampaignItem, StockMovement, RecurringExpense

### APIs
- Standard CRUD + import/export/template/filters
- `template` 🟠 público

## 4. Vendedor

❌ Não há tabela `Seller` separada — vendedor é `User` com `role = VENDEDOR`. Helpers:
- `/api/users/sellers` — lista users com role VENDEDOR
- `User.salesAsSeller`, `User.commissions`, `User.sellerGoals` — relacionamentos

🟡 Implicação: criar/desativar vendedor = criar/desativar `User`. Não dá para ter "vendedor terceirizado" sem login. Se preciso, vira INCERTO o caso de uso.

## 5. Convênio (`Agreement`) + `AgreementBeneficiary`

Schema linha 1337+. Tipos: HEALTH_PLAN, CORPORATE, UNION, ASSOCIATION, PARTNERSHIP.
- `code`, `name`, `cnpj`, `phone`, `discountPercent` (provável — não lido)
- `AgreementBeneficiary` linka clientes ↔ convênio

⚪ APIs e telas não auditadas — não vi rota dedicada `/api/agreements`. Pode ser gerenciado dentro de `/api/customers` via inclusão. INCERTO.

## 6. Usuário (`User`)

### Schema (lines 277-334)
- `name`, `email @unique`, `passwordHash` (bcrypt)
- `role` enum `UserRole` (ADMIN, GERENTE, VENDEDOR, CAIXA, ATENDENTE)
- `defaultCommissionPercent` Decimal(5,2)?
- `active` (sem `deletedAt`)
- 30+ relacionamentos (rastreio em quase todo o domínio)
- N:N com Branch via `UserBranch`

### APIs
- Standard CRUD em `/api/users[/id]`
- `/api/users/[id]/permissions` GET/POST (rel. 05)
- `/api/users/[id]/permissions/reset` POST
- `/api/users/[id]/profile` PATCH
- `/api/users/sellers` GET — atalho para vendedores

### Validações
- `email @unique` global (não por tenant — ✅ correto, pois permite SSO/recuperação por email único)
- `passwordHash` setado via bcrypt
- Login aceita email ou login (rel. 05)

## 7. Filial (`Branch`)

### Schema (lines 214-275)
- `name`, `code @@unique[companyId,code]`, `address`, `city`, `state`, `zipCode`, `phone`
- `stateRegistration`, `nfeSeries`, `lastNfeNumber` (fiscal)
- `active`
- 30+ relacionamentos

### APIs
- `GET/POST /api/branches` — listagem + criação
- 🟡 Não vi endpoint para inativar/deletar filial isoladamente (provavelmente via `/api/admin/companies/[id]/branches`)

## 8. Empresa (`Company`)

### Schema (lines 89-212)
**Campos principais:**
- `name`, `tradeName`, `cnpj @unique`, `slug @unique`
- Endereço, contatos
- `logoPath`, `settings` Json
- Onboarding: `onboardingStep`, `onboardingDoneAt`, `onboardingStatus`, `onboardingCompletedAt`
- Acesso: `isBlocked`, `blockedReason`, `blockedAt`, `accessEnabled`, `accessEnabledAt`, `accessEnabledBy`
- Plano: `maxUsers`, `maxBranches`, `maxProducts`
- CRM: `leadSource`, `referredByCompanyId`, `acquisitionChannel`, `segment`, `sourceDetail`
- Faturamento: `billingEmail`, `billingPhone`, `billingName`, `contractStart`, `contractEnd`
- Health: `healthScore`, `healthCategory`, `healthUpdatedAt`
- Rede: `networkId`, `isHeadquarters`

### APIs
- `GET/PATCH /api/company`
- `POST /api/company/logo`
- `GET/PATCH /api/company/settings`
- `GET/PATCH /api/company/payment-methods`
- `/api/admin/companies/[id]` (admin SaaS)

## 9. Doctor / Lab / LensTreatment

### `Doctor` (lines 421-442)
- `name`, `crm`, `uf`, `specialty`, `clinicName`, `clinicAddress`
- `isPartner`, `partnerCommissionPercent`
- `@@unique([companyId, crm, uf])`

### `Lab` (lines 444-477)
- `name`, `code`, `cnpj`, contatos
- `integrationType`, `apiUrl`, `apiKey`, `clientCode` — integração com lab
- `defaultLeadTimeDays` (default 7), `urgentLeadTimeDays` (3), `paymentTermDays` (30)
- `defaultDiscount` Decimal(5,2)
- `qualityRating` Decimal(3,2), `totalOrders`, `totalReworks`
- `active`

### `LensTreatment` (lines 479-492)
- `name`, `description`, `price` Decimal(10,2)
- `companyId` FK

### `LabPriceRange` (lines 494-513)
- Faixas de preço por grau (sphMin/Max, cylMin/Max)
- `labPrice`, `suggestedPrice`, `arPrice`, `blueLightPrice`, `photochromicPrice` (Decimal(12,2))

✅ Modelos ricos para domínio óptico.

## 10. Achados consolidados

| # | Achado | Classe | Onde |
|---|---|---|---|
| K1 | `Customer.acceptsMarketing` default `true` viola LGPD opt-in | 🔴 | schema 385 |
| K2 | `Customer` sem `consentGivenAt`, `consentVersion`, `anonymizedAt` | 🟠 | schema 367-419 |
| K3 | Sem endpoint dedicado para anonimização LGPD | 🟠 | grep |
| K4 | Sem endpoint "exportar dados do titular" para LGPD | 🟠 | grep |
| K5 | Importação de clientes/produtos/fornecedores sem Zod (validação ad-hoc) | 🟡 | `*/import/route.ts` |
| K6 | Templates de importação públicos sem auth (clientes, produtos, fornecedores) | 🟡 | `*/template/route.ts` |
| K7 | Vendedor = User; sem entidade separada | 🔵 | grep |
| K8 | `User` sem `deletedAt` (apenas `active`) | 🔵 | schema 277 |
| K9 | Convênios — não há rota dedicada `/api/agreements` (precisa investigação) | ⚪ | grep |
| K10 | `Doctor` (médico que assina prescrição) — único `@@unique([companyId, crm, uf])` impede mesmo CRM duplicado por estado, mas não impede por outra empresa (correto) | 🟢 | schema 440 |
| K11 | `Lab.apiKey` armazenado em texto puro (`String`) — sem cifragem | 🟠 | schema 457 |
| K12 | `User.passwordHash` bcrypt ✅ | 🟢 | schema 282 |
| K13 | `Customer @@unique([companyId, cpf])` — multi-tenant correto | 🟢 | schema 414 |
| K14 | `Product.sharedToNetwork` permite vazamento cross-empresa em rede (depende implementação `sharedCatalog`) | ⚠️ | schema 648 |
