/**
 * Wrapper de route handlers Next.js que aplica feature gating.
 *
 * Preserva a assinatura `(req, ctx)` para handlers com dynamic segments
 * (ex: `/api/sales/[id]/refund` recebe ctx.params = { id: "..." }).
 *
 * Camadas de proteção (em ordem):
 *  1. Kill switch DISABLE_PLAN_FEATURE_GATING=true → bypass total
 *  2. Allow-list de hot paths (auth, plan-features, admin) → bypass
 *  3. Sem sessão → delega ao handler (que retorna 401 conforme próprio padrão)
 *  4. Fail-open em erro de DB (log warn, segue ao handler)
 *  5. findBlockedFeature(path, features) → 403 com code PLAN_FEATURE_REQUIRED
 *
 * Aplicar em cada route.ts das 16 famílias de API gated:
 *   export const GET = withPlanFeatureGuard(async (req, { params }) => { ... });
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";
import { findBlockedFeature } from "@/lib/plan-feature-catalog";

/** Shape do segundo argumento de route handlers Next 14/16 com dynamic segments. */
export type RouteContext = { params: Promise<Record<string, string | string[]>> };

const ALLOWLIST_PREFIXES = [
  "/api/auth",
  "/api/admin-auth",
  "/api/plan-features",
  "/api/admin",
  "/api/health",
];

function pathIsAllowlisted(path: string): boolean {
  return ALLOWLIST_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function withPlanFeatureGuard<C extends RouteContext = RouteContext>(
  handler: (req: Request, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return async (req: Request, ctx: C) => {
    if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") {
      return handler(req, ctx);
    }

    const path = new URL(req.url).pathname;

    if (pathIsAllowlisted(path)) {
      return handler(req, ctx);
    }

    const session = await auth();
    const companyId = (session as { user?: { companyId?: string } } | null)?.user?.companyId;
    if (!companyId) {
      // Sem identidade → handler decide (provavelmente retornará 401).
      return handler(req, ctx);
    }

    let features: Record<string, boolean>;
    let hasSubscription: boolean;
    try {
      const cached = await getCachedPlanFeatures(companyId);
      features = cached.features;
      hasSubscription = cached.hasSubscription;
    } catch (err) {
      // Fail-open: indisponibilidade de DB transitória não deve bloquear UI inteira.
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "plan_features_lookup_failed",
          companyId,
          path,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return handler(req, ctx);
    }

    // Q7.4 P2-3: padroniza com requirePlanFeature — sem subscription = libera.
    // Empresa em onboarding/trial sem PlanFeatures cadastrados não deve ser
    // bloqueada (não dá pra contratar sem testar). PlanFeatures vazias OU
    // hasSubscription=false ambos disparam o "libera".
    if (!hasSubscription) {
      return handler(req, ctx);
    }

    const blocked = findBlockedFeature(path, features);
    if (blocked) {
      return NextResponse.json(
        { error: { code: "PLAN_FEATURE_REQUIRED", feature: blocked } },
        { status: 403 },
      );
    }

    return handler(req, ctx);
  };
}
