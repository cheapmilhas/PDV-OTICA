# Cadastro de cliente sem LGPD + ficha completa + cashback no PDV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a trava de consentimento LGPD do cadastro rápido de cliente, oferecer campos opcionais (endereço/nascimento/gênero), exibir a ficha completa do cliente na tela de detalhes (corrigindo o bug PF/PJ), e mostrar o cashback no card do cliente do PDV.

**Architecture:** Trabalho majoritariamente de UI. O modelo `Customer` já tem todos os campos no banco; a `createCustomerSchema` já os aceita como opcionais e `sanitizeCustomerDTO` limpa vazios. Nenhuma migration, nenhuma mudança de API. O cashback reusa o endpoint existente `GET /api/cashback/balance/[customerId]`.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Prisma, Zod, Vitest, Shadcn UI, react-hot-toast, date-fns.

**Spec:** `docs/superpowers/specs/2026-06-11-cadastro-cliente-sem-lgpd-e-ficha-completa-design.md`

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/validations/__tests__/customer-schema.test.ts` | Garantir que cadastro sem `consent` e com campos novos é aceito | Modificar (add testes) |
| `src/components/pdv/modal-novo-cliente.tsx` | Cadastro rápido: remover LGPD, add seção recolhível | Modificar |
| `src/components/clientes/lgpd-consent-checkbox.tsx` | Componente LGPD (consumidor único) | **Deletar** |
| `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx` | Ficha do cliente: exibir campos + corrigir bug PF/PJ | Modificar |
| `src/app/(dashboard)/dashboard/pdv/page.tsx` | Card do cliente no PDV: exibir cashback | Modificar |

**Ordem de execução:** Task 1 (validação/testes — prova que a API já aceita) → Task 2 (modal) → Task 3 (deletar componente) → Task 4 (ficha) → Task 5 (cashback PDV) → Task 6 (verificação final).

---

### Task 1: Testes provando que a API já aceita cadastro sem consent + campos novos

Confirma a premissa central do design **antes** de mexer na UI: o schema aceita cadastro sem `consent` e com os campos opcionais. Se isso falhar, o resto do plano muda.

**Files:**
- Test: `src/lib/validations/__tests__/customer-schema.test.ts`
- Reference (não editar): `src/lib/validations/customer.schema.ts`

- [ ] **Step 1: Ler o teste existente para seguir o estilo**

Run: `sed -n '1,40p' "src/lib/validations/__tests__/customer-schema.test.ts"`
Objetivo: ver como importam `createCustomerSchema`/`sanitizeCustomerDTO` e o padrão dos testes.

- [ ] **Step 2: Adicionar os testes ao final do arquivo**

Adicionar um novo `describe` (ajustar os imports no topo se `createCustomerSchema`/`sanitizeCustomerDTO` ainda não estiverem importados):

```typescript
describe("cadastro rápido sem LGPD + campos opcionais", () => {
  it("aceita cadastro só com nome e telefone (sem consent)", () => {
    const result = createCustomerSchema.safeParse({
      name: "Maria Silva",
      phone: "11987654321",
    });
    expect(result.success).toBe(true);
  });

  it("aceita endereço, nascimento e gênero opcionais", () => {
    const result = createCustomerSchema.safeParse({
      name: "João Souza",
      phone: "11987654321",
      birthDate: "1990-05-20",
      gender: "M",
      zipCode: "01001000",
      address: "Rua A",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
    });
    expect(result.success).toBe(true);
  });

  it("sanitizeCustomerDTO converte strings vazias em undefined", () => {
    const dto = sanitizeCustomerDTO({
      name: "Ana",
      phone: "11987654321",
      email: "",
      birthDate: "",
      address: "",
      gender: "",
    } as any);
    expect(dto.email).toBeUndefined();
    expect(dto.birthDate).toBeUndefined();
    expect(dto.address).toBeUndefined();
    expect(dto.gender).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar os testes e verificar que passam**

Run: `npx vitest run src/lib/validations/__tests__/customer-schema.test.ts`
Expected: PASS (todos). Se algum falhar, PARAR — a premissa do design está errada e precisa ser reavaliada antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add "src/lib/validations/__tests__/customer-schema.test.ts"
git commit -m "test(customer): cadastro sem consent + campos opcionais aceitos pelo schema"
```

---

### Task 2: Remover LGPD do modal de cadastro rápido + seção recolhível

**Files:**
- Modify: `src/components/pdv/modal-novo-cliente.tsx`

- [ ] **Step 1: Remover import e hook do LGPD**

Remover a linha de import (linha ~10):
```typescript
import { LgpdConsentCheckbox, useConsentState } from "@/components/clientes/lgpd-consent-checkbox";
```
Remover a linha do hook (linha ~26):
```typescript
const [consent, setConsent] = useConsentState();
```

- [ ] **Step 2: Expandir o `formData` com os campos novos**

Substituir o `useState` do `formData` (linhas ~20-25) por:
```typescript
const [formData, setFormData] = useState({
  name: "",
  phone: "",
  email: "",
  cpf: "",
  birthDate: "",
  gender: "",
  zipCode: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
});
const [mostrarMais, setMostrarMais] = useState(false);
```

- [ ] **Step 3: Remover a trava de consent e o envio de consent no `handleSubmit`**

Remover este bloco (linhas ~31-34):
```typescript
if (!consent.personalData) {
  toast.error("É necessário aceitar o tratamento de dados pessoais (LGPD)");
  return;
}
```
No `customerData`, remover `consent` (linha ~43) e adicionar os campos novos só quando preenchidos, no mesmo padrão do email/cpf existente. Após os blocos `if (formData.email)` / `if (formData.cpf)`, acrescentar:
```typescript
if (formData.birthDate) customerData.birthDate = formData.birthDate;
if (formData.gender) customerData.gender = formData.gender;
if (formData.zipCode) customerData.zipCode = formData.zipCode.replace(/\D/g, "");
if (formData.address) customerData.address = formData.address;
if (formData.number) customerData.number = formData.number;
if (formData.neighborhood) customerData.neighborhood = formData.neighborhood;
if (formData.city) customerData.city = formData.city;
if (formData.state) customerData.state = formData.state;
```

- [ ] **Step 4: Atualizar o reset do formulário (sucesso)**

Substituir o `setFormData({...})` do reset (linhas ~72-77) pelo objeto completo com todos os campos em `""`, e **remover** a linha `setConsent({ personalData: false, healthData: false, marketing: false });` (linha ~78). Adicionar `setMostrarMais(false);`.

- [ ] **Step 5: Substituir o `<LgpdConsentCheckbox .../>` pela seção recolhível**

Trocar a linha `<LgpdConsentCheckbox value={consent} onChange={setConsent} required />` (linha ~177) por um toggle + bloco condicional. Manter a estética do projeto (Button variant ghost/link + inputs já usados). Exemplo:

```tsx
<div className="space-y-3">
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="w-full justify-start px-0 text-muted-foreground"
    onClick={() => setMostrarMais((v) => !v)}
    disabled={loading}
  >
    {mostrarMais ? "− Ocultar informações adicionais" : "+ Adicionar mais informações"}
  </Button>

  {mostrarMais && (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="birthDate">Data de nascimento</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gênero</Label>
          <select
            id="gender"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            disabled={loading}
          >
            <option value="">Selecione</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
            <option value="Outro">Outro</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="zipCode">CEP</Label>
          <Input id="zipCode" placeholder="00000-000" value={formData.zipCode}
            onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="number">Número</Label>
          <Input id="number" value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })} disabled={loading} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Endereço</Label>
        <Input id="address" placeholder="Rua, avenida..." value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })} disabled={loading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="neighborhood">Bairro</Label>
        <Input id="neighborhood" value={formData.neighborhood}
          onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} disabled={loading} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">UF</Label>
          <Input id="state" maxLength={2} placeholder="SP" value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })} disabled={loading} />
        </div>
      </div>
    </div>
  )}
