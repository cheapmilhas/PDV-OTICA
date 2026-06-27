import { redirect } from "next/navigation";

// Consolidado em /dashboard/metas?tab=config.
export default function ConfigComissoesRedirect() {
  redirect("/dashboard/metas?tab=config");
}
