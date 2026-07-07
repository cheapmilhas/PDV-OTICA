import type { LucideIcon } from "lucide-react";
import {
  Package,
  UserCog,
  Mail,
  BrainCircuit,
  MessageCircle,
  ScrollText,
  RefreshCw,
  ShieldCheck,
  PlugZap,
  HeartPulse,
} from "lucide-react";

/**
 * FONTE ÚNICA de verdade das seções de Configurações do super admin.
 *
 * Antes, o menu lateral (admin-nav.tsx) e o hub (configuracoes/page.tsx)
 * mantinham DUAS listas duplicadas e dessincronizadas. Agora ambos importam
 * daqui — adicionar/mover uma seção é uma edição só.
 *
 * NÃO adicionar "use client" nem imports server-only: este módulo é consumido
 * tanto por server components (o hub) quanto por client components (o nav).
 */

export type ConfigGroup = "negocio" | "integracoes" | "sistema";

export interface ConfigSection {
  href: string;
  icon: LucideIcon;
  /** Título no card do hub. */
  title: string;
  /** Descrição curta no card do hub. */
  desc: string;
  /** Rótulo (mais curto) no menu lateral. */
  navLabel: string;
  group: ConfigGroup;
}

export const CONFIG_GROUPS: { key: ConfigGroup; title: string }[] = [
  { key: "negocio", title: "Negócio" },
  { key: "integracoes", title: "Integrações & Chaves" },
  { key: "sistema", title: "Sistema" },
];

export const CONFIG_SECTIONS: ConfigSection[] = [
  // ── Negócio ────────────────────────────────────────────────────────────────
  {
    href: "/admin/configuracoes/planos",
    icon: Package,
    title: "Planos",
    desc: "Gerenciar planos comercializáveis",
    navLabel: "Planos",
    group: "negocio",
  },
  {
    href: "/admin/configuracoes/equipe",
    icon: UserCog,
    title: "Equipe",
    desc: "Administradores e permissões",
    navLabel: "Equipe",
    group: "negocio",
  },
  {
    href: "/admin/configuracoes/emails",
    icon: Mail,
    title: "Emails",
    desc: "Remetente, chave e emails transacionais do SaaS",
    navLabel: "Emails",
    group: "negocio",
  },
  // ── Integrações & Chaves ─────────────────────────────────────────────────────
  {
    href: "/admin/configuracoes/integracoes",
    icon: PlugZap,
    title: "Integrações",
    desc: "Status de conexão dos serviços externos (e-mail, cobrança, WhatsApp…)",
    navLabel: "Integrações",
    group: "integracoes",
  },
  {
    href: "/admin/configuracoes/ia",
    icon: BrainCircuit,
    title: "Inteligência Artificial",
    desc: "Chave Anthropic, modelos e parâmetros de custo",
    navLabel: "IA",
    group: "integracoes",
  },
  {
    href: "/admin/configuracoes/whatsapp",
    icon: MessageCircle,
    title: "WhatsApp",
    desc: "Anti-bloqueio e conexões por ótica",
    navLabel: "WhatsApp",
    group: "integracoes",
  },
  // ── Sistema ──────────────────────────────────────────────────────────────────
  {
    href: "/admin/configuracoes/saude",
    icon: HeartPulse,
    title: "Saúde do Sistema",
    desc: "O Pulso — banco, hospedagem, crons, integrações e incidentes",
    navLabel: "Saúde do Sistema",
    group: "sistema",
  },
  {
    href: "/admin/configuracoes/logs",
    icon: ScrollText,
    title: "Logs",
    desc: "Auditoria de ações",
    navLabel: "Logs",
    group: "sistema",
  },
  {
    href: "/admin/configuracoes/sincronizacao",
    icon: RefreshCw,
    title: "Sincronização",
    desc: "Auto-sync de configurações entre óticas",
    navLabel: "Sincronização",
    group: "sistema",
  },
  {
    href: "/admin/configuracoes/seguranca",
    icon: ShieldCheck,
    title: "Segurança",
    desc: "MFA da sua conta admin",
    navLabel: "Segurança",
    group: "sistema",
  },
];

/** Seções de um grupo, na ordem de declaração. */
export function sectionsByGroup(group: ConfigGroup): ConfigSection[] {
  return CONFIG_SECTIONS.filter((s) => s.group === group);
}
