# Agent 4 — Frontend / PDV UX / React Patterns

**Scope**: PDV checkout, Service Order, Caixa flows, React patterns, accessibility, performance.
**Date**: 2026-05-26
**Stack confirmed**: Next.js 14 App Router, React 18 (strict mode), TypeScript, shadcn/ui, Tailwind, dnd-kit, react-hot-toast.

---

## Executive Summary

The PDV is **functional** but carries several risks that a Brazilian cashier WILL hit in production:

1. **CRITICAL race condition** in `modal-finalizar-venda.tsx` (line 215): `window.location.href` fires immediately after `onConfirm()` — this aborts the in-flight `POST /api/sales`, prevents error toasts from showing, kills the cashback dialog and the **carnê (crediário) print dialog**. Customers with crediário sales lose the boleto receipt opportunity.
2. **Stale closure in F4 hotkey** (`pdv/page.tsx` line 116): the `keydown` handler reads `sellers.length` and `selectedSellerId` but those are NOT in the deps array. After the page mounts, F4 may bypass the vendedor-required check or finalize against a stale value.
3. **No useReducer for cart state** — 18+ `useState` calls in PDV page with manual mutation patterns; cart updates use `carrinho.map` with closures that easily produce stale UI under rapid F-key scanning.
4. **No offline fallback** — if Wi-Fi drops mid-sale, the request silently fails. No retry queue, no service worker, no localStorage backup of cart.
5. **No barcode scanner integration** — the search input is the only entry point. Scanners that emit Enter work, but no protection against scanner-induced double-submits, no SKU prefix detection.
6. **PDV page is 1130 lines** (single client component). Re-renders entire tree on every keystroke, every cart change, every cashback poll.
7. **Touch targets fail WCAG**: PDV uses `h-5`, `h-6`, `h-7` on actionable buttons (edit price, discount, remove from cart). The finalize-modal uses `text-[9px]`, `text-[10px]`, `h-6` inputs. On a 10" tablet (common in optical shops), these are unhittable.
8. **No <label htmlFor> on the vendedor select** (line 910 uses raw `<label>` without `htmlFor` and no `id` on the `<select>`); the F2-busca-cliente input has no label at all.
9. **No skeleton states** — all loading uses centered `Loader2` spinners. Cashier sees a blank cart while products fetch on every keystroke.
10. **No ErrorBoundary anywhere** — a single React error in the cart row map crashes the whole PDV with the default Next dev overlay (or a blank screen in prod).

---

## PDV Flow Risk Analysis — "Where the cashier gets stuck"

| Moment | What can go wrong | File:Line |
|---|---|---|
| Logs in to PDV after auth | If branch context is "ALL" or null, the seller list returns empty and the page silently disables Finalizar with "Selecione o vendedor" — no instruction on how to fix. | `pdv/page.tsx:94-110` |
| Scans first barcode | Search debounces 300ms — fast scanners that emit characters in <50ms may bunch up; Enter triggers `adicionarProduto(produtosDisponiveis[0])`, which adds the *first sorted* product, NOT the scanned SKU exactly. **Wrong product may be added if SKU matches multiple.** | `pdv/page.tsx:777-784` |
| Adds out-of-stock product | Toast warns but doesn't block — by design, OK for "encomenda" model. But the warning toast disappears in 3s — if cashier is typing, they miss it. No persistent badge on cart row beyond color. | `pdv/page.tsx:351-368` |
| Edits price | Modal opens with `parseFloat(value.replace(",", "."))` — accepts negative numbers up to validation. `< 0` is rejected but `0.001` is accepted (rounded to 0.00). No tax/cost margin guard. | `pdv/page.tsx:434-440` |
| Adds 3 payment methods (split) | Each payment generates `id: Date.now().toString()` — **rapid clicks (< 1ms apart) produce duplicate IDs** → React key warning, but more critically: `removePayment` may remove the wrong one. | `modal-finalizar-venda.tsx:149,173` |
| Clicks Finalizar | Modal calls `onConfirm()` then **immediately** `window.location.href = "/dashboard/vendas"`. The in-flight `POST /api/sales` is aborted. If the sale succeeded server-side but the response was killed by reload, the user can re-submit and **create duplicate sales**. | `modal-finalizar-venda.tsx:206-215` |
| Sale succeeds with STORE_CREDIT | `handleConfirmarVenda` sets `showCarneDialog(true)` to prompt boleto print — but this NEVER renders because the modal's `window.location.href` already nuked the page. **Cashier never sees the carnê dialog**. | `pdv/page.tsx:589-596` + `modal-finalizar-venda.tsx:215` |
| Sale fails (HTTP 500) | Error toast tries to render but modal-finalizar-venda already navigated away → toast lost. Cashier sees "Vendas" page with no indication of failure. | `pdv/page.tsx:614-619` + `modal-finalizar-venda.tsx:215` |
| Network drops mid-POST | Fetch hangs until timeout (~30s default). UI shows "Finalizando..." indefinitely. No retry button, no offline cache. Cart cannot be recovered if the browser is refreshed. | `pdv/page.tsx:545-558` |
| Closes browser tab mid-sale | Cart in memory only — no localStorage persistence (only `pdv-selected-seller` is saved). Customer needs to be re-scanned. | `pdv/page.tsx:94-110` (only seller persists) |

