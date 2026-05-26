# Agent 5 — Design Quality, Visual UX, Brand & Accessibility Audit

**Auditor**: Agent 5 of 7
**Date**: 2026-05-26
**Scope**: Design system, visual hierarchy, AI-slop check, brand consistency, a11y (visual), Brazilian context
**Surfaces audited**: Landing (`/`), Login (`/login`), Register (`/registro`), Dashboard, PDV, Caixa, Sidebar, Header, UI primitives, `globals.css`, `tailwind.config.js`

---

## First Impression

**Verdict (one word): SPLIT.**

Two products live in this repo and they were designed by two different people who never spoke. The **landing page** is a deliberately-crafted dark, indigo-toned marketing site with extracted CSS tokens, custom utility layer (`landing-scope`), noise overlays, asymmetric layouts, italic accent words — clear evidence of an intentional anti-AI-slop pass. The **interior SaaS** is a stock shadcn install: light teal primary, generic `text-3xl font-bold` headers, default `Card` borders, rainbow `bg-blue-500 / bg-purple-500 / bg-orange-500` quick-action tiles, no dark mode, and a login screen still wearing the canonical AI blue→purple gradient that the landing explicitly removed.

The result feels like a polished demo bolted onto a generic admin template. A buyer who loves the landing will trial it and immediately downgrade their opinion of the product on the first internal screen.

**Structured critique**

- Landing: B+ work, tries hard, mostly succeeds — but is undermined by leftover lavender CTAs.
- App UI: C work — competent shadcn, but generic. Looks like every other Next.js Tailwind admin.
- Brand: identity is unstable. Landing brand = indigo `#6366F1`. App brand = teal `hsl(172 60% 32%)`. They are **different products visually**.
- Worst offender: `/login` and `/registro` pages — `bg-gradient-to-br from-blue-50 via-white to-purple-50` is the literal AI-slop opening line.

---

## Inferred Design System

### Token architecture (positive)
- Two coexisting systems:
  - **Landing tokens** (`--lp-*`, `--brand-*`) — dark/indigo, defined under `.landing-scope`. CSS custom properties, well-named.
  - **App tokens** (shadcn HSL `--primary`, `--background`, etc.) — light, teal-based.
- Status colors abstracted as `--success / --warning / --info` HSL tokens. Good.
- Chart palette defined (`--chart-1` through `--chart-5`).
- Radius token `--radius: 0.625rem` (~10px) used consistently for shadcn primitives.

### Typography
- **Plus Jakarta Sans** loaded via `next/font/google`, weights 300–800. Geometric, contemporary. **Not Inter/Roboto/Arial** — credit for that.
- `--font-body`, `--font-heading`, `--font-display` all aliased to the same font — that defeats the purpose of having three variables. Set a real serif/display contrast or delete the aliases.
- Type scale on landing uses `clamp()` (good: `--text-hero: clamp(2.6rem, 5.5vw, 5rem)`).
- App pages all use ad-hoc Tailwind sizes (`text-2xl md:text-3xl`) — no scale token, no rhythm.

### Color
- Landing: indigo primary `#6366F1`, sky accent `#0EA5E9`, success `#10B981`, warning `#F59E0B`.
- App: teal primary `172 60% 32%` (HSL).
- **The brand color literally changes when the user logs in.** This is the single biggest design failure in the codebase.

### Spacing
- Card padding `p-5` (20px) — close to an 8pt grid but not exact (5×4=20 ≈ ok).
- Landing uses `clamp(72px, 10vw, 128px)` for section padding — fluid spacing, good.
- App pages use a free-for-all of `gap-3 gap-4 gap-6` — no rhythm rule.

### Shadows
- Three named shadow utilities: `shadow-card`, `shadow-card-hover`, `shadow-elevated`. Defined in both `globals.css` and `tailwind.config.js`. Tasteful (≤8% opacity foreground).

