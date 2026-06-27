import { redirect } from "next/navigation";

// Consolidado em /dashboard/metas?tab=comissoes. 307 (redirect, não permanentRedirect).
export default function RelatorioComissoesRedirect() {
  redirect("/dashboard/metas?tab=comissoes");
}