---

## Findings by Severity

### CRITICAL (ship-blocking, real users will hit)

**C1. Double-submit / lost-receipt race on Finalizar Venda**
- File: `src/components/pdv/modal-finalizar-venda.tsx:206-215`
- The modal fires `onConfirm()` (async) and then synchronously calls `window.location.href`. The parent `pdv/page.tsx:501-623` does meaningful work after `onConfirm` resolves: tracks analytics, fetches cashback, opens carnê dialog, shows toast — **all killed by the reload**.
- **Fix**: Remove line 215 entirely. The parent already calls `router.push("/dashboard/vendas")` after success (line 611). The reload exists as a "safety net" but it's the cause of the bug.
- **Impact**: Crediário customers don't get boletos. Cashbacks aren't announced. Errors aren't shown.

**C2. Stale closure in PDV F-key handler**
- File: `src/app/(dashboard)/dashboard/pdv/page.tsx:116-157`
- The `useEffect` deps are `[carrinho.length, modalVendaOpen, modalClienteOpen]` but the handler reads `sellers.length`, `selectedSellerId`, `setCarrinho`, `setClienteSelecionado`. After `sellers` loads (after another effect), the handler still has the original empty `sellers` from first mount → F4 will bypass the seller-required check.
- **Fix**: Wrap handler in `useCallback` with full deps, or store all reactive values in refs (`useRef`) for handlers that shouldn't re-bind.

**C3. Duplicate payment IDs from `Date.now().toString()`**
- File: `src/components/pdv/modal-finalizar-venda.tsx:149, 173`
- Two rapid `addPayment` calls (e.g. double-click) produce identical IDs. React's reconciliation may render only one row but state has two. `removePayment(id)` removes ALL matching → silent data loss.
- **Fix**: Use `crypto.randomUUID()` (available in Edge runtime + modern browsers) or accumulate from a ref-stored counter.

**C4. No ErrorBoundary around critical screens**
- File: searched all of `src/` — zero `ErrorBoundary` components, no `error.tsx` in dashboard routes (only `loading.tsx` patterns in landing/activate).
- A `parseFloat` of undefined or a missing field on a malformed API response will crash the entire PDV. In production, user sees the Next.js default error page with no "Voltar" path.
- **Fix**: Add `app/(dashboard)/dashboard/pdv/error.tsx` and `error.tsx` siblings at minimum for `/pdv`, `/caixa`, `/ordens-servico`.

### HIGH

