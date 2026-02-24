import Link from "next/link";
import { Glasses, Phone, Mail, MapPin } from "lucide-react";

const productLinks = [
  { label: "Funcionalidades", href: "/#funcionalidades" },
  { label: "Preços", href: "/#precos" },
  { label: "FAQ", href: "/#faq" },
];

const companyLinks = [
  { label: "Contato", href: "/contato" },
];

export function Footer() {
  return (
    <footer className="relative bg-gray-950 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Glasses className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                PDV <span className="text-indigo-400">Ótica</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-gray-500 leading-relaxed">
              Sistema completo de gestão para óticas. PDV, estoque, financeiro, CRM e muito mais.
            </p>
          </div>

          {/* Produto */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Produto</h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Empresa</h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Contato</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://wa.me/5585999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  (85) 99999-9999
                </a>
              </li>
              <li>
                <a
                  href="mailto:contato@pdvotica.com"
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  contato@pdvotica.com
                </a>
              </li>
              <li>
                <span className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="h-4 w-4" />
                  Fortaleza, CE
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} PDV Ótica. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/contato" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Fale conosco
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
