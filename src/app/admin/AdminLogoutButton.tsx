"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors text-sm"
    >
      <LogOut className="h-4 w-4 flex-shrink-0" />
      Sair
    </button>
  );
}
