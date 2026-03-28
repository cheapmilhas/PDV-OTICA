"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Calculator, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { formatCurrency } from "@/lib/utils";
import { viewportConfig } from "@/lib/animations";
import Link from "next/link";
import { REGISTER_URL } from "@/lib/constants";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between mb-2">
        <label className="text-sm text-muted">{label}</label>
        <span className="text-sm font-semibold text-foreground">{format(value)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--surface-hover)]">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-accent"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white border-2 border-brand-primary shadow-sm pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  );
}

export function RoiCalculator() {
  const [vendas, setVendas] = useState(80);
  const [ticket, setTicket] = useState(400);
  const [horasGestao, setHorasGestao] = useState(15);
  const [inadimplencia, setInadimplencia] = useState(8);

  const result = useMemo(() => {
    const custoHora = 25;
    const economiaHoras = horasGestao * 0.6 * custoHora * 4; // 60% redução, 4 semanas
    const aumentoConversao = vendas * ticket * 0.05; // +5% conversão
    const reducaoInadimplencia = (inadimplencia / 100) * vendas * ticket * 0.3; // 30% recuperação
    return Math.round(economiaHoras + aumentoConversao + reducaoInadimplencia);
  }, [vendas, ticket, horasGestao, inadimplencia]);

  return (
    <section className="section-padding bg-[var(--surface)]">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2
            className="font-heading font-bold text-foreground tracking-tight"
            style={{ fontSize: "var(--text-h1)" }}
          >
            Quanto sua ótica perde{" "}
            <GradientText>sem um sistema?</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Calcule o quanto você pode economizar e ganhar com o PDV Ótica.
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Inputs */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 space-y-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-brand-primary" />
              <h3 className="font-semibold text-foreground text-sm">Dados da sua ótica</h3>
            </div>

            <Slider
              label="Vendas por mês"
              value={vendas}
              min={10}
              max={500}
              step={10}
              format={(v) => `${v} vendas`}
              onChange={setVendas}
            />
            <Slider
              label="Ticket médio por venda"
              value={ticket}
              min={100}
              max={2000}
              step={50}
              format={(v) => formatCurrency(v)}
              onChange={setTicket}
            />
            <Slider
              label="Horas em gestão por semana"
              value={horasGestao}
              min={2}
              max={40}
              step={1}
              format={(v) => `${v}h/semana`}
              onChange={setHorasGestao}
            />
            <Slider
              label="Inadimplência atual"
              value={inadimplencia}
              min={0}
              max={30}
              step={1}
              format={(v) => `${v}%`}
              onChange={setInadimplencia}
            />
          </motion.div>

          {/* Result */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-brand-primary/30 bg-brand-primary/5 p-6 flex flex-col justify-between"
          >
            <div>
              <p className="text-sm text-muted mb-2">Você pode recuperar até</p>
              <motion.div
                key={result}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="font-heading font-bold text-4xl md:text-5xl text-gradient mb-2"
              >
                {formatCurrency(result)}
                <span className="text-xl font-normal text-muted">/mês</span>
              </motion.div>
              <p className="text-sm text-muted mb-8">
                Combinando economia de tempo, aumento de conversão e redução de inadimplência.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { label: "Economia de tempo (60% menos)", value: Math.round(horasGestao * 0.6 * 25 * 4) },
                  { label: "Mais conversões (+5%)", value: Math.round(vendas * ticket * 0.05) },
                  { label: "Recuperação de inadimplência", value: Math.round((inadimplencia / 100) * vendas * ticket * 0.3) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{item.label}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button size="lg" className="w-full" asChild>
              <Link href={REGISTER_URL}>
                Quero esses resultados
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <p className="text-xs text-center text-subtle mt-3">
              Valores estimados. Resultados reais podem variar.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
