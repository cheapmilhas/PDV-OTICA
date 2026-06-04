"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowRight } from "lucide-react";
import { NAV_LINKS, REGISTER_URL, LOGIN_URL } from "@/lib/constants";
import { VisLogo } from "./vis-logo";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 transition-all duration-300"
      style={
        scrolled
          ? {
              background: "rgba(255, 255, 255, 0.85)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderBottom: "1px solid var(--lp-border)",
              boxShadow: "0 1px 2px rgba(10,31,68,0.05), 0 4px 24px rgba(10,31,68,0.06)",
            }
          : {
              background: "transparent",
              backdropFilter: "none",
              borderBottom: "1px solid transparent",
            }
      }
    >
      <div className="container-custom">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group" aria-label="Vis — início">
            <VisLogo height={30} priority className="transition-transform duration-200 group-hover:scale-[1.03]" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: "var(--lp-muted)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--lp-foreground)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "var(--lp-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--lp-muted)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href={LOGIN_URL}
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--lp-muted)" }}
            >
              Entrar
            </Link>
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Link
                href={REGISTER_URL}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white group transition-all"
                style={{
                  background: "var(--gradient-brand-vivid)",
                  boxShadow: "0 2px 12px var(--brand-glow)",
                }}
              >
                Começar grátis
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>

          {/* Mobile toggle */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "var(--lp-foreground)" }}
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="md:hidden overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.97)",
              backdropFilter: "blur(20px)",
              borderBottom: "1px solid var(--lp-border)",
            }}
          >
            <div className="container-custom py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: "var(--lp-muted)" }}
                >
                  {link.label}
                </Link>
              ))}
              <div
                className="pt-3 mt-2 flex flex-col gap-2"
                style={{ borderTop: "1px solid var(--lp-border)" }}
              >
                <Link
                  href={LOGIN_URL}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: "var(--lp-muted)" }}
                >
                  Entrar
                </Link>
                <Link
                  href={REGISTER_URL}
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold text-white"
                  style={{
                    background: "var(--gradient-brand-vivid)",
                    boxShadow: "0 2px 12px var(--brand-glow)",
                  }}
                >
                  Começar grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
