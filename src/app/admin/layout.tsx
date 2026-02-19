import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
