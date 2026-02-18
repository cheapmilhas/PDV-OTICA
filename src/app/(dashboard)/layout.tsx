import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeProvider } from "@/components/theme-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - esconde em mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
          <Header />
          {/* pb-16 em mobile para não sobrepor o bottom nav */}
          <main className="flex-1 overflow-y-auto bg-muted/10 p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Navegação inferior — apenas mobile */}
      <MobileNav />
    </ThemeProvider>
  );
}
