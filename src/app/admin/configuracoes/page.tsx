import Link from "next/link";
import { Package, UserCog, ScrollText, RefreshCw, Mail, ShieldCheck, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin-session";

const SECTIONS = [
  { href: "/admin/configuracoes/planos", icon: Package, title: "Planos", desc: "Gerenciar planos comercializáveis" },
  { href: "/admin/configuracoes/equipe", icon: UserCog, title: "Equipe", desc: "Administradores e permissões" },
  { href: "/admin/configuracoes/logs", icon: ScrollText, title: "Logs", desc: "Auditoria de ações" },
  { href: "/admin/configuracoes/sincronizacao", icon: RefreshCw, title: "Sincronização", desc: "Auto-sync de configurações" },
  { href: "/admin/configuracoes/emails", icon: Mail, title: "Emails", desc: "Emails transacionais do SaaS" },
  { href: "/admin/configuracoes/seguranca", icon: ShieldCheck, title: "Segurança", desc: "MFA da sua conta admin" },
  { href: "/admin/configuracoes/whatsapp", icon: MessageCircle, title: "WhatsApp", desc: "Conexões de WhatsApp por ótica" },
];

export default async function ConfiguracoesHubPage() {
  await requireAdmin();

  return (
    <div className="p-6">
      <PageHeader title="Configurações" subtitle="Gerencie planos, equipe e integrações" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="p-5 hover:bg-muted transition-colors h-full">
              <s.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium text-foreground">{s.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
