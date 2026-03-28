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
  DollarSign,
  BookOpen,
  ArrowLeftRight,
  Receipt,
  Building2,
  ListTree,
  RotateCcw,
  RefreshCw,
  Boxes,
  PieChart,
  Shield,
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
        name: "Transferências",
        href: "/dashboard/estoque/transferencias",
        icon: ArrowLeftRight,
        permission: "stock.view"
      },
      {
        name: "Lotes de Estoque",
        href: "/dashboard/financeiro/lotes-estoque",
        icon: Boxes,
        permission: "stock.view"
      },
      {
        name: "Caixa",
        href: "/dashboard/caixa",
        icon: CreditCard,
        permission: "cash_shift.view"
      },
      {
        name: "Contas Pagar/Receber",
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
      {
        name: "Comparativo Lojas",
        href: "/dashboard/relatorios/comparativo-lojas",
        icon: ArrowLeftRight,
        permission: "reports.sales"
      },
    ],
  },
  {
    title: "Financeiro",
    items: [
      {
        name: "Dashboard Financeiro",
        href: "/dashboard/financeiro/dashboard",
        icon: DollarSign,
        permission: "financial.view"
      },
      {
        name: "DRE Dinâmica",
        href: "/dashboard/financeiro/dre",
        icon: BookOpen,
        permission: "financial.view"
      },
      {
        name: "Fluxo de Caixa",
        href: "/dashboard/financeiro/fluxo-caixa",
        icon: ArrowLeftRight,
        permission: "financial.view"
      },
      {
        name: "Lançamentos",
        href: "/dashboard/financeiro/lancamentos",
        icon: Receipt,
        permission: "financial.view"
      },
      {
        name: "Contas",
        href: "/dashboard/financeiro/contas",
        icon: Building2,
        permission: "financial.view"
      },
      {
        name: "Plano de Contas",
        href: "/dashboard/financeiro/plano-contas",
        icon: ListTree,
        permission: "financial.view"
      },
      {
        name: "Devoluções",
        href: "/dashboard/financeiro/devolucoes",
        icon: RotateCcw,
        permission: "financial.view"
      },
      {
        name: "Conciliação",
        href: "/dashboard/financeiro/conciliacao",
        icon: RefreshCw,
        permission: "financial.view"
      },
      {
        name: "BI Analítico",
        href: "/dashboard/financeiro/bi",
        icon: PieChart,
        permission: "financial.view"
      },
      {
        name: "Cartões",
        href: "/dashboard/financeiro/cartoes",
        icon: CreditCard,
        permission: "financial.view"
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
      },
      {
        name: "Usuários",
        href: "/dashboard/usuarios",
        icon: Shield,
        permission: "users.view"
      },
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

  // Cor do sidebar: usa a cor primária escolhida ou padrão escuro
  const sidebarBg = primaryColor || null;

  // Calcula luminância para decidir se texto deve ser branco ou escuro
  const useWhiteText = (() => {
    if (!sidebarBg) return true; // padrão escuro usa texto branco
    const hex = sidebarBg.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 160;
  })();

  // Classes condicionais baseadas na cor do sidebar
  const textColor = useWhiteText ? "text-white" : "text-foreground";
  const mutedTextColor = useWhiteText ? "text-white/50" : "text-muted-foreground";
  const activeClass = useWhiteText
    ? "bg-white/25 text-white font-semibold"
    : "bg-primary/10 text-primary font-semibold";
  const hoverClass = useWhiteText
    ? "text-white/80 hover:bg-white/15 hover:text-white"
    : "text-muted-foreground hover:bg-muted hover:text-foreground";
  const borderColor = useWhiteText ? "border-white/15" : "border-border";

  const defaultSidebarStyle = !sidebarBg
    ? { backgroundColor: "hsl(var(--sidebar))" }
    : { backgroundColor: sidebarBg };

  return (
    <aside
      className="flex h-screen w-64 flex-col border-r shrink-0"
      style={defaultSidebarStyle}
    >
      {/* Logo */}
      <div className={cn("flex h-[72px] items-center justify-center border-b px-4", borderColor)}>
        <Link href="/dashboard" className="flex items-center justify-center w-full">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-11 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <>
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0",
                useWhiteText ? "bg-white/15" : "bg-primary/10"
              )}>
                <ShoppingCart className={cn("h-5 w-5", useWhiteText ? "text-white/90" : "text-primary")} />
              </div>
              <span className={cn("ml-2.5 font-bold text-base truncate", textColor)}>
                {displayName || "PDV Ótica"}
              </span>
            </>
          )}
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {menuItems.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.permission || isAdmin || hasPermission(item.permission)
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="mb-5">
              <p className={cn(
                "mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest",
                mutedTextColor
              )}>
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));

                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
                          isActive ? activeClass : hoverClass
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.name}</span>
                        {item.hotkey && (
                          <kbd className={cn(
                            "hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded",
                            useWhiteText
                              ? "border border-white/20 bg-white/10 text-white/50"
                              : "border border-border bg-muted text-muted-foreground"
                          )}>
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
      <div className={cn("border-t px-4 py-3", borderColor)}>
        <p className={cn("text-[10px] text-center", mutedTextColor)}>
          v1.0 · PDV Ótica
        </p>
      </div>
    </aside>
  );
}
