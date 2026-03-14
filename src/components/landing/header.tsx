"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Glasses } from "lucide-react";

const navLinks = [
  { label: "Funcionalidades", href: "/#funcionalidades" },
  { label: "Precos", href: "/#precos" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contato", href: "/contato" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-[background,border,box-shadow] duration-500 ${
        scrolled
          ? "bg-white/80 backdrop-blur-2xl border-b border-teal-100/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded-lg">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-teal-500/20">
              <Glasses className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-display font-bold tracking-wide text-gray-900 leading-none">
                PDV <span className="text-teal-600">Otica</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-teal-600/50 font-medium">
                Gestao inteligente
              </span>
            </div>
          </Link>

          {/* Nav Desktop */}
          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-sm text-gray-500 hover:text-gray-900 transition-colors duration-300 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-teal-500 after:transition-all after:duration-300 hover:after:w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded px-1"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Botoes Desktop */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="px-5 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors border border-gray-200 rounded-lg hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
            >
              Entrar
            </Link>
            <Link
              href="/registro"
              className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-[background,transform,box-shadow] shadow-md shadow-teal-600/20 hover:shadow-teal-600/30 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2"
            >
              Teste Gratis
            </Link>
          </div>

          {/* Hamburger Mobile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded-lg"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Menu Mobile */}
      {menuOpen && (
        <nav className="md:hidden bg-white/95 backdrop-blur-2xl border-t border-gray-100" aria-label="Menu mobile">
          <div className="px-4 py-6 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3.5 text-gray-600 hover:text-gray-900 hover:bg-teal-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 mt-4 border-t border-gray-100 space-y-3">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-center text-gray-600 border border-gray-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
              >
                Entrar
              </Link>
              <Link
                href="/registro"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 text-center text-white font-semibold bg-teal-600 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
              >
                Teste Gratis
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