### Motion
- Framer Motion across landing with spring curves (`stiffness: 280, damping: 22`) and an EASE_EXPO bezier `[0.22, 1, 0.36, 1]`. Premium feel intended.
- Tailwind keyframes `fade-up`, `fade-in`, `slide-in-right`, `scale-in` exist but appear unused in app pages.
- Stagger classes (`.stagger-1`..`.stagger-8`) defined but I didn't see them applied in app screens.

### Dark mode
- `.dark` token block exists in `globals.css`.
- **No theme toggle in the UI**. `theme-provider.tsx` exists in `src/components/` but I see no consumer.
- App is effectively light-only. Dark mode is a dead feature.

---

## Findings by Category

### Visual Hierarchy — Grade: C

**[HIGH] Login / Register pages still use AI blue→purple gradient**
- Location: `src/app/(auth)/login/page.tsx:90`, `src/app/registro/page.tsx:182`
- Code: `bg-gradient-to-br from-blue-50 via-white to-purple-50`
- What's wrong: This is **the** AI-slop background. The landing page explicitly removed this exact pattern (see `globals.css:387 "REMOVED: old purple→cyan gradient (the AI look)"`). It got left in on the two highest-stakes conversion screens. Anyone evaluating the product sees the AI fingerprint immediately.
- Fix: Use `bg-background` with a subtle `dot-pattern` overlay (already defined). Or echo the landing dark hero with a brand-teal `radial-gradient` glow.

**[HIGH] Contato page uses indigo→purple gradient on CTA + heading**
- Location: `src/app/contato/page.tsx:50`, `:143`, `:205`
- Code: `bg-gradient-to-r from-indigo-400 to-purple-400`, `from-indigo-600 to-purple-600`, `from-indigo-600/10 to-purple-600/10`
- Same problem, same fix. Inconsistent with the rest of the marketing site.

**[HIGH] Primary CTA on landing uses indigo→violet gradient**
- Location: `src/components/home/hero.tsx:155`, `src/components/home/pricing-section.tsx:168, :265`, `src/components/home/final-cta.tsx:89`
- Code: `background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)"`
- What's wrong: The landing CSS comment says they removed this look, but the CTA itself **is** a purple→violet gradient. The accent box `#7C3AED` is a violet — pure AI-template color. Worse, the brand primary is indigo `#6366F1`, but the CTA introduces a second hue with no semantic role.
- Fix: Use the brand primary as a flat solid, or a same-hue gradient `linear-gradient(135deg, #6366F1, #4F46E5)`. Lose the violet completely.

**[HIGH] No primary action per screen in the app**
- Location: most `(dashboard)` pages
- What's wrong: The dashboard has `<h1>Dashboard</h1>` followed by 4 KPI cards, no single dominant action. Pages with creation flows (Fornecedores, Funcionários, etc.) have `<h1>Title</h1>` with the action button hidden in the flex header — no visual weight. There is no consistent F-pattern reading anchor.
- Fix: Establish a `PageHeader` component with: title (lg), description (sm muted), and slotted right side for the primary CTA which uses size="lg" + variant="default". Use it on every list page.

**[MEDIUM] H1 sizes inconsistent across app**
- Location: many `(dashboard)` pages — `text-2xl`, `text-3xl`, occasionally `text-2xl md:text-3xl`, dashboard uses `text-2xl md:text-3xl font-bold`, financeiro/dre uses `text-3xl font-bold`, despesas-recorrentes uses `text-2xl font-bold text-gray-900` (hard-coded gray!).
- Fix: Define `<h1>` styles in `@layer base` using semantic tokens. One scale, no overrides.

**[MEDIUM] Cards over-used and undifferentiated**
- Location: dashboard, financeiro
- What's wrong: Every block is a `<Card>` with the same `rounded-xl border bg-card shadow-card`. KPIs, alerts, lists, charts, sections — all visually equal weight. The eye has nothing to anchor to.
- Fix: Reserve cards for self-contained data objects. Use bare sections (`<section>` + heading) for groupings. Or vary card prominence (filled vs outline vs ghost) for hierarchy.

