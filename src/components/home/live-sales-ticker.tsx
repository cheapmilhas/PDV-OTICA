"use client";

import { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { motion } from "framer-motion";
import { fadeInUp, viewportConfig } from "@/lib/animations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  customer: string;
  item: string;
  value: string;
  payment: string;
  status: "done" | "lab" | "pending";
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SALES: Sale[] = [
  { id: "OS-0841", customer: "Marina S.", item: "Grau + Armação Silhouette", value: "R$ 890,00", payment: "Cartão 3x", status: "done", color: "#10B981" },
  { id: "OS-0842", customer: "Pedro A.", item: "Lente Transitions + Anti-reflexo", value: "R$ 1.240,00", payment: "PIX", status: "lab", color: "#6366F1" },
  { id: "OS-0843", customer: "Carla M.", item: "Óculos de Sol Ray-Ban RB3025", value: "R$ 670,00", payment: "Dinheiro", status: "done", color: "#10B981" },
  { id: "OS-0844", customer: "Rafael T.", item: "Lente Multifocal Varilux X", value: "R$ 1.890,00", payment: "Cartão 6x", status: "lab", color: "#6366F1" },
  { id: "OS-0845", customer: "Beatriz N.", item: "Armação Infantil + Lente CR-39", value: "R$ 420,00", payment: "PIX", status: "done", color: "#10B981" },
  { id: "OS-0846", customer: "Lucas F.", item: "Lente Photochromic Blue-cut", value: "R$ 750,00", payment: "Cartão 2x", status: "pending", color: "#F59E0B" },
  { id: "OS-0847", customer: "Amanda C.", item: "Exame + Armação Miu Miu", value: "R$ 2.100,00", payment: "Cartão 12x", status: "lab", color: "#6366F1" },
  { id: "OS-0848", customer: "João P.", item: "Lente de Contato Anual", value: "R$ 580,00", payment: "PIX", status: "done", color: "#10B981" },
];

const STATUS_LABEL: Record<Sale["status"], string> = {
  done: "Concluído",
  lab: "No Lab",
  pending: "Aguardando",
};

// ─── Remotion: Single Sale Row ────────────────────────────────────────────────

function SaleRow({ sale, delay }: { sale: Sale; delay: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.8 },
  });

  const opacity = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const x = interpolate(progress, [0, 1], [-24, 0]);

  return (
    <div
      style={{
        transform: `translateX(${x}px)`,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: "0",
        padding: "10px 16px",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        marginBottom: "8px",
      }}
    >
      {/* ID */}
      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#6366F1", fontWeight: 700, minWidth: "68px" }}>
        {sale.id}
      </span>

      {/* Customer */}
      <span style={{ fontSize: "12px", color: "#F2F2F7", fontWeight: 600, minWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sale.customer}
      </span>

      {/* Item */}
      <span style={{ fontSize: "11px", color: "#8888A0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 12px" }}>
        {sale.item}
      </span>

      {/* Payment */}
      <span style={{ fontSize: "11px", color: "#8888A0", minWidth: "72px", textAlign: "right" }}>
        {sale.payment}
      </span>

      {/* Value */}
      <span style={{ fontSize: "13px", color: "#F2F2F7", fontWeight: 700, minWidth: "90px", textAlign: "right", padding: "0 12px" }}>
        {sale.value}
      </span>

      {/* Status badge */}
      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: "20px",
          background: `${sale.color}18`,
          color: sale.color,
          border: `1px solid ${sale.color}30`,
          minWidth: "72px",
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        {STATUS_LABEL[sale.status]}
      </span>
    </div>
  );
}

// ─── Remotion: Header Bar ─────────────────────────────────────────────────────

