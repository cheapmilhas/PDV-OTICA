import { MessageCircle } from "lucide-react";
import { WHATSAPP_NUMBER, WHATSAPP_URL } from "@/lib/constants";
import { daysAgo, formatRelative } from "@/lib/relative-date";
import type { LoginPanelContent } from "./login-panel-content";
import { loginCarouselSlides } from "./login-panel-content";
import { LoginFeatureCarousel } from "./login-feature-carousel";

const MAX_RELEASE_AGE_DAYS = 14;
const SUPPORT_PLACEHOLDER = "5585999999999";
// Falha segura: só mostra o suporte para um número real (12-15 dígitos) que NÃO
// seja o placeholder. Vazio/malformado/sentinel → esconde.
const REAL_PHONE = /^\d{12,15}$/;

interface LoginSidePanelProps {
  content: LoginPanelContent;
  /** Injetável para testes; default = hoje. */
  today?: string;
}

export function LoginSidePanel({ content, today }: LoginSidePanelProps) {
  const latest = [...content.releases]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];

  const age = latest ? daysAgo(latest.date, today) : null;
  const showRelease = latest != null && age !== null && age <= MAX_RELEASE_AGE_DAYS;
  const showSupport = REAL_PHONE.test(WHATSAPP_NUMBER) && WHATSAPP_NUMBER !== SUPPORT_PLACEHOLDER;

  return (
    <aside
      aria-label="Conheça o Vis"
      className="hidden lg:flex w-[26rem] flex-col justify-center gap-6 rounded-3xl border p-9"
      style={{
        borderColor: "var(--lp-border)",
        background: "var(--gradient-brand-wash)",
        boxShadow: "0 24px 60px rgba(10,31,68,0.08)",
      }}
    >
      <div>
        <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--lp-foreground)" }}>
          Tudo o que sua ótica precisa,
          <br />
          <span style={{ color: "var(--brand-primary)" }}>num só lugar.</span>
        </h2>
      </div>

      <LoginFeatureCarousel slides={loginCarouselSlides} />

      {showRelease && latest && (
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: "var(--brand-tint)" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--brand-primary)" }}>
              Novidade
            </span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--lp-subtle)" }}>
              {formatRelative(latest.date, today)}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--lp-foreground)" }}>
            {latest.title}
          </p>
        </div>
      )}

      {showSupport && (
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Precisa de ajuda? Falar no suporte
        </a>
      )}
    </aside>
  );
}
