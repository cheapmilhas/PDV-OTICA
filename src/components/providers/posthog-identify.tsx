"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { identify, resetIdentity } from "@/lib/analytics";

/**
 * Vincula a sessão NextAuth ao distinct_id do PostHog.
 * Identifica no login, reseta no logout.
 */
export function PostHogIdentify() {
  const { data: session, status } = useSession();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (userId && userId !== lastUserId.current) {
      identify(userId, {
        email: session?.user?.email ?? undefined,
        companyId: (session?.user as { companyId?: string } | undefined)?.companyId,
        role: (session?.user as { role?: string } | undefined)?.role,
      });
      lastUserId.current = userId;
    }

    if (!userId && lastUserId.current) {
      resetIdentity();
      lastUserId.current = null;
    }
  }, [session, status]);

  return null;
}
