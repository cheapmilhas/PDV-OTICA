import { Sparkles, MessageCircle } from "lucide-react";
import { VisLogo } from "@/components/landing-layout/vis-logo";
import { WHATSAPP_NUMBER, WHATSAPP_URL } from "@/lib/constants";
import { daysAgo, formatRelative } from "@/lib/relative-date";
import type { LoginPanelContent } from "./login-panel-content";

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
      aria-label="Novidades e suporte"
      className="hidden lg:flex w-80 flex-col justify-center gap-6 rounded-2xl border border-slate-200/70 bg-white/60 p-8"
      style={{ borderColor: "var(--lp-border)" }}
    >
      <VisLogo height={33} />

      {showRelease && latest && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" style={{ color: "var(--brand-primary)" }} />
            <h2 className="text-sm font-semibold text-slate-900">Novidades</h2>
            <span className="ml-auto text-xs text-muted-foreground">{formatRelative(latest.date, today)}</span>
          </div>
          <p className="text-sm font-medium text-slate-800">{latest.title}</p>
          <ul className="space-y-1.5">
            {latest.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" style={{ color: "var(--brand-primary)" }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSupport && (
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Precisa de ajuda? Falar no suporte
        </a>
      )}
    </aside>
  );
}
