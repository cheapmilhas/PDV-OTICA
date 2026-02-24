import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative py-20 md:py-28 bg-gray-950 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />

      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[400px] bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-indigo-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
          Pronto para modernizar{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            sua ótica?
          </span>
        </h2>

        <p className="mt-6 text-lg text-gray-400 max-w-xl mx-auto">
          Comece seu teste grátis de 14 dias agora. Sem cartão de crédito, sem compromisso.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/registro"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-xl shadow-indigo-500/25"
          >
            Começar teste grátis
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Ou fale com a gente pelo WhatsApp:{" "}
          <a
            href="https://wa.me/5585999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            (85) 99999-9999
          </a>
        </p>
      </div>
    </section>
  );
}