### Typography — Grade: B-

**[POLISH] `--font-heading` and `--font-display` are aliases of `--font-body`**
- Location: `tailwind.config.js:11-15`
- Fix: Either load a second typeface for headings (e.g., Fraunces, Söhne, GT America) to get real contrast, or remove the unused aliases.

**[MEDIUM] Hard-coded gray text colors**
- Location: `src/app/(dashboard)/dashboard/upgrade/page.tsx:135` (`text-gray-900`), despesas-recorrentes, others
- Fix: Always use `text-foreground` / `text-muted-foreground`. Hard-codes break dark mode and theming.

**[POLISH] Numeric tables don't use tabular figures**
- Location: any list with `formatCurrency()` — Caixa, Vendas, Financeiro
- What's wrong: Default proportional digits make currency columns jitter when values change width. Add `font-feature-settings: "tnum"` (`font-variant-numeric: tabular-nums`) to monetary cells.
- Fix: Add a `.tabular` utility, apply to all `<td>`/numbers in tables.

**[POLISH] No defined max-width for body copy in app pages**
- What's wrong: Long descriptions on details pages span the full container width — hurts readability.
- Fix: 70ch max on prose blocks.

### Color — Grade: D+

**[CRITICAL] Brand color changes from indigo to teal on login**
- Location: landing `--brand-primary: #6366F1` (indigo) vs app `--primary: 172 60% 32%` (teal)
- What's wrong: The single most important brand decision — your primary color — is different before and after the login wall. The landing's hero CTA, badges, glow, footer logomark are indigo. The dashboard sidebar, primary buttons, "Entrar" button on the login page are teal. **It looks like two different SaaS products.**
- Fix: Pick one. The teal feels more "ótica/health" (good rationale). Then either:
  - Re-skin the landing to teal (preserves health/optical positioning), or
  - Re-skin the app to indigo (preserves the polished marketing aesthetic).
  Cleanest answer: teal everywhere; rebuild the landing's accent system around teal + warm-amber accent. Indigo is overused in SaaS anyway.

**[HIGH] Mobile quick-action grid uses raw rainbow colors**
- Location: `src/app/(dashboard)/dashboard/page.tsx:270-277`
- Code: `bg-green-500`, `bg-blue-500`, `bg-purple-500`, `bg-orange-500`, `bg-indigo-500`, `bg-cyan-500`, `bg-emerald-500`, `bg-amber-500`
- What's wrong: 8 saturated Tailwind defaults next to each other on a mobile screen. Reads like a Material Design demo, not a polished SaaS. Pure rainbow grid is on most AI-slop blacklists.
- Fix: All tiles use the brand primary at varying tints, with the icon-circle as a `bg-primary/10` outlined chip. Differentiation comes from the icon + label, not the color.

**[HIGH] Status color usage is undisciplined**
- Location: dashboard.page.tsx has `bg-orange-50`, `bg-red-50`, `bg-blue-50`, `bg-yellow-50` cards; financeiro/conciliacao uses `border-l-4 border-l-blue-500`, `border-l-green-500`, `border-l-yellow-500`, `border-l-orange-500`
- What's wrong: `border-left: 4px solid` is on the AI-slop blacklist. Also, status colors are referenced by Tailwind palette name instead of semantic tokens (`success`, `warning`, `info`, `destructive`), which already exist.
- Fix:
  - Kill `border-l-4`. Use a small leading status dot (`h-2 w-2 rounded-full bg-success`) instead.
  - Refactor all status uses to `bg-success/10 text-success` etc. through the semantic tokens.

**[MEDIUM] No dark mode despite full token support**
- Location: `.dark` block in `globals.css:107-154` is defined but unused.
- What's wrong: A POS that runs all day under store lighting is the **textbook** dark-mode use case — eye fatigue is real. The tokens are ready. Just ship a toggle.
- Fix: Add a sun/moon toggle in the header, wire to `next-themes`, persist preference.

