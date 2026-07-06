import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";

/**
 * /admin/suporte não tinha página própria (só /admin/suporte/tickets), então o
 * breadcrumb "Suporte" levava a 404. Redireciona para a lista de tickets.
 */
export default async function SuportePage() {
  await requireAdmin();
  redirect("/admin/suporte/tickets");
}
