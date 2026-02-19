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
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors text-sm"
    >
      <LogOut className="h-4 w-4 flex-shrink-0" />
      Sair
    </button>
  );
}
