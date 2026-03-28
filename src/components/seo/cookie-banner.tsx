"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Cookie } from "lucide-react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem("cookie-consent", "rejected");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40"
        >
          <div className="rounded-2xl border border-[var(--border-hover)] bg-[var(--surface)] p-5 shadow-card-hover">
            <div className="flex items-start gap-3 mb-3">
              <Cookie className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Cookies e privacidade</p>
                <p className="text-xs text-muted leading-relaxed">
                  Usamos cookies para melhorar sua experiência e analisar o uso do site. Veja nossa{" "}
                  <Link href="/privacidade" className="text-brand-primary hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={accept}
                className="flex-1 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover transition-colors"
              >
                Aceitar
              </button>
              <button
                onClick={reject}
                className="flex-1 py-2 rounded-xl border border-[var(--border)] text-subtle text-xs font-medium hover:text-muted hover:border-[var(--border-hover)] transition-colors"
              >
                Rejeitar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
