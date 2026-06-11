const DAY = 24 * 60 * 60 * 1000;
export const TRIAL_ENDING_DAYS = 3;

export type TrialAction = "TRIAL_ENDING" | "TRIAL_EXPIRED" | null;

/** Decide a ação de email para uma subscription TRIAL, dado trialEndsAt e now. */
export function trialAction(trialEndsAt: Date | null, now: Date): TrialAction {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms < 0) return "TRIAL_EXPIRED";
  if (ms <= TRIAL_ENDING_DAYS * DAY) return "TRIAL_ENDING";
  return null;
}