**[POLISH] Brand sidebar uses CompanySettings primary color, but luminance fallback is naive**
- Location: `src/components/layout/sidebar.tsx:318-325`
- What's wrong: Multi-tenant skinning is allowed, but the contrast logic is `r*0.299 + g*0.587 + b*0.114 < 160`. That's not WCAG. Borderline colors fail.
- Fix: Compute WCAG contrast against both text candidates and pick the higher; clamp customer colors to a minimum 4.5:1 against chosen text.

### Spacing — Grade: B-

**[POLISH] No 4/8pt grid enforcement**
- Tailwind uses 4pt by default which is fine, but the code mixes `gap-3` (12px), `gap-4` (16px), `gap-5` (20px), `gap-6` (24px) seemingly at random within a single page.
- Fix: Define a per-context rule. Page-level rhythm: `space-y-6` between sections, `space-y-4` within cards, `gap-3` for tight groups. Document in a CONTRIBUTING/STYLE.md.

**[POLISH] Card paddings inconsistent**
- shadcn Card defaults to `p-5` after recent edit (line 26 of card.tsx). Dashboard mobile override globals.css:189-198 changes to 12px. Some custom KPI cards use `p-3`, `p-4`, `p-7`. No system.
- Fix: Card has `size="sm" | "default" | "lg"` variants, lock each to a fixed padding.

### Interaction States — Grade: B

**[GOOD] Buttons have `active:scale-[0.98]` and ring-2 focus** — passes baseline.

**[POLISH] Cards on dashboard have `hover:bg-red-100 transition-colors` style overrides**
- Location: dashboard.page.tsx:434, 459
- Same problem as before: hard-coded Tailwind palette instead of semantic. Also: a red→darker-red hover on an alert card feels alarming; alert cards should not feel "clickable-bright" — they should feel "click for relief."
- Fix: hover state = subtle darken on the surface; the alert intensity stays.

**[MEDIUM] Empty states are flat strings**
- Location: dashboard.page.tsx:501 — `"Nenhum produto com estoque baixo"`, etc.
- What's wrong: Cold, system-y. No illustration, no celebratory micro-moment, no nudge to take an action.
- Fix: Empty state component with an icon, a one-liner ("Tudo em ordem aqui."), and a CTA when relevant.

**[POLISH] Loading is `Loader2 animate-spin` everywhere**
- Skeleton loaders exist (`skeleton-loader.tsx`) and match real content shape (good), but they're only used on `vendas/page.tsx`. The dashboard, PDV, financeiro all use spinners — which AI builds tend to overuse.
- Fix: Replace `<Loader2>` with `<TableSkeleton>` or `<CardSkeleton>` on all list/dashboard fetches.

### Responsive — Grade: B+

**[GOOD] Real mobile work**: iOS notch safe-area (`pb-safe`), `font-size: 16px !important` on inputs to prevent zoom, dialogs go full-screen on mobile (`globals.css:228-240`), separate mobile quick-action grid on dashboard, hidden columns on smaller breakpoints.

**[POLISH] Mobile sidebar is a fully separate component**
- Two sidebars to maintain (`sidebar.tsx`, `mobile-sidebar.tsx`). Risk of drift.
- Fix: Use a single component with a responsive wrapper.

**[POLISH] PDV is desktop-first**
- Screenshot shows 3-column product grid + fixed cart on right — at tablet width this will break before reaching mobile. Verify on a 768px viewport.

### AI Slop Check — Grade: D (landing alone), F (app)

