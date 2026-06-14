"use client";

import { useState, useEffect } from "react";

/**
 * Indica se a integração de WhatsApp está habilitada para a empresa logada
 * (kill-switch global + allowlist por companyId, decidido no servidor).
 *
 * Default `false` enquanto carrega / em erro — assim o item de menu e a tela
 * só aparecem quando a feature está comprovadamente ligada (sem flash).
 */
export function useWhatsappEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/enabled")
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (active && result?.success) setEnabled(Boolean(result.data?.enabled));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { enabled, loading };
}
