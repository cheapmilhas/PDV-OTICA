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
  TrendingUp,
} from "lucide-react";
import { PermissionGuard } from "@/components/permission-guard";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePermissions } from "@/hooks/usePermissions";

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
        permission: "sales.view"
      },
      {
        name: "Orçamentos",
        href: "/dashboard/orcamentos",
        icon: FileText,
        permission: "quotes.view"
      },
      {
        name: "Ordens de Serviço",
        href: "/dashboard/ordens-servico",
        icon: ClipboardList,
        permission: "service_orders.view"
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
        permission: "customers.view"
      },
      {
        name: "Produtos",
        href: "/dashboard/produtos",
        icon: Package,
        hotkey: "F4",
        permission: "products.view"
      },
      {
        name: "Fornecedores",
        href: "/dashboard/fornecedores",
        icon: Truck,
        permission: "suppliers.view"
      },
      {
        name: "Laboratórios",
        href: "/dashboard/laboratorios",
        icon: FlaskConical,
        permission: "laboratories.view"
      },
      {
        name: "Tratamentos",
        href: "/dashboard/tratamentos",
        icon: Sparkles,
        permission: "products.view"
      },
      {
        name: "Funcionários",
        href: "/dashboard/funcionarios",
        icon: UserCog,
        permission: "users.view"
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
        permission: "stock.view"
      },
      {
        name: "Caixa",
        href: "/dashboard/caixa",
        icon: CreditCard,
        permission: "cash_shift.view"
      },
      {
        name: "Financeiro",
        href: "/dashboard/financeiro",
        icon: FileText,
        permission: "financial.view"
      },
      {
        name: "Cashback",
        href: "/dashboard/cashback",
        icon: Wallet,
        permission: "cashback.view"
      },
      {
        name: "Metas",
        href: "/dashboard/metas",
        icon: Target,
        permission: "goals.view"
      },
      {
        name: "Campanhas",
        href: "/dashboard/campanhas",
        icon: TrendingUp,
        permission: "campaigns.view"
      },
      {
        name: "Lembretes",
        href: "/dashboard/lembretes",
        icon: Bell,
        permission: "reminders.view"
      },
      {
        name: "Relatórios",
        href: "/dashboard/relatorios",
        icon: BarChart3,
        permission: "reports.sales"
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
        permission: "settings.view"
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
  const { hasPermission, isAdmin } = usePermissions();

  // Cor do sidebar: usa a cor primária escolhida ou padrão
  const sidebarBg = primaryColor || null;

  // Calcula luminância para decidir se texto deve ser branco ou escuro.
  // Threshold 160 (de 255) — cobre bem azul, verde, roxo, vermelho, rosa, índigo, ciano, laranja
  const useWhiteText = (() => {
    if (!sidebarBg) return false;
    const hex = sidebarBg.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 160;
  })();

  const textColor = useWhiteText ? "text-white" : "text-foreground";
  const mutedTextColor = useWhiteText ? "text-white/80" : "text-muted-foreground";
  const activeClass = useWhiteText
    ? "bg-white/25 text-white font-medium"
    : "bg-primary/10 text-primary font-medium";
  const hoverClass = useWhiteText
    ? "text-white/80 hover:bg-white/15 hover:text-white"
    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground";
  const borderColor = useWhiteText ? "border-white/20" : "border-border";

  return (
    <aside
      className="flex h-screen w-64 flex-col border-r"
      style={sidebarBg ? { backgroundColor: sidebarBg } : {}}
    >
      {/* Logo */}
      <div className={cn("flex h-20 items-center justify-center border-b px-4", borderColor)}>
        <Link href="/dashboard" className="flex items-center justify-center w-full">
          {logoUrl ? (
            // Com logo: centralizada, sem texto
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-12 w-auto max-w-[200px] object-contain"
            />
          ) : (
            // Sem logo: ícone + nome centralizados
            <>
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0",
                useWhiteText ? "bg-white/20" : "bg-primary"
              )}>
                <ShoppingCart className={cn("h-5 w-5", useWhiteText ? "text-white" : "text-primary-foreground")} />
              </div>
              <span className={cn("ml-2 font-bold text-lg", textColor)}>
                {displayName || "PDV Ótica"}
              </span>
            </>
          )}
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4">
        {menuItems.map((section) => {
          // Filtrar itens que o usuário tem acesso
          const visibleItems = section.items.filter(
            (item) => !item.permission || isAdmin || hasPermission(item.permission)
          );

          // Não renderizar seção se não tiver itens visíveis
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="mb-6">
              <h3 className={cn("mb-2 px-2 text-xs font-semibold uppercase tracking-wider", mutedTextColor)}>
                {section.title}
              </h3>
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <li key={item.name}>
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
                          <kbd className={cn("hidden lg:inline-block px-1.5 py-0.5 text-xs font-mono border rounded", useWhiteText ? "border-white/30 bg-white/10 text-white/80" : "border bg-background")}>
                            {item.hotkey}
                          </kbd>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn("border-t p-4", borderColor)}>
        <div className={cn("text-xs text-center", mutedTextColor)}>
          <p>Versão 1.0.0</p>
          <p className="mt-1">© 2026 PDV Ótica</p>
        </div>
      </div>
    </aside>
  );
}
