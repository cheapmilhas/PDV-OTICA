import dynamic from "next/dynamic";
import { InstitucionalHero } from "@/components/home/institucional-hero";

/**
 * HOME INSTITUCIONAL — a empresa e os dois segmentos.
 *
 * Até 2026-07-29 esta página era a landing de ÓTICA (13 seções: ROI de lentes,
 * integração com laboratório, ordem de serviço). Elas não foram removidas nem
 * reescritas: mudaram de endereço para /oticas, com os mesmos componentes.
 *
 * Decisão do dono: o site deve dizer que somos uma empresa de tecnologia
 * atendendo dois segmentos, em vez de abrir vendendo só ótica.
 *
 * CUSTO ACEITO E CONHECIDO: quem busca "sistema para ótica" agora precisa de um
 * clique a mais até o preço. A ótica é a receita atual, então vale acompanhar a
 * conversão depois do deploy — se cair, a saída é dar destaque maior ao card de
 * óticas, não voltar atrás na posição institucional.
 */

const sectionFallback = () => <div className="section-padding" aria-hidden />;

const InstitucionalConfianca = dynamic(
  () =>
    import("@/components/home/institucional-confianca").then(
      (m) => m.InstitucionalConfianca
    ),
  { loading: sectionFallback }
);

export default function HomePage() {
  return (
    <>
      <InstitucionalHero />
      <InstitucionalConfianca />
    </>
  );
}