</div>
```

> Nota: se o projeto já tem um componente `<Select>` Shadcn em uso em outros formulários, preferir ele ao `<select>` nativo para consistência visual. Verificar com `grep -r "from \"@/components/ui/select\"" src/components/pdv` — se existir, usar.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a este arquivo. (Erros pré-existentes não relacionados, se houver, ignorar — mas o arquivo editado deve estar limpo.)

- [ ] **Step 7: Commit**

```bash
git add "src/components/pdv/modal-novo-cliente.tsx"
git commit -m "feat(cliente): remove trava LGPD do cadastro rápido + campos opcionais recolhíveis"
```

---

### Task 3: Deletar o componente LGPD órfão

Confirmado por grep na fase de spec que o único consumidor era o modal (já tratado na Task 2).

**Files:**
- Delete: `src/components/clientes/lgpd-consent-checkbox.tsx`

- [ ] **Step 1: Reconfirmar que não há mais nenhum consumidor**

Run: `grep -rn "LgpdConsentCheckbox\|useConsentState\|lgpd-consent-checkbox" src`
Expected: apenas o próprio arquivo `lgpd-consent-checkbox.tsx` aparece. Se aparecer qualquer outro arquivo, **PARAR** e não deletar — apenas parar de usar no modal (Task 2 já fez) e reportar o consumidor extra.

- [ ] **Step 2: Deletar o arquivo**

Run: `git rm "src/components/clientes/lgpd-consent-checkbox.tsx"`

- [ ] **Step 3: Verificar build de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros de import quebrado.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(cliente): remove componente LgpdConsentCheckbox sem consumidores"
```

