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
  Gift,
  Truck,
  UserCog,
  Bell,
  Wallet,
  Target,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { PermissionGuard } from "@/components/permission-guard";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import Image from "next/image";

const menuItems = [
  {
    title: "Principal",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        name: "PDV",
        href: "/dashboard/pdv",
        icon: ShoppingCart,
        hotkey: "F2",
        permission: "sales.create"
      },
    ],
  },
  {
    title: "Vendas",
    items: [
      {
        name: "Vendas",
        href: "/dashboard/vendas",
        icon: CreditCard,
        permission: "sales.access"
      },
      {
        name: "Orçamentos",
        href: "/dashboard/orcamentos",
        icon: FileText,
        permission: "quotes.access"
      },
      {
        name: "Ordens de Serviço",
        href: "/dashboard/ordens-servico",
        icon: ClipboardList,
        permission: "service_orders.access"
      },
    ],
  },
  {
    title: "Cadastros",
    items: [
      {
        name: "Clientes",
        href: "/dashboard/clientes",
        icon: Users,
        hotkey: "F3",
        permission: "customers.access"
      },
      {
        name: "Produtos",
        href: "/dashboard/produtos",
        icon: Package,
        hotkey: "F4",
        permission: "products.access"
      },
      {
        name: "Fornecedores",
        href: "/dashboard/fornecedores",
        icon: Truck,
        permission: "suppliers.access"
      },
      {
        name: "Laboratórios",
        href: "/dashboard/laboratorios",
        icon: FlaskConical,
        permission: "laboratories.access"
      },
      {
        name: "Tratamentos",
        href: "/dashboard/tratamentos",
        icon: Sparkles,
        permission: "products.access"
      },
      {
        name: "Funcionários",
        href: "/dashboard/funcionarios",
        icon: UserCog,
        permission: "users.access"
      },
    ],
  },
  {
    title: "Gestão",
    items: [
      {
        name: "Estoque",
        href: "/dashboard/estoque",
        icon: Warehouse,
        permission: "stock.access"
      },
      {
        name: "Caixa",
        href: "/dashboard/caixa",
        icon: CreditCard,
        permission: "cash.access"
      },
      {
        name: "Financeiro",
        href: "/dashboard/financeiro",
        icon: FileText,
        permission: "financial.access"
      },
      {
        name: "Cashback",
        href: "/dashboard/cashback",
        icon: Wallet,
        permission: "cashback.access"
      },
      {
        name: "Metas",
        href: "/dashboard/metas",
        icon: Target,
        permission: "goals.access"
      },
      {
        name: "Lembretes",
        href: "/dashboard/lembretes",
        icon: Bell,
        permission: "reminders.access"
      },
      {
        name: "Relatórios",
        href: "/dashboard/relatorios",
        icon: BarChart3,
        permission: "reports.access"
      },
    ],
  },
  {
    title: "Configurações",
    items: [
      {
        name: "Configurações",
        href: "/dashboard/configuracoes",
        icon: Settings,
        permission: "settings.access"
      }
    ],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const { logoUrl, displayName } = useCompanySettings();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          {logoUrl ? (
            <>
              <div className="relative h-8 w-8 flex-shrink-0">
                <Image
                  src={logoUrl}
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className="truncate">{displayName || "PDV Ótica"}</span>
            </>
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <span>{displayName || "PDV Ótica"}</span>
            </>
          )}
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

                // Se o item tem permissão, envolve com PermissionGuard
                const linkContent = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
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
                );

                return (
                  <li key={item.name}>
                    {item.permission ? (
                      <PermissionGuard permission={item.permission}>
                        {linkContent}
                      </PermissionGuard>
                    ) : (
                      linkContent
                    )}
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
