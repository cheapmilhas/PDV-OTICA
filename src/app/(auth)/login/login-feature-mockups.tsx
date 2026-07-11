/**
 * Mini-mockups do produto Vis recriados em CSS/JSX (NÃO screenshots) para o
 * carrossel do painel de login. Dados fictícios limpos de ótica. Cada mockup é
 * decorativo (aria-hidden) — a descrição textual acessível vem do carrossel.
 * Padrão "sistema grande": UI recriada, dados fake, dentro do BrowserFrame.
 */
import {
  Sparkles,
  Check,
  FlaskConical,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  MessageCircle,
  Gift,
} from "lucide-react";

// ---- Primitivas visuais compartilhadas ----------------------------------

function Chip({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "success" | "warning" | "muted" }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    primary: { bg: "var(--brand-tint)", fg: "var(--brand-primary)" },
    success: { bg: "rgba(22,163,74,0.10)", fg: "var(--brand-success)" },
    warning: { bg: "rgba(245,158,11,0.12)", fg: "var(--brand-warning)" },
    muted: { bg: "var(--lp-surface-hover)", fg: "var(--lp-muted)" },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

const shell = "flex flex-col gap-3 p-4";
const line = { background: "var(--lp-surface-hover)", borderRadius: 4 } as const;

// ---- 1. Leitura de receita por IA (a estrela) ---------------------------

export function MockReceitaIA() {
  const campos = [
    { l: "Esférico", v: "-2,25" },
    { l: "Cilíndrico", v: "-0,75" },
    { l: "Eixo", v: "180°" },
    { l: "DNP", v: "31,5" },
  ];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Receita do cliente
        </span>
        <Chip tone="primary">
          <Sparkles className="h-2.5 w-2.5" /> Lido por IA
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {campos.map((c) => (
          <div
            key={c.l}
            className="rounded-lg px-2.5 py-1.5"
            style={{ background: "var(--lp-background)", border: "1px solid var(--lp-border)" }}
          >
            <div className="text-[10px]" style={{ color: "var(--lp-muted)" }}>{c.l}</div>
            <div className="text-sm font-bold" style={{ color: "var(--brand-primary)" }}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <Check className="h-3 w-3" /> Preenchido automaticamente na OS
      </div>
    </div>
  );
}

// ---- 2. Ordem de serviço ------------------------------------------------

export function MockOrdemServico() {
  const rows = [
    { os: "#1234", cli: "Maria S.", st: "No laboratório", tone: "primary" as const },
    { os: "#1235", cli: "João P.", st: "Pronto", tone: "success" as const },
    { os: "#1236", cli: "Ana L.", st: "Em produção", tone: "warning" as const },
  ];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Ordens de serviço
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div
            key={r.os}
            className="flex items-center justify-between rounded-lg px-2.5 py-2"
            style={{ background: "var(--lp-background)", border: "1px solid var(--lp-border)" }}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold" style={{ color: "var(--lp-foreground)" }}>{r.os}</span>
              <span className="text-[10px]" style={{ color: "var(--lp-muted)" }}>{r.cli}</span>
            </div>
            <Chip tone={r.tone}>{r.st}</Chip>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- 3. Gestão financeira ----------------------------------------------

export function MockFinanceiro() {
  const bars = [45, 62, 50, 78, 66, 90, 72];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
            Faturamento
          </span>
        </div>
        <span className="text-xs font-bold" style={{ color: "var(--brand-success)" }}>R$ 48.230</span>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${h}%`,
              background: i === bars.length - 1 ? "var(--gradient-brand-vivid)" : "var(--brand-tint)",
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <TrendingUp className="h-3 w-3" /> DRE e fluxo de caixa sem planilha
      </div>
    </div>
  );
}

// ---- 4. Estoque ---------------------------------------------------------

export function MockEstoque() {
  const items = [
    { nome: "Ray-Ban RB2140", qtd: "12 un", tone: "muted" as const, st: "Em estoque" },
    { nome: "Lente antirreflexo", qtd: "3 un", tone: "warning" as const, st: "Baixo" },
    { nome: "Oakley Holbrook", qtd: "8 un", tone: "muted" as const, st: "Em estoque" },
  ];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Estoque por filial
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <div
            key={it.nome}
            className="flex items-center justify-between rounded-lg px-2.5 py-2"
            style={{ background: "var(--lp-background)", border: "1px solid var(--lp-border)" }}
          >
            <span className="text-[11px]" style={{ color: "var(--lp-foreground)" }}>{it.nome}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: "var(--lp-muted)" }}>{it.qtd}</span>
              <Chip tone={it.tone}>{it.st}</Chip>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <Check className="h-3 w-3" /> Aviso automático quando um item está acabando
      </div>
    </div>
  );
}

// ---- 5. PDV -------------------------------------------------------------

export function MockPdv() {
  const itens = [
    { nome: "Armação Ray-Ban RB2140", valor: "R$ 450,00" },
    { nome: "Lente antirreflexo", valor: "R$ 320,00" },
  ];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <ShoppingCart className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Nova venda
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {itens.map((it) => (
          <div key={it.nome} className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>{it.nome}</span>
            <span className="text-[11px] font-semibold" style={{ color: "var(--lp-foreground)" }}>{it.valor}</span>
          </div>
        ))}
      </div>
      <div
        className="flex items-center justify-between rounded-lg px-2.5 py-2"
        style={{ background: "var(--brand-tint)" }}
      >
        <span className="text-[11px] font-semibold" style={{ color: "var(--brand-primary)" }}>Total</span>
        <span className="text-sm font-bold" style={{ color: "var(--brand-primary)" }}>R$ 770,00</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <Check className="h-3 w-3" /> OS da lente gerada automaticamente
      </div>
    </div>
  );
}

// ---- 6. Funil + Inbox de WhatsApp --------------------------------------

export function MockFunilWhatsApp() {
  const cols = [
    { t: "Novo", n: 4, tone: "muted" as const },
    { t: "Atendendo", n: 2, tone: "primary" as const },
    { t: "Ganho", n: 3, tone: "success" as const },
  ];
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Funil de vendas
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {cols.map((c) => (
          <div key={c.t} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium" style={{ color: "var(--lp-muted)" }}>{c.t}</span>
              <Chip tone={c.tone}>{c.n}</Chip>
            </div>
            <div className="rounded-md" style={{ ...line, height: 18 }} />
            <div className="rounded-md" style={{ ...line, height: 18 }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <MessageCircle className="h-3 w-3" /> Lead do WhatsApp entra direto no funil
      </div>
    </div>
  );
}

// ---- 7. Cashback / fidelização -----------------------------------------

export function MockCashback() {
  return (
    <div className={shell} aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--lp-foreground)" }}>
          Cashback do cliente
        </span>
      </div>
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2.5"
        style={{ background: "var(--gradient-brand-vivid)" }}
      >
        <div className="flex flex-col">
          <span className="text-[9px] text-white/80">Saldo disponível</span>
          <span className="text-base font-bold text-white">R$ 42,50</span>
        </div>
        <Gift className="h-6 w-6 text-white/90" />
      </div>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--brand-success)" }}>
        <Check className="h-3 w-3" /> Resgate direto na próxima compra
      </div>
    </div>
  );
}

export const featureMockups: Record<string, () => React.JSX.Element> = {
  "leitura-de-receita-ia": MockReceitaIA,
  "ordem-de-servico-otica": MockOrdemServico,
  "funil-whatsapp": MockFunilWhatsApp,
  "gestao-financeira-otica": MockFinanceiro,
  "controle-de-estoque-otica": MockEstoque,
  "cashback-otica": MockCashback,
  "pdv-para-otica": MockPdv,
};