---

### Task 4: Ficha completa na tela de detalhes + corrigir bug PF/PJ

**Files:**
- Modify: `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx`

- [ ] **Step 1: Corrigir e expandir a interface `Customer` local (linhas 65-78)**

Substituir a interface por (usando os nomes exatos do Prisma; troca `type` por `personType`):
```typescript
interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phone2?: string;
  cpf?: string;
  cnpj?: string;
  personType: "PF" | "PJ";
  birthDate?: string | null;
  gender?: string | null;
  referralSource?: string | null;
  address?: string;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Corrigir a exibição de Tipo (bug PF/PJ, linha ~856)**

Trocar:
```tsx
{customer.type === "INDIVIDUAL" ? "Pessoa Física" : "Pessoa Jurídica"}
```
por:
```tsx
{customer.personType === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
```

> Se houver outras referências a `customer.type` na página, achar com `grep -n "customer.type" src/app/(dashboard)/dashboard/clientes/[id]/page.tsx` e corrigir todas para `personType`.

- [ ] **Step 3: Adicionar os campos novos no grid "Informações do Cliente" (após o bloco Telefone, ~linha 892)**

Inserir dentro do `<div className="grid gap-4 md:grid-cols-2">`, depois do bloco de Telefone:
```tsx
{customer.phone2 && (
  <div>
    <p className="text-sm text-muted-foreground flex items-center gap-1">
      <Phone className="h-3 w-3" />
      Telefone 2
    </p>
    <p className="font-medium">{customer.phone2}</p>
  </div>
)}

{customer.birthDate && (
  <div>
    <p className="text-sm text-muted-foreground">Data de nascimento</p>
    <p className="font-medium">
      {format(safeDate(customer.birthDate), "dd/MM/yyyy", { locale: ptBR })}
    </p>
  </div>
)}

{customer.gender && (
  <div>
    <p className="text-sm text-muted-foreground">Gênero</p>
    <p className="font-medium">
      {customer.gender === "M" ? "Masculino" : customer.gender === "F" ? "Feminino" : customer.gender}
    </p>
  </div>
)}

{customer.referralSource && (
  <div>
    <p className="text-sm text-muted-foreground">Como nos conheceu</p>
    <p className="font-medium">{customer.referralSource}</p>
  </div>
)}

<div>
  <p className="text-sm text-muted-foreground">Cliente desde</p>
  <p className="font-medium">
    {format(safeDate(customer.createdAt), "dd/MM/yyyy", { locale: ptBR })}
  </p>
</div>
```

> `format` e `ptBR` já estão importados (linhas 60-61). `Phone` já está importado. `safeDate()` é um helper já definido na própria página (linha ~411) e usado em todas as outras datas — usar ele em vez de `new Date()` direto, por consistência e robustez.

- [ ] **Step 4: Enriquecer o bloco de Endereço (linhas ~895-915)**

Atualizar a montagem para incluir `number`, `complement`, `neighborhood`. Substituir o conteúdo interno do bloco de endereço por:
```tsx
<div className="space-y-1 text-sm">
  {customer.address && (
    <p>
      {customer.address}
      {customer.number && `, ${customer.number}`}
      {customer.complement && ` - ${customer.complement}`}
    </p>
  )}
  {customer.neighborhood && <p>{customer.neighborhood}</p>}
  {(customer.city || customer.state || customer.zipCode) && (
    <p>
      {customer.city && `${customer.city}`}
      {customer.state && ` - ${customer.state}`}
      {customer.zipCode && ` - CEP: ${customer.zipCode}`}
    </p>
  )}
</div>
```
E na condição que abre o bloco (`{(customer.address || customer.city || ...) && (`), acrescentar `customer.neighborhood` à lista de OR.

- [ ] **Step 5: Adicionar bloco de Observações (após o bloco de Endereço, dentro do `<CardContent>`)**

```tsx
{customer.notes && (
  <>
    <Separator />
    <div>
      <h3 className="font-semibold mb-2">Observações</h3>
      <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
    </div>
  </>
)}
```
> `Separator` já é usado no bloco de endereço — confirmar que está importado (está).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `tsc` reclamar de algum campo, é sinal de que a interface (Step 1) ficou incompleta — ajustar.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/clientes/[id]/page.tsx"
git commit -m "feat(cliente): exibe ficha completa na detail page + corrige bug PF/PJ"
```

---

### Task 5: Cashback no card do cliente do PDV

**Files:**
- Modify: `src/app/(dashboard)/dashboard/pdv/page.tsx`

- [ ] **Step 1: Localizar a interface `Customer` local e o estado `clienteSelecionado`**

Run: `grep -n "interface Customer\|clienteSelecionado\|setClienteSelecionado" "src/app/(dashboard)/dashboard/pdv/page.tsx"`
Anotar a linha da declaração de estado e da interface.

- [ ] **Step 2: Adicionar estado do cashback**

Logo após a declaração de `const [clienteSelecionado, setClienteSelecionado] = useState...`, adicionar:
```typescript
const [cashbackSelecionado, setCashbackSelecionado] = useState<number | null>(null);
```

- [ ] **Step 3: Adicionar `useEffect` que busca o saldo sempre que o cliente muda**

Adicionar perto dos outros hooks do componente (após os `useState`/`useEffect` existentes):
```typescript
useEffect(() => {
  if (!clienteSelecionado?.id) {
    setCashbackSelecionado(null);
    return;
  }
  let ativo = true;
  fetch(`/api/cashback/balance/${clienteSelecionado.id}`)
    .then(async (res) => {
      if (res.status === 403) return null; // plano sem cashback
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => {
      if (!ativo) return;
      if (data?.success) {
        setCashbackSelecionado(Number(data.data?.balance) || 0);
      } else {
        setCashbackSelecionado(null);
      }
    })
    .catch(() => {
      if (ativo) setCashbackSelecionado(null);
    });
  return () => {
    ativo = false;
  };
}, [clienteSelecionado?.id]);
```
> Confirmar que `useEffect` está importado no topo do arquivo (`import { useState, useEffect } from "react"`). Se não, adicionar.

- [ ] **Step 4: Exibir a linha de cashback no card (após o telefone, ~linha 1165)**

No card do cliente selecionado, depois do bloco que mostra `{clienteSelecionado.phone && (...)}`, adicionar:
```tsx
{cashbackSelecionado != null && cashbackSelecionado > 0 && (
  <p className="text-xs text-emerald-600 font-medium">
    Cashback: {formatCurrency(cashbackSelecionado)}
  </p>
)}
```
> Confirmar que `formatCurrency` está importado nesse arquivo (`grep -n "formatCurrency" "src/app/(dashboard)/dashboard/pdv/page.tsx"`). Se não estiver, importar de `@/lib/utils`.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/pdv/page.tsx"
git commit -m "feat(pdv): exibe cashback disponível no card do cliente selecionado"
```

---

### Task 6: Verificação final (build + suite + smoke)

**Files:** nenhum (validação).

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npx vitest run`
Expected: todos verdes (incluindo os novos da Task 1). Anotar a contagem.

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Smoke manual (dev server) — checklist**

Subir `npm run dev` e validar:
- [ ] PDV → F3 Cliente → "Cadastro Rápido": **não** há mais bloco LGPD; salva só com nome+telefone.
- [ ] No modal, clicar "+ Adicionar mais informações" expande endereço/nascimento/gênero; salvar com eles preenchidos grava (conferir na ficha).
- [ ] Ficha do cliente (`/dashboard/clientes/[id]`): cliente PF aparece como **"Pessoa Física"** (bug corrigido); campos novos aparecem quando preenchidos; cliente "magro" não mostra célula vazia nem quebra layout.
- [ ] PDV: selecionar cliente com cashback → linha "Cashback: R$ X" aparece; cliente sem cashback → não aparece; remover cliente → linha some.

- [ ] **Step 5: Commit final (se houver ajustes do smoke)**

```bash
git add -A
git commit -m "chore(cliente): ajustes finais pós-smoke"
```

---

## Notas para o executor

- **Sem migration, sem mudança de API.** Se sentir necessidade de alterar `prisma/schema.prisma` ou um route handler, PARAR — provavelmente é engano; o backend já suporta tudo.
- **Não reiniciar o dev server repetidamente** (corrompe cache do Turbopack → 500). Reusar a mesma instância.
- **Deploy é manual** via `vercel deploy --prod` (não faz parte deste plano; o dono decide quando).
- Padrão multi-tenant já é garantido pelos services existentes — não precisa adicionar `companyId` em nada aqui.
