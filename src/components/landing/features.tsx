import {
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  BarChart3,
  Target,
  Smartphone,
  Shield,
  ClipboardList,
  FileText,
  Gift,
  Building2,
} from "lucide-react";

const features = [
  {
    icon: ShoppingCart,
    title: "PDV Rápido",
    description: "Ponto de venda otimizado para óticas com atalhos de teclado e busca inteligente de produtos.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Package,
    title: "Gestão de Estoque",
    description: "Controle completo com alertas de estoque mínimo, ajustes, entradas e classificação ABC.",
    color: "from-emerald-500 to-green-500",
  },
  {
    icon: DollarSign,
    title: "Financeiro Integrado",
    description: "Contas a pagar e receber, fluxo de caixa, DRE e controle de inadimplência em um só lugar.",
    color: "from-yellow-500 to-orange-500",
  },
  {
    icon: Users,
    title: "CRM Inteligente",
    description: "Follow-up automático, segmentação de clientes, campanhas de reativação e lembretes.",
    color: "from-purple-500 to-pink-500",
  },
  {
    icon: BarChart3,
    title: "Relatórios Completos",
    description: "Vendas, comissões, estoque, financeiro e muito mais com exportação para PDF e Excel.",
    color: "from-indigo-500 to-blue-500",
  },
  {
    icon: Target,
    title: "Metas e Comissões",
    description: "Defina metas por vendedor, acompanhe desempenho e calcule comissões automaticamente.",
    color: "from-red-500 to-rose-500",
  },
  {
    icon: Smartphone,
    title: "100% Responsivo",
    description: "Acesse de qualquer dispositivo — celular, tablet ou computador. Interface adaptável.",
    color: "from-cyan-500 to-teal-500",
  },
  {
    icon: Shield,
    title: "Permissões Granulares",
    description: "Controle exatamente o que cada funcionário pode ver e fazer com 57 permissões configuráveis.",
    color: "from-amber-500 to-yellow-500",
  },
  {
    icon: ClipboardList,
    title: "Ordens de Serviço",
    description: "Acompanhe lentes em laboratório com status em tempo real e notificação ao cliente.",
    color: "from-teal-500 to-emerald-500",
  },
  {
    icon: FileText,
    title: "Orçamentos",
    description: "Crie orçamentos detalhados e converta em vendas com um clique. Envie por WhatsApp.",
    color: "from-pink-500 to-rose-500",
  },
  {
    icon: Gift,
    title: "Cashback",
    description: "Programa de fidelidade integrado para reter clientes e aumentar vendas recorrentes.",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: Building2,
    title: "Multi-filial",
    description: "Gerencie múltiplas lojas em uma única plataforma com dados consolidados por rede.",
    color: "from-sky-500 to-blue-500",
  },
];

export function Features() {
  return (
    <section id="funcionalidades" className="relative py-20 md:py-28 bg-gray-950">
      {/* Divisor superior */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Título */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Tudo que sua ótica precisa{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              em um só lugar
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            Do atendimento ao financeiro, cada funcionalidade foi pensada para a realidade das óticas brasileiras.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-xl border border-gray-800 bg-gray-900/50 p-6 hover:border-gray-700 hover:-translate-y-1 transition-all duration-300"
            >
              <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}>
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
