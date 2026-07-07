import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin-session";
import { CONFIG_GROUPS, sectionsByGroup } from "./sections";

export default async function ConfiguracoesHubPage() {
  await requireAdmin();

  return (
    <div className="p-6 space-y-8">
      <PageHeader title="Configurações" subtitle="Negócio, integrações e sistema — tudo num lugar" />
      {CONFIG_GROUPS.map((group) => {
        const sections = sectionsByGroup(group.key);
        if (sections.length === 0) return null;
        return (
          <section key={group.key} className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {group.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sections.map((s) => (
                <Link key={s.href} href={s.href}>
                  <Card className="p-5 hover:bg-muted transition-colors h-full">
                    <s.icon className="h-5 w-5 text-primary" />
                    <p className="mt-3 font-medium text-foreground">{s.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