**H1. PDV page is a 1130-line client component with no memoization**
- File: `src/app/(dashboard)/dashboard/pdv/page.tsx`
- 18+ `useState`, 6 `useEffect`, no `useMemo`/`useCallback` for `calcularSubtotal`, `calcularDescontoItem`, `produtosDisponiveis`. Every cart edit re-runs all calculations and re-renders the entire product grid + sidebar.
- Cashback dialog (`Dialog`) and Carnê dialog (`Dialog`) are mounted in every render even when closed.
- **Fix**: Extract `CartItem` row to a memoized component; move calculations into a `useMemo`; extract Edit-price modal to its own component; consider `useReducer` for cart actions.

**H2. No barcode scanner contract**
- Search input has `onKeyDown` for Enter → adds the first sorted product. This is unsafe with scanners:
  - If 2 products match the scanned partial SKU (e.g. "1234" matches "1234A" and "1234B"), the wrong one is added.
  - Scanner output that ends in Tab or CR/LF other than Enter is not handled.
  - No mechanism to lock-input-during-scan (typical scanner emits 12+ chars in <100ms).
- **Fix**: Add an exact-SKU-match endpoint `/api/products/by-sku/:sku` and call it when the search is purely numeric and length >= 8 (typical EAN-13).

**H3. No optimistic state for "Add to cart"**
- File: `src/app/(dashboard)/dashboard/pdv/page.tsx:345-373`
- Adds work locally (fine), but the product grid re-renders showing stock-1 only AFTER the cart re-renders, with no "pulsing" animation or row highlight. Scanner-driven sales lose visual feedback.
- **Fix**: Highlight the just-added cart row for 500ms with a `framer-motion` or simple CSS keyframes class.

**H4. Touch targets unhittable on tablets**
- File: `src/app/(dashboard)/dashboard/pdv/page.tsx` lines 970, 977, 985, 1012, 1023, 1032
- `h-5 px-1` (20px tall), `h-6 w-6` (24px) on Edit / Resetar / Desc / Trash / +/- buttons. WCAG 2.5.5 mandates ≥44px for primary actions; Apple HIG mandates 44pt, Material mandates 48dp.
- File: `src/components/pdv/modal-finalizar-venda.tsx` uses `h-6` inputs, `text-[9px]` and `text-[10px]` font sizes throughout — illegible on tablets in shops with average lighting.
- **Fix**: Bump cart-row controls to `h-9` minimum; replace nano-text with `text-xs` (12px) minimum.

**H5. Missing form labels (a11y)**
- File: `src/app/(dashboard)/dashboard/pdv/page.tsx:910-927` — the vendedor `<select>` has a raw `<label>` (lowercase) with no `htmlFor` and no `id` on the select. Screen readers can't announce the field.
- File: `pdv/page.tsx:771-784, 863-868` — Product search input and Cliente search input have NO label (visible or sr-only).
- **Fix**: Add `id`/`htmlFor` to vendedor; wrap product/cliente search inputs with sr-only labels.

**H6. Currency input uses `<input type="number">` everywhere**
- Files: `modal-finalizar-venda.tsx:290, 350, 420-422`, `pdv/page.tsx:687-698`
- `type="number"` is a known UX anti-pattern for currency in Brazil (comma vs dot, scroll wheel changes value, mobile keyboards lack decimal on iOS). The codebase has zero `inputMode="decimal"` usage in PDV.
- **Fix**: Use `<input type="text" inputMode="decimal" pattern="[0-9.,]*">` + react-imask or hand-rolled mask. The NovaOS page uses `inputMode="decimal"` correctly — apply same pattern to PDV.

**H7. Cashback float math is fragile**
- File: `modal-finalizar-venda.tsx:79-83`
- `Math.round(... * 100) / 100` is applied selectively; `parseFloat(cashbackAmount) || 0` strips trailing zeros but doesn't normalize commas. A user typing "1,5" gets `NaN → 0`. The `Math.abs(remaining) < 0.01` tolerance is also used inconsistently (modal blocks at 0.01 but `quickFill` sets `remaining.toFixed(2)` which can leave 0.005 residual when chained).
- **Fix**: Centralize currency math in `src/lib/currency.ts` using integer cents internally.

### MEDIUM