| Slop pattern | Present? | Where |
|---|---|---|
| Blue→purple gradient backgrounds | **YES** | `/login`, `/registro`, `/contato`, all primary CTAs (`#6366F1 → #7C3AED`), footer logo |
| 3-column icon-circle feature grid | **YES** | `problems-solutions.tsx` is the exact pattern, 3 columns, icon-in-tinted-square, bold title, 2-line description |
| Icons in colored circles as decoration | **YES** | features-bento.tsx, problems-solutions.tsx, dashboard mobile quick-actions |
| Centered everything | Partially | Hero is centered; landing tries to break it with left-aligned headers on Pricing/Features (good) |
| Uniform bubbly border-radius | Borderline | `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-full` pills everywhere. Lacks tighter `rounded` accents for visual contrast |
| Decorative blobs/floating circles | **YES** | Hero radial glows, accent glows, "Second accent glow — creates asymmetry" (it's still a blob) |
| Wavy SVG dividers | No | Clean |
| Emoji as design elements | No | Not in code |
| Colored left-border cards (`border-l-4`) | **YES** | financeiro/conciliacao, financeiro/fluxo-caixa |
| Generic hero copy ("Welcome to...", "Unlock the power...") | No | Portuguese copy is solid: "Sua ótica no controle. Suas vendas no piloto." — strong, native, optical-specific |
| Cookie-cutter section rhythm | **YES** | Landing flows `Hero → ProblemsSolutions(3-col) → TargetAudience → FeaturesBento(8) → Stats(4) → LabIntegration → Security → Testimonials(3) → HowItWorks → ROI → Pricing(3) → FAQ → FinalCTA`. Reads like the SaaS Landing Page Template™. |

**AI Slop verdict**: *"Landing tried to escape AI slop, then put the AI gradient back on every CTA. The app didn't even try."*

### Content & Voice — Grade: A-

- Portuguese is **native**, professional, optical-specific. No Google-Translated stiffness.
- Hero headline is strong and brand-relevant ("Sua ótica no controle. Suas vendas no piloto.")
- Section labels use eyebrow style with `letter-spacing: 0.15em` — professional editorial pattern.
- One outlier: app footer says `"v1.0 · PDV Ótica"` — fine, but lacks a "what's new" link.
- BRL/CPF/CNPJ/phone/date formatting in `src/lib/utils.ts` — correct, idiomatic, uses `Intl.NumberFormat("pt-BR")`. ✓

### Performance Feel — Grade: B

- Plus Jakarta Sans loaded with `display: swap` — good.
- Framer Motion is heavy. Landing uses it everywhere — bundle cost likely visible.
- Skeletons exist but underused.
- The hero has a noise SVG, a radial glow, a second radial glow, a dot pattern, and a gradient layer all stacked. Beautiful but expensive — verify Largest Contentful Paint.

---

## Litmus Checks

| Check | Verdict |
|---|---|
| Brand/product unmistakable in first screen? | **No** — landing says indigo SaaS, app says teal POS, both say "for óticas" but visually disagree |
| One strong visual anchor per page? | **No** in app, **Yes** in landing hero |
| Page understandable by scanning headlines only? | **Yes** on landing, **Mixed** in app (titles are descriptive but visual weight is flat) |
| Each section has one job? | **Yes** on landing, **Mostly** in app |
| Cards actually necessary? | **No** — dashboard wraps everything in Card, defeating the purpose |
| Motion improves hierarchy or atmosphere? | **Yes** on landing (atmosphere), **N/A** in app (almost no motion) |
| Premium feel if all decorative shadows removed? | **Borderline** — typography is strong enough; color discipline is not |

---

## Category Scores

| Category | Grade |
|---|---|
| Visual Hierarchy | C |
| Typography | B- |
| Color | D+ |
| Spacing | B- |
| Interaction States | B |
| Responsive | B+ |
| AI Slop Avoidance | D (landing) / F (app) |
| Content / Voice | A- |
| Performance Feel | B |
| **Brand Consistency** | **D** |
| **Accessibility (visual)** | **C+** (focus states good; hard-coded colors break dark mode; contrast logic naive) |

**Overall design grade: C+**

The landing earns a B-. The app earns a C-. Averaged.

---

## Top 10 Design Fixes That Lift Perceived Quality the Most

1. **Pick ONE brand color and apply it everywhere.** Choose teal (better fit for the optical/health vertical). Re-token the landing under teal. Eliminate every `#6366F1`, `#7C3AED`, `indigo-*`, `purple-*` from the codebase. Single biggest lift.

2. **Delete the blue→purple gradient from `/login` and `/registro`.** Replace with `bg-background` + `dot-pattern` or a subtle brand-teal radial. This is a 5-minute fix that erases the AI-template smell from the conversion entry point.

3. **Build a `PageHeader` component and use it on every app page.** Title (h1), description, primary CTA slot. Locks hierarchy. Eliminates the `<h1 className="text-2xl/3xl font-bold">` ad-hoc dump scattered across 40+ pages.

4. **Replace mobile quick-action rainbow tiles with monochrome brand-tint tiles.** Same icons, same labels, all in `bg-primary/10 text-primary` rings. Lose the `bg-green-500/blue-500/purple-500/orange-500/indigo-500/cyan-500/emerald-500/amber-500` parade.

5. **Ship dark mode.** Tokens exist. Add `next-themes` + a header toggle. POS in retail lighting begs for it. Differentiates from generic Tailwind admins instantly.

6. **Refactor status colors to semantic tokens.** Every `bg-orange-50 border-orange-200`, `bg-red-50 text-red-700` becomes `bg-warning/10 text-warning`, `bg-destructive/10 text-destructive`. Now dark mode works, themes work, and the system has actual meaning.

7. **Replace `Loader2` spinners with content-shaped Skeletons** on dashboard, PDV, financeiro, vendas. The Skeleton component is already built and correct. Just use it.

8. **Add tabular-nums to all currency cells.** `font-variant-numeric: tabular-nums` on every `formatCurrency()` output. Tables stop jittering. Looks 10x more professional immediately.

9. **Kill `border-l-4` colored bars** on conciliacao/fluxo-caixa cards. Replace with a 8px status dot before the title. Same information, no AI-slop pattern.

10. **Drop one heading font.** Add a second typeface (Fraunces or GT America for headings) and use it on h1/h2 of landing + app `PageHeader`. Instant visual identity. Or: commit to Plus Jakarta everywhere and delete the unused `--font-heading`/`--font-display` aliases — at least be honest.

---

## 3 Screens/Features That Don't Exist But Should

1. **Daily Open-of-Day "Briefing" screen.** When a vendedor/caixa opens the app each morning, route them to a one-screen overview: caixa status (open/closed), OS atrasadas the team must address today, top 3 clients with receituário vencendo this week, and a single Start of Day button to open the caixa. Right now they land on the dashboard which is BI-style — too cognitive for 8am. This would feel native to the workflow and is something Bling/Tiny/Omie don't have.

2. **Customer-facing receipt page (`/r/[code]`).** When a sale closes and a WhatsApp link goes to the customer, it currently points to a print-style receipt. Replace with a beautifully branded public page showing: items bought, OS number, current production status ("seu óculos está no laboratório"), expected pickup date, store contact, and a thumbs-up/down NPS prompt at the bottom. This becomes a marketing surface every customer sees post-purchase — the highest-ROI design real estate in the product, currently unused.

3. **Visual prescription preview / "Lentes Visualizer".** A page where, given a receituário (`OD/OE/esférico/cilíndrico/eixo`), the system renders a simplified visual diagram of the lens cuts plus a side-by-side "antes/depois" of what the customer's vision will look like. Doesn't have to be optically perfect — has to *feel* like the system understands what it's selling. This single screen would make the product feel built-by-opticians rather than built-by-developers — a competitive moat the competition doesn't have. Bonus: this is the screen that ends up in every demo video.

---

## Closing Note

Strong taste is visible in the landing component code (the noise overlays, the `EASE_EXPO` curve, the italic-keyword headline pattern, the eyebrow labels, the comment "REMOVED: old purple→cyan gradient (the AI look)"). Someone here knows what good design looks like. They just haven't applied it past the marketing site.

This product is one weekend of disciplined refactoring away from looking like a B+ commercial SaaS instead of a C+ AI-built MVP. The hard work — tokens, motion language, type stack, BRL formatting, mobile QoL — is done. What's left is **enforcement**, not invention.
