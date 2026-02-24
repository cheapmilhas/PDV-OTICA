import Link from "next/link";
import { CheckCircle, ArrowRight } from "lucide-react";

const trustBadges = [
  "14 dias grátis",
  "Sem cartão de crédito",
  "Suporte incluso",
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-20 pb-16 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gray-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-600/20 via-purple-600/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-to-tl from-cyan-600/10 to-transparent rounded-full blur-3xl" />

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Sistema completo para gestão de óticas
          </div>

          {/* Título */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight">
            Gerencie sua ótica com{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              eficiência total
            </span>
          </h1>

          {/* Subtítulo */}
          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            PDV, estoque, financeiro, CRM, ordens de serviço e muito mais — tudo integrado em uma plataforma moderna e fácil de usar.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contato"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-xl shadow-indigo-500/25"
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/#funcionalidades"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-gray-300 border border-gray-700 rounded-xl hover:bg-gray-800/50 hover:text-white transition-all"
            >
              Conheça as funcionalidades
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            {trustBadges.map((badge) => (
              <div key={badge} className="flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle className="h-4 w-4 text-green-500" />
                {badge}
              </div>
            ))}
          </div>

          {/* Dashboard mockup */}
          <div className="mt-16 relative">
            <div className="absolute -inset-4 bg-gradient-to-b from-indigo-500/20 to-transparent rounded-2xl blur-2xl" />
            <div className="relative rounded-xl border border-gray-800 bg-gray-900/80 backdrop-blur overflow-hidden shadow-2xl">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 ml-4">
                  <div className="w-64 h-6 rounded bg-gray-800 mx-auto flex items-center justify-center">
                    <span className="text-xs text-gray-500">app.pdvotica.com/dashboard</span>
                  </div>
                </div>
              </div>

              {/* Dashboard preview */}
              <div className="p-6 md:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Vendas hoje", value: "R$ 4.280", color: "from-green-500 to-emerald-500" },
                    { label: "Ordens ativas", value: "12", color: "from-blue-500 to-cyan-500" },
                    { label: "Clientes novos", value: "8", color: "from-purple-500 to-pink-500" },
                    { label: "Produtos", value: "1.847", color: "from-orange-500 to-amber-500" },
                  ].map((card) => (
                    <div key={card.label} className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-4">
                      <p className="text-xs text-gray-500">{card.label}</p>
                      <p className={`text-xl font-bold mt-1 bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 h-32 rounded-lg bg-gray-800/30 border border-gray-700/30" />
                  <div className="h-32 rounded-lg bg-gray-800/30 border border-gray-700/30" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