function HeaderBar() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dotProgress = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = interpolate(Math.sin(frame * 0.12), [-1, 1], [0.5, 1]);

  return (
    <div style={{ opacity, marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#10B981",
              opacity: pulse,
              boxShadow: "0 0 8px #10B98166",
            }}
          />
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#F2F2F7", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            PDV ao vivo
          </span>
        </div>
        <span style={{ fontSize: "11px", color: "#8888A0" }}>
          Hoje · {new Date().toLocaleDateString("pt-BR")}
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "5px 16px",
          opacity: interpolate(dotProgress, [0, 1], [0, 0.5]),
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          marginBottom: "4px",
        }}
      >
        <span style={{ fontSize: "10px", color: "#8888A0", minWidth: "68px", textTransform: "uppercase", letterSpacing: "0.08em" }}>O.S.</span>
        <span style={{ fontSize: "10px", color: "#8888A0", minWidth: "80px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cliente</span>
        <span style={{ fontSize: "10px", color: "#8888A0", flex: 1, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 12px" }}>Produto</span>
        <span style={{ fontSize: "10px", color: "#8888A0", minWidth: "72px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pgto</span>
        <span style={{ fontSize: "10px", color: "#8888A0", minWidth: "90px", textAlign: "right", padding: "0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Valor</span>
        <span style={{ fontSize: "10px", color: "#8888A0", minWidth: "72px", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</span>
      </div>
    </div>
  );
}

// ─── Remotion: Summary Footer ─────────────────────────────────────────────────

function SummaryFooter() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = 80;
  const progress = spring({ frame: frame - startFrame, fps, config: { damping: 18, stiffness: 100 } });
  const opacity = interpolate(frame - startFrame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const totalAnimated = interpolate(frame - startFrame, [0, 40], [0, 8730], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const countAnimated = Math.round(interpolate(frame - startFrame, [0, 30], [0, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <div
      style={{
        transform: `translateY(${interpolate(progress, [0, 1], [12, 0])}px)`,
        opacity,
        display: "flex",
        gap: "12px",
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {[
        { label: "Vendas hoje", value: countAnimated.toString(), suffix: " O.S." },
        { label: "Total", value: `R$ ${Math.round(totalAnimated).toLocaleString("pt-BR")}`, suffix: "" },
        { label: "No laboratório", value: "3", suffix: " O.S." },
        { label: "Ticket médio", value: "R$ 1.091", suffix: "" },
      ].map((stat) => (
        <div
          key={stat.label}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.12)",
          }}
        >
          <div style={{ fontSize: "10px", color: "#8888A0", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {stat.label}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#F2F2F7" }}>
            {stat.value}{stat.suffix}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Remotion: Main Composition ───────────────────────────────────────────────

function PDVAnimation() {
  return (
    <AbsoluteFill
      style={{
        background: "#13131A",
        padding: "20px",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <HeaderBar />

      {SALES.map((sale, i) => (
        <SaleRow key={sale.id} sale={sale} delay={i * 9 + 12} />
      ))}

      <SummaryFooter />
    </AbsoluteFill>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

export function LiveSalesTicker() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: "var(--lp-surface)" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,102,241,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="container-custom relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Veja em ação
          </p>
          <h2
            className="font-heading font-extrabold tracking-tight"
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            Seu PDV{" "}
            <span
              style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}
            >
              trabalhando.
            </span>
          </h2>
          <p
            className="mt-3 max-w-lg"
            style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}
          >
            Cada O.S. registrada, cada pagamento, cada status de laboratório — tudo em tempo real, em um só lugar.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="relative mx-auto"
          style={{ maxWidth: "860px" }}
        >
          {/* Outer glow frame */}
          <div
            className="absolute -inset-px rounded-2xl pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(14,165,233,0.12) 50%, rgba(16,185,129,0.15) 100%)",
              borderRadius: "17px",
            }}
          />

          {/* Player container */}
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              boxShadow:
                "0 0 0 1px rgba(99,102,241,0.18), 0 24px 64px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {/* Top bar — fake window chrome */}
            <div
              style={{
                background: "#0E0E14",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FFBD2E" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#28C840" }} />
              <div
                style={{
                  flex: 1,
                  marginLeft: "8px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "5px",
                  padding: "3px 10px",
                  fontSize: "11px",
                  color: "#8888A0",
                  border: "1px solid rgba(255,255,255,0.06)",
                  maxWidth: "200px",
                }}
              >
                pdvotica.com.br/pdv
              </div>
            </div>

            {/* Remotion Player */}
            {mounted && (
              <Player
                component={PDVAnimation}
                durationInFrames={160}
                compositionWidth={820}
                compositionHeight={340}
                fps={30}
                loop
                autoPlay
                style={{ width: "100%", height: "auto", display: "block" }}
                controls={false}
              />
            )}
          </div>

          {/* Caption */}
          <p
            className="text-center mt-4 text-xs"
            style={{ color: "var(--lp-muted)", opacity: 0.6 }}
          >
            Simulação de fluxo real de vendas · Dados ilustrativos
          </p>
        </motion.div>
      </div>
    </section>
  );
}
