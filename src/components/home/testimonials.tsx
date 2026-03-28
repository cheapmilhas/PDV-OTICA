"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { testimonials } from "@/content/testimonials";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

export function Testimonials() {
  return (
    <section
      className="section-padding"
      style={{ background: "var(--lp-surface)" }}
    >
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Depoimentos
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
            Quem usa,{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              aprova.
            </span>
          </h2>
          <p
            className="mt-3 max-w-md"
            style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}
          >
            Óticas de todo o Brasil já transformaram sua gestão com o PDV Ótica.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {testimonials.map((t, idx) => (
            <motion.div
              key={t.name}
              variants={fadeInUp}
              whileHover={{
                y: -4,
                transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] },
              }}
              className="relative rounded-2xl p-6 flex flex-col transition-all duration-300 cursor-default"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
              }}
            >
              {/* Large decorative quote — human touch at low opacity */}
              <span
                className="absolute top-3 right-4 font-heading font-bold select-none pointer-events-none"
                style={{
                  fontSize: "6rem",
                  lineHeight: 1,
                  color: "rgba(99,102,241,0.06)",
                  fontStyle: "normal",
                }}
              >
                "
              </span>

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <blockquote
                className="text-sm leading-relaxed mb-6 flex-1"
                style={{ color: "var(--lp-muted)" }}
              >
                &ldquo;{t.text}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3">
                {/* Avatar — initials with subtle background, not gradient */}
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{
                    background: "rgba(99,102,241,0.12)",
                    border: "1px solid rgba(99,102,241,0.20)",
                    color: "var(--brand-primary)",
                  }}
                >
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--lp-foreground)" }}
                  >
                    {t.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--lp-muted)" }}>
                    {t.role} · {t.store}
                  </p>
                  <p className="text-xs" style={{ color: "var(--lp-subtle)" }}>
                    {t.city}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
