"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Wallet, FileText, AlertTriangle,
  Package, UserCog, ScrollText, Ticket,
  FileBarChart, UsersRound, Activity, Mail, RefreshCw,
  CreditCard, ShieldCheck, Sparkles, MessageCircle,
} from "lucide-react";

const menuItems = [
  {
    section: "Principal",
    items: [
      { href: "/admin",                   icon: LayoutDashboard, label: "Dashboard",       exact: true },
      { href: "/admin/clientes",          icon: Users,           label: "Clientes",         exact: false },
      { href: "/admin/interessados",      icon: Mail,            label: "Interessados",     exact: false },
      { href: "/admin/usuarios",          icon: UsersRound,      label: "Usuários",         exact: false },
      { href: "/admin/saude",             icon: Activity,        label: "Saúde",            exact: false },
    ],
  },
  {
    section: "Suporte",
    items: [
      { href: "/admin/suporte/tickets",   icon: Ticket,          label: "Tickets",          exact: false },
    ],
  },
  {
    section: "Financeiro",
    items: [
      { href: "/admin/assinaturas",       icon: CreditCard,      label: "Assinaturas",      exact: false },
      { href: "/admin/financeiro",        icon: Wallet,          label: "Visão Geral",      exact: true  },
      { href: "/admin/financeiro/faturas",icon: FileText,        label: "Faturas",          exact: false },
      { href: "/admin/financeiro/inadimplencia", icon: AlertTriangle, label: "Inadimplência", exact: false },
    ],
  },
  {
    section: "Relatórios",
    items: [
      { href: "/admin/relatorios",        icon: FileBarChart,    label: "Relatórios",       exact: false },
    ],
  },
  {
    section: "Configurações",
    items: [
      { href: "/admin/configuracoes/planos",  icon: Package,  label: "Planos",  exact: false },
      { href: "/admin/configuracoes/equipe",  icon: UserCog,  label: "Equipe",  exact: false },
      { href: "/admin/configuracoes/ia",      icon: Sparkles, label: "IA",      exact: false },
      { href: "/admin/configuracoes/whatsapp", icon: MessageCircle, label: "WhatsApp", exact: false },
      { href: "/admin/configuracoes/logs",    icon: ScrollText, label: "Logs",  exact: false },
      { href: "/admin/configuracoes/sincronizacao", icon: RefreshCw, label: "Sincronização", exact: false },
      { href: "/admin/configuracoes/emails",    icon: Mail,        label: "Emails",    exact: false },
      { href: "/admin/configuracoes/seguranca", icon: ShieldCheck, label: "Segurança", exact: false },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    // "/admin/clientes/novo" não deve activar "/admin/clientes"
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto">
      {menuItems.map((section) => (
        <div key={section.section} className="mb-6">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.section}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-primary" : ""}`} />
                  {item.label}
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
