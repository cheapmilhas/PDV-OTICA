/**
 * Wrapper de analytics — captura eventos no PostHog (client) ou nada (SSR).
 *
 * Eventos chave do funil:
 * - signup, trial_started, first_product_created, first_sale, first_os
 * - checkout_view, upgrade_clicked, payment_succeeded
 * - trial_expired, subscription_canceled
 */

export type AnalyticsEvent =
  | "signup"
  | "trial_started"
  | "first_product_created"
  | "first_sale"
  | "first_os"
  | "os_converted_to_sale"
  | "ocr_prescription_used"
  | "checkout_view"
  | "upgrade_clicked"
  | "payment_succeeded"
  | "trial_expired"
  | "subscription_canceled";

type EventProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: AnalyticsEvent, props?: EventProps) {
  if (typeof window === "undefined") return;
  const ph = (window as any).posthog;
  if (ph?.capture) {
    ph.capture(event, props);
  }
}

export function identify(userId: string, traits?: EventProps) {
  if (typeof window === "undefined") return;
  const ph = (window as any).posthog;
  if (ph?.identify) {
    ph.identify(userId, traits);
  }
}

export function resetIdentity() {
  if (typeof window === "undefined") return;
  const ph = (window as any).posthog;
  if (ph?.reset) {
    ph.reset();
  }
}
