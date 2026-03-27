import type { Metadata } from "next";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { AdminNav } from "./admin-nav";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

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
        <AdminNav />

        {/* Footer */}
        <div className="px-3 py-3 border-t border-gray-800">
          <AdminLogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar com breadcrumb e sino */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-950">
          <AdminBreadcrumb />
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
