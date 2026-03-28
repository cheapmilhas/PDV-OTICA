"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { faqItems } from "@/content/faq";
import { GradientText } from "@/components/ui/gradient-text";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

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
            Perguntas{" "}
            <GradientText>frequentes.</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Tudo que você precisa saber antes de começar.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="max-w-3xl mx-auto space-y-2"
        >
          {faqItems.map((item, idx) => (
            <motion.div
              key={idx}
              variants={fadeInUp}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background)] overflow-hidden hover:border-[var(--border-hover)] transition-colors"
            >
              <button
                onClick={() => setOpen(open === idx ? null : idx)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left"
                aria-expanded={open === idx}
              >
                <span className="font-medium text-foreground text-sm leading-snug pr-2">
                  {item.question}
                </span>
                <span className="shrink-0 text-brand-primary">
                  {open === idx ? (
                    <Minus className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>
              </button>
              <AnimatePresence>
                {open === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <div className="px-5 pb-5 pt-0">
                      <p className="text-sm text-muted leading-relaxed">{item.answer}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