**M1. `index` as React key in OS creation**
- File: `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx:1208`
- `<Card key={index} className="p-4 border-2">` for service items. When user removes item 2 of 4, React re-uses keys 0/1/2 — items 3 and 4 inherit item 2/3 state (textareas) wrongly. **This is a real bug that produces ghost text in OS items.**
- **Fix**: Generate a stable ID at item creation time (`uid: crypto.randomUUID()`).

**M2. console.log/error left in production code**
- 79 `console.log/error` calls across `src/`. PDV page line 385, 400 use emoji-prefixed `console.log` for OS submission. These leak in prod, hurt perf on slow devices, and clutter Sentry breadcrumbs.
- **Fix**: Strip via `next.config.ts` `compiler.removeConsole` or migrate to a `logger` util.

**M3. No useDebounce hook — every fetch debounce is hand-rolled**
- Files: `pdv/page.tsx:302-307, 336-341`, `ordens-servico/nova/page.tsx:213-215, 233-235`
- Same `setTimeout(load, 300); return clearTimeout` pattern duplicated 8+ times in the codebase. Each implementation re-creates the timer on every state change.
- **Fix**: Add `useDebounce<T>(value, delay)` to `src/hooks/` and reuse.

**M4. Cart state lost on browser refresh**
- No localStorage backup. Only `pdv-selected-seller` survives.
- **Fix**: Persist `carrinho` and `clienteSelecionado` to sessionStorage (sessionStorage avoids cross-tab leaks). Restore with confirm dialog ("Recuperar venda em andamento?").

**M5. No request deduplication / abort on stale search**
- File: `pdv/page.tsx:260-307` — if user types fast and the network is slow, the 300ms debounce can still race: type "armaçao" → fetch starts → type "óculos" → another fetch starts. Whichever returns last wins, even if it's the older slow one.
- **Fix**: Use `AbortController` and pass `signal` to each fetch; abort previous on next invocation. Or use SWR/React Query.

**M6. Caixa modal-fechamento has `eslint-disable react-hooks/exhaustive-deps`**
- File: `src/components/caixa/modal-fechamento-caixa.tsx:149`
- Effect prefills `formData` from props on `[open]` only. If `valorEsperadoDinheiro` changes while modal is open (e.g. another sale lands), the prefill is stale.
- **Fix**: Either re-fetch shift on mount, or extract pre-fill values from refs so they're guaranteed-fresh.

**M7. `useSearchParams` without Suspense boundary in PDV**
- File: `pdv/page.tsx:62-65`
- App Router warns this should be wrapped in `<Suspense>` to avoid forcing client-side rendering of the whole page. Currently the entire PDV is client-rendered for this reason.
- **Fix**: Wrap PDV content in `<Suspense fallback={<PDVSkeleton />}>`.

**M8. `total = subtotal - desconto; desconto = 0`**
- File: `pdv/page.tsx:496-498`
- The `desconto` variable is hardcoded `0`. There's no "total discount" UX, only per-item discount. This is misleading — the modal-finalizar-venda also receives `total` without knowing if a total discount applies later.
- **Fix**: Either delete the dead `desconto` variable, or implement a "Aplicar desconto na venda toda" CTA at the bottom of the cart.

### LOW

**L1. Hot-key F-list shown in header is desktop-only (hidden on `md:`)**
- File: `pdv/page.tsx:754-759`
- Cashier on a tablet (no keyboard) sees no hint of what F2/F3/F4/F8 do. Move to a "?" icon that opens a shortcuts modal.

**L2. The Cliente search shows results only with ≥2 chars, but the "Adicionar Cliente" button is also hidden when ≥2**
- File: `pdv/page.tsx:897-902`
- If a customer's name is 1 character (e.g. "X" for a one-letter business), the cashier can't search nor open Add. Minor edge.

**L3. Carnê dialog uses `window.open(... carne)` in a new tab**
- File: `pdv/page.tsx:1106`
- Popup blockers will kill this. No fallback. Cashier wonders "where's the boleto?".
- **Fix**: Use a same-tab navigation or a PDF blob download.

