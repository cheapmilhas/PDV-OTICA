"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Warehouse,
  CreditCard,
  FileText,
  BarChart3,
  Settings,
  ClipboardList,
  Stethoscope,
  Gift,
  Truck,
  UserCog,
} from "lucide-react";

const menuItems = [
  {
    title: "Principal",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "PDV", href: "/dashboard/pdv", icon: ShoppingCart, hotkey: "F2" },
    ],
  },
  {
    title: "Vendas",
    items: [
      { name: "Ordens de Serviço", href: "/dashboard/ordens-servico", icon: ClipboardList },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { name: "Clientes", href: "/dashboard/clientes", icon: Users, hotkey: "F3" },
      { name: "Produtos", href: "/dashboard/produtos", icon: Package, hotkey: "F4" },
      { name: "Fornecedores", href: "/dashboard/fornecedores", icon: Truck },
      { name: "Funcionários", href: "/dashboard/funcionarios", icon: UserCog },
    ],
  },
  {
    title: "Gestão",
    items: [
      { name: "Estoque", href: "/dashboard/estoque", icon: Warehouse },
      { name: "Caixa", href: "/dashboard/caixa", icon: CreditCard },
      { name: "Financeiro", href: "/dashboard/financeiro", icon: FileText },
      { name: "Metas", href: "/dashboard/metas", icon: Gift },
      { name: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
    ],
  },
  {
    title: "Configurações",
    items: [{ name: "Configurações", href: "/dashboard/configuracoes", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <span>PDV Ótica</span>
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4">
        {menuItems.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.name}</span>
                      {item.hotkey && (
                        <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-xs font-mono border rounded bg-background">
                          {item.hotkey}
                        </kbd>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground text-center">
          <p>Versão 1.0.0</p>
          <p className="mt-1">© 2026 PDV Ótica</p>
        </div>
      </div>
    </aside>
  );
}
