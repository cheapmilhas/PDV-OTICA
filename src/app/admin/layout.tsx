import type { Metadata } from "next";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { AdminSidebar, AdminMobileMenu } from "@/components/admin/AdminSidebar";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop fixa + drawer mobile) */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar com breadcrumb e sino */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background">
          <div className="flex items-center gap-2">
            {/* Hambúrguer só aparece no mobile (lg:hidden no próprio botão) */}
            <AdminMobileMenu />
            <AdminBreadcrumb />
          </div>
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