**L4. `key={produto.id}` for products is correct, BUT search-filtered grid uses `.slice(0, 12)` AFTER setState**
- File: `pdv/page.tsx:343, 807`
- The 12-product cap means if scanned SKU is the 13th item (rare, but possible with multi-store), it's invisible. Enter still works (uses `produtosDisponiveis[0]`) but visually misleading.
- **Fix**: Show "+N mais" counter when results exceed 12.

**L5. No reactive update of stock between sales**
- Once products load, stockQty stays put. If a parallel POS sells the last unit, the cashier still sees stock=1. The "out of stock" toast appears only on add, not real-time.
- **Fix**: Optional — refetch on focus or after every successful sale.

---

## Component-by-Component Deep Dive

### `src/app/(dashboard)/dashboard/pdv/page.tsx` (1130 lines)

| Issue | Line | Severity |
|---|---|---|
| Stale closure: F-key handler missing `sellers`, `selectedSellerId` in deps | 116-157 | CRITICAL |
| 18+ useState, no useReducer | 66-91 | HIGH |
| `desconto = 0` dead variable | 497 | MEDIUM |
| `any[]` in `handleConfirmarVenda` payments | 501 | LOW |
| `produtosDisponiveis = products.slice(0, 12)` | 343 | LOW (silent cap) |
| `window.location.href` for carnê redirect (no router.push) | 1096, 1111 | LOW |
| Vendedor `<label>` lowercase, no `htmlFor` | 910 | HIGH (a11y) |
| `<select>` raw vs shadcn Select inconsistent | 913-927 | LOW |
| Product card uses `<Button>` with stock badges inline (4 button states) | 808-830 | LOW |

### `src/components/pdv/modal-finalizar-venda.tsx` (545 lines)

| Issue | Line | Severity |
|---|---|---|
| `window.location.href` aborts in-flight onConfirm | 215 | **CRITICAL** |
| `Date.now()` as Payment ID — collision possible | 149, 173 | CRITICAL |
| `type="number"` inputs — no `inputMode="decimal"` | 290, 350, 420-422 | HIGH |
| Cashback math fragile — comma/dot inconsistency | 79-83 | HIGH |
| `text-[9px]`, `text-[10px]`, `h-6 inputs` | 248-256, 290, 295-306 | HIGH (a11y/tablet) |
| Modal max-width 1100px, max-h 90vh — won't fit 768px tablet portrait | 234 | MEDIUM |
| No autoFocus on amount input when method selected | 348-356 | LOW |

### `src/components/caixa/modal-fechamento-caixa.tsx` (618 lines)

Generally well-structured (uses `useMemo`, has stepper, has guard for `exigeJustificativa`). Issues:

| Issue | Line | Severity |
|---|---|---|
| `eslint-disable react-hooks/exhaustive-deps` masking stale prefill | 149 | MEDIUM |
| Re-fetches shift on submit via `/api/cash/shift` GET — race possible if another user closed the shift | 182-188 | MEDIUM |
| `window.open(.../relatorio)` blocked by popup blockers | 218 | LOW |
| No keyboard nav between stepper buttons (only Tab) | 251-263 | LOW (a11y) |

### `src/app/(dashboard)/dashboard/caixa/page.tsx` (722 lines)

Well-organized; uses good color semantics for shift staleness (turnoCritico/turnoAtencao). Issues:

| Issue | Line | Severity |
|---|---|---|
| `isAllBranches` check on "Abrir Caixa" but not on "Sangria"/"Reforço" — user can apply ops to wrong branch | 377, 351-362 | MEDIUM |
| Movements table renders all rows with no virtualization — slow with >500 movements | 645-707 | LOW |

### `src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx` (1338 lines)

The biggest file in the dashboard. Findings:

