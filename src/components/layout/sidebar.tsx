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
  const { logoUrl, displayName, primaryColor } = useCompanySettings();

  // Cor do sidebar: usa a cor primária escolhida ou cinza escuro padrão
  const sidebarBg = primaryColor || null;

  // Determina se o fundo é escuro para ajustar cor do texto
  const isDark = (() => {
    if (!sidebarBg) return false;
    const hex = sidebarBg.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Luminância relativa
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
  })();

  const textColor = isDark ? "text-white" : "text-foreground";
  const mutedTextColor = isDark ? "text-white/70" : "text-muted-foreground";
  const activeClass = isDark
    ? "bg-white/20 text-white font-medium"
    : "bg-primary text-primary-foreground font-medium";
  const hoverClass = isDark
    ? "text-white/80 hover:bg-white/10 hover:text-white"
    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground";

  return (
    <aside
      className="flex h-screen w-64 flex-col border-r"
      style={sidebarBg ? { backgroundColor: sidebarBg } : {}}
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center border-b px-6", isDark ? "border-white/20" : "border-border")}>
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          {logoUrl ? (
            // Com logo: exibe apenas a imagem, sem texto
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-10 w-auto max-w-[180px] object-contain"
            />
          ) : (
            // Sem logo: exibe ícone + nome
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/20 flex-shrink-0">
                <ShoppingCart className={cn("h-5 w-5", isDark ? "text-white" : "text-primary")} />
              </div>
              <span className={textColor}>{displayName || "PDV Ótica"}</span>
            </>
          )}
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4">
        {menuItems.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className={cn("mb-2 px-2 text-xs font-semibold uppercase tracking-wider", mutedTextColor)}>
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
                      isActive ? activeClass : hoverClass
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.name}</span>
                    {item.hotkey && (
                      <kbd className={cn("hidden lg:inline-block px-1.5 py-0.5 text-xs font-mono border rounded", isDark ? "border-white/30 bg-white/10 text-white/80" : "border bg-background")}>
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
      <div className={cn("border-t p-4", isDark ? "border-white/20" : "border-border")}>
        <div className={cn("text-xs text-center", mutedTextColor)}>
          <p>Versão 1.0.0</p>
          <p className="mt-1">© 2026 PDV Ótica</p>
        </div>
      </div>
    </aside>
  );
}
