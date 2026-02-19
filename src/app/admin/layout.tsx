import type { Metadata } from "next";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Wallet,
  FileText,
  AlertTriangle,
  Settings,
  Package,
  UserCog,
  ScrollText,
  UserPlus,
  Ticket,
  FileBarChart
} from "lucide-react";
import { AdminLogoutButton } from "./AdminLogoutButton";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

const menuItems = [
  {
    section: "Principal",
    items: [
      { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/admin/clientes", icon: Users, label: "Todos os Clientes" },
      { href: "/admin/clientes/novo", icon: UserPlus, label: "Novo Cliente" },
    ]
  },
  {
    section: "Suporte",
    items: [
      { href: "/admin/suporte/tickets", icon: Ticket, label: "Tickets" },
    ]
  },
  {
    section: "Financeiro",
    items: [
      { href: "/admin/financeiro", icon: Wallet, label: "Visão Geral" },
      { href: "/admin/financeiro/faturas", icon: FileText, label: "Faturas" },
      { href: "/admin/financeiro/inadimplencia", icon: AlertTriangle, label: "Inadimplência" },
    ]
  },
  {
    section: "Relatórios",
    items: [
      { href: "/admin/relatorios", icon: FileBarChart, label: "Relatórios" },
    ]
  },
  {
    section: "Configurações",
    items: [
      { href: "/admin/configuracoes/planos", icon: Package, label: "Planos" },
      { href: "/admin/configuracoes/equipe", icon: UserCog, label: "Equipe" },
      { href: "/admin/configuracoes/logs", icon: ScrollText, label: "Logs" },
    ]
  }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">PDV Ótica</p>
              <p className="text-xs text-gray-500 leading-tight">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {menuItems.map((section) => (
            <div key={section.section} className="mb-6">
              <p className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {section.section}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-gray-800">
          <AdminLogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