| Issue | Line | Severity |
|---|---|---|
| `key={index}` for service items — produces ghost-textarea bug on remove | 1208 | HIGH |
| `formData` + separate `prescriptionData` + `lensData` state — split across 3 useState | 53-91 | MEDIUM |
| Inline validation in `handleSubmit` instead of Zod schema | 313-372 | MEDIUM |
| `console.log("📤 Enviando ordem de serviço:", payload)` in prod | 385 | MEDIUM |
| Sanitize functions hand-rolled — `sanitizeNumericField`/`sanitizeIntegerField` should be in `lib/sanitize.ts` | 93-100 | LOW |
| Prescription image upload + OCR — no error toast if OCR fails silently | 634-637 | LOW |
| Form is not wrapped in react-hook-form despite the lib being present in dependencies | 429 | MEDIUM |

### `src/components/ordens-servico/kanban-board.tsx` (582 lines)

Best-written file in this audit. Uses `memo`, `useCallback`, proper keys, optimistic-update-with-rollback pattern. Issues:

| Issue | Line | Severity |
|---|---|---|
| `KANBAN_COLUMNS.forEach` inside useEffect fires 6 parallel fetches on every search/branch change — could overload API | 407-414 | MEDIUM |
| `handleDragEnd` reads `columns` from closure — has `[columns, onRefresh]` deps so it's fine, but re-creates every render | 443-552 | LOW |
| Drop target is the whole column — no insert-position indicator | 257-333 | LOW (UX polish) |
| `onRefresh()` after every drag → re-fetches all columns → likely flashes during quick drags | 519 | LOW |

---

## Performance Budget Concerns

1. **Bundle size**: no `.next/analyze` artifact present. Recommend running `ANALYZE=true next build` once. PDV page imports `react-hot-toast`, `lucide-react` (full barrel), `next-auth`, `useBranchContext`, `analytics` — many of these are heavy.

2. **Lucide-react tree-shaking**: imports use named-import style (`import { ShoppingCart, Trash2 } from "lucide-react"`) — Next 14 should tree-shake, but only if `modularizeImports` is configured. `next.config.ts` does NOT configure this. **Fix**: add modularizeImports for `lucide-react` to strip unused icons.

3. **No dynamic imports**: heavy modals (`ModalFinalizarVenda` is 545 lines + payment method icons) are eagerly imported. They could be `dynamic(() => import(...), { ssr: false })` and lazy-load on first open.

4. **Client/Server ratio**: every page in `(dashboard)/dashboard/**` is `"use client"` (verified `pdv/page.tsx:1`, `caixa/page.tsx:1`, `ordens-servico/page.tsx:1`, `ordens-servico/nova/page.tsx:1`). The dashboard layout is fully client-rendered. Initial JS payload is large; LCP suffers on 3G.
   **Fix**: Convert the dashboard `layout.tsx` and top-level page wrappers to server components; only `pdv/page.tsx` and other interactive surfaces need to be client.

