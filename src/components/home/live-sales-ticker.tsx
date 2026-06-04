"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, viewportConfig } from "@/lib/animations";

interface Sale {
  id: string;
  customer: string;
  item: string;
  value: string;
  payment: string;
  status: "done" | "lab" | "pending";
  color: string;
}

const SALES: Sale[] = [
  { id: "OS-0841", customer: "Marina S.", item: "Grau + Armação Silhouette", value: "R$ 890,00", payment: "Cartão 3x", status: "done", color: "#10B981" },
  { id: "OS-0842", customer: "Pedro A.", item: "Lente Transitions + Anti-reflexo", value: "R$ 1.240,00", payment: "PIX", status: "lab", color: "#2E6BFF" },
  { id: "OS-0843", customer: "Carla M.", item: "Óculos de Sol Ray-Ban RB3025", value: "R$ 670,00", payment: "Dinheiro", status: "done", color: "#10B981" },
  { id: "OS-0844", customer: "Rafael T.", item: "Lente Multifocal Varilux X", value: "R$ 1.890,00", payment: "Cartão 6x", status: "lab", color: "#2E6BFF" },
  { id: "OS-0845", customer: "Beatriz N.", item: "Armação Infantil + Lente CR-39", value: "R$ 420,00", payment: "PIX", status: "done", color: "#10B981" },
  { id: "OS-0846", customer: "Lucas F.", item: "Lente Photochromic Blue-cut", value: "R$ 750,00", payment: "Cartão 2x", status: "pending", color: "#F59E0B" },
  { id: "OS-0847", customer: "Amanda C.", item: "Exame + Armação Miu Miu", value: "R$ 2.100,00", payment: "Cartão 12x", status: "lab", color: "#2E6BFF" },
  { id: "OS-0848", customer: "João P.", item: "Lente de Contato Anual", value: "R$ 580,00", payment: "PIX", status: "done", color: "#10B981" },
];

const STATUS_LABEL: Record<Sale["status"], string> = {
  done: "Concluído",
  lab: "No Lab",
  pending: "Aguardando",
};

function SaleRow({ sale, index }: { sale: Sale; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 16px",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        marginBottom: "8px",
      }}
    >
      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#2E6BFF", fontWeight: 700, minWidth: "68px" }}>
        {sale.id}
      </span>
      <span style={{ fontSize: "12px", color: "#F2F2F7", fontWeight: 600, minWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sale.customer}
      </span>
      <span style={{ fontSize: "11px", color: "#8888A0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 12px" }}>
        {sale.item}
      </span>
      <span style={{ fontSize: "11px", color: "#8888A0", minWidth: "72px", textAlign: "right" }}>
        {sale.payment}
      </span>
      <span style={{ fontSize: "13px", color: "#F2F2F7", fontWeight: 700, minWidth: "90px", textAlign: "right", padding: "0 12px" }}>
        {sale.value}
      </span>
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
    </motion.div>
  );
}

function PulsingDot() {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "#10B981",
        boxShadow: "0 0 8px #10B98166",
      }}
    />
  );
}

function PDVAnimation() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: "#13131A",
        padding: "20px",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        minHeight: "340px",
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <PulsingDot />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#F2F2F7", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              PDV ao vivo
            </span>
          </div>
          <span style={{ fontSize: "11px", color: "#8888A0" }}>
            Hoje · {new Date().toLocaleDateString("pt-BR")}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "5px 16px",
            opacity: 0.5,
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

      <AnimatePresence mode="wait">
        <motion.div key={tick}>
          {SALES.map((sale, i) => (
            <SaleRow key={`${tick}-${sale.id}`} sale={sale} index={i} />
          ))}
        </motion.div>
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.0 }}
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {[
          { label: "Vendas hoje", value: "8", suffix: " O.S." },
          { label: "Total", value: "R$ 8.730", suffix: "" },
          { label: "No laboratório", value: "3", suffix: " O.S." },
          { label: "Ticket médio", value: "R$ 1.091", suffix: "" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              background: "rgba(46,107,255,0.06)",
              border: "1px solid rgba(46,107,255,0.12)",
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
      </motion.div>
    </div>
  );
}

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
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(46,107,255,0.06) 0%, transparent 70%)",
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
          <div
            className="absolute -inset-px rounded-2xl pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(46,107,255,0.25) 0%, rgba(34,195,230,0.12) 50%, rgba(16,185,129,0.15) 100%)",
              borderRadius: "17px",
            }}
          />

          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              boxShadow:
                "0 0 0 1px rgba(46,107,255,0.18), 0 24px 64px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
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
                vis.app.br/pdv
              </div>
            </div>

            {mounted && <PDVAnimation />}
          </div>

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
