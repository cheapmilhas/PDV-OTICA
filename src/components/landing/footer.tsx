import Link from "next/link";
import { Glasses, Phone, Mail, MapPin } from "lucide-react";

const productLinks = [
  { label: "Funcionalidades", href: "/#funcionalidades" },
  { label: "Precos", href: "/#precos" },
  { label: "FAQ", href: "/#faq" },
];

const companyLinks = [
  { label: "Contato", href: "/contato" },
];

export function Footer() {
  return (
    <footer className="relative bg-navy-900 border-t border-white/5">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded-lg w-fit">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center shadow-lg shadow-gold/15">
                <Glasses className="h-5 w-5 text-navy-900" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-display font-bold text-white leading-none">
                  PDV <span className="text-gold">Otica</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-gold/40 font-medium">
                  Gestao inteligente
                </span>
              </div>
            </Link>
            <p className="mt-5 text-sm text-white/25 leading-relaxed max-w-xs">
              Sistema completo de gestao para oticas. PDV, estoque, financeiro, CRM e muito mais.
            </p>
          </div>

          {/* Produto */}
          <div>
            <h3 className="text-xs font-semibold text-gold/60 uppercase tracking-[0.15em] mb-5">
              Produto
            </h3>
            <ul className="space-y-3.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/30 hover:text-gold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h3 className="text-xs font-semibold text-gold/60 uppercase tracking-[0.15em] mb-5">
              Empresa
            </h3>
            <ul className="space-y-3.5">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/30 hover:text-gold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-xs font-semibold text-gold/60 uppercase tracking-[0.15em] mb-5">
              Contato
            </h3>
            <ul className="space-y-3.5">
              <li>
                <a
                  href="https://wa.me/5585999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm text-white/30 hover:text-gold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded"
                >
                  <Phone className="h-4 w-4 text-gold/30" aria-hidden="true" />
                  (85) 99999-9999
                </a>
              </li>
              <li>
                <a
                  href="mailto:contato@pdvotica.com"
                  className="flex items-center gap-2.5 text-sm text-white/30 hover:text-gold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded"
                >
                  <Mail className="h-4 w-4 text-gold/30" aria-hidden="true" />
                  contato@pdvotica.com
                </a>
              </li>
              <li>
                <span className="flex items-center gap-2.5 text-sm text-white/30">
                  <MapPin className="h-4 w-4 text-gold/30" aria-hidden="true" />
                  Fortaleza, CE
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/15" suppressHydrationWarning>
            &copy; {new Date().getFullYear()} PDV Otica. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/contato" className="text-xs text-white/15 hover:text-gold/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded">
              Fale conosco
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