5. **No next/image in dashboard photos**: only print/landing/configuracoes use `next/image`. `prescription-image-upload.tsx` likely uses raw img (didn't verify but the pattern is common). Receita uploads on tablet cameras can be 4-8MB; without `next/image` resizing they cripple slow connections.

6. **No image-CDN for product photos**: didn't find evidence the schema has product photos, but if added later this needs planning.

7. **dnd-kit Kanban + KanbanCard**: the inner SortableCard is NOT memoized (`KanbanCard` is, but the wrapper `SortableCard` re-creates `style` object every render). During drag, dozens of cards re-render. For 200+ OSs across columns, drag will jank.

---

## Suggested New UX Features (Quick Wins for cashier UX)

1. **"Última venda" recall** (5min): show small ribbon at top of PDV "Última venda: #128 R$ 240,00 há 32s. [Imprimir]" with no extra click.

2. **Mobile-first PDV variant** (1 day): drop the 3-column grid below `lg:`, replace with a tabbed UI (Produtos / Carrinho / Pagamento). Tablet shops will thank you.

3. **Sale-recovery dialog on PDV mount** (2 hours): if `sessionStorage.pendingCart` is present, show "Recuperar venda iniciada às 14:23?". Saves cashiers from re-entering 5+ items after a refresh.

4. **Exact-SKU shortcut** (4 hours): when search is purely numeric and ≥8 chars, call `/api/products/by-sku` instead of generic search; add directly without showing grid.

5. **Cart row hover-quick-actions** (1 hour): show edit/discount/remove on hover (desktop) or long-press (mobile) instead of always-visible 5 micro-buttons. Cleaner look, larger touch targets.

6. **Visual "scanner mode" indicator** (1 hour): subtle pulse on the search input while last keystroke is <50ms apart — indicates "scanner detected, will not debounce".

7. **Persistent stock badge on cart row** (30min): if quantity > stockQty, replace text with a red icon + tooltip "Encomenda — estoque: 0". Cashier sees the warning even after toast disappears.

8. **"Finalizar e imprimir cupom" button** (2 hours): the most common flow. Avoid the modal-finalizar-venda intermediate when payment is single-method dinheiro = total. Quick path for 80% of sales.

9. **Cashback nudge on customer select** (1 hour): if cliente has cashback balance, show "💰 R$ 12,50 disponível" badge on the cliente row in the search results, not just inside the finalize modal.

10. **Keyboard navigation between cart rows** (4 hours): arrow keys to move between items, Delete to remove, +/- to change qty. Power-users will love it.

---

## Quick Wins (do this week, ≤ 30 min each)

| # | File | Change | Impact |
|---|---|---|---|
| QW-1 | `modal-finalizar-venda.tsx:215` | Delete `window.location.href = "/dashboard/vendas"` | **Fixes carnê dialog + error toasts** |
| QW-2 | `modal-finalizar-venda.tsx:149,173` | Replace `Date.now().toString()` with `crypto.randomUUID()` | Stops duplicate-payment-ID bug |
| QW-3 | `pdv/page.tsx:157` | Add `sellers.length, selectedSellerId, sellers, setCarrinho, setClienteSelecionado` to F-key effect deps OR refactor to refs | Stops stale F4 |
| QW-4 | `ordens-servico/nova/page.tsx:1208` | Add `uid` field to ServiceItem state, use as key | Fixes textarea ghost text on item removal |
| QW-5 | `pdv/page.tsx:910` | Add `id="vendedor-select"` + `htmlFor="vendedor-select"` | a11y fix, also fixes click-on-label |
| QW-6 | `pdv/page.tsx:771-784` | Add `aria-label="Buscar produto por SKU ou nome"` to search input | a11y |
| QW-7 | `pdv/page.tsx`, all `<Button h-5/h-6>` in cart row | Bump to `h-9` minimum | Tablet usability |
| QW-8 | `modal-finalizar-venda.tsx` cashback input + amount input | Add `inputMode="decimal"` | Brazilian comma support |
| QW-9 | `next.config.ts` | Add `compiler: { removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false }` | Strip 79 console.log from prod bundle |
| QW-10 | `pdv/page.tsx` | Persist `carrinho` and `clienteSelecionado` to sessionStorage; restore on mount with confirm | Cart recovery on refresh |

---

## What I Could Not Verify

- Did not run the production app via Playwright/curl — the QA already has prod-03-pdv.png and prod-04-after-finalize.png in `qa-artifacts/2026-05-25/`. prod-04 is only 21KB which suggests a near-empty page state (consistent with the modal's `window.location.href` causing premature redirect).
- Did not measure actual re-render counts — that requires React DevTools profiler. Based on code shape, I estimate the PDV re-renders all 12 product cards on every cart change.
- Did not run Lighthouse — no `.next/analyze` artifact. Recommend adding `@next/bundle-analyzer`.

---

## Files Reviewed (absolute paths)

- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/pdv/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/components/pdv/modal-finalizar-venda.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/components/pdv/modal-novo-cliente.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/caixa/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/components/caixa/modal-fechamento-caixa.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/ordens-servico/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx`
- `/Users/matheusreboucas/PDV OTICA/src/components/ordens-servico/kanban-board.tsx`
- `/Users/matheusreboucas/PDV OTICA/next.config.ts`
- `/Users/matheusreboucas/PDV OTICA/qa-artifacts/2026-05-25/` (prior QA screenshots & report)

---

**End of Agent 4 report.**
