/**
 * N6 — checklist de onboarding da clínica, DERIVADO do uso real.
 *
 * 🔑 DERIVADO, nunca MARCADO. Não existe tabela, não existe `completedAt`,
 * ninguém "conclui" um passo. Cada marco é uma pergunta respondida pelo estado
 * atual do Domus, toda vez que a tela abre.
 *
 * Isso não é preguiça de modelagem — é a conclusão do painel adversarial
 * (2026-07-27), que matou a alternativa de carimbar `completedAt` na primeira
 * observação: seria escrita IRREVERSÍVEL a partir de amostragem lossy, no mesmo
 * campo que um humano preenche. Se a coleta perdesse um dia, o marco ficaria
 * falso para sempre; e um marco carimbado por engano não teria como ser
 * desfeito. Derivado erra apenas enquanto o dado está errado, e se corrige
 * sozinho.
 *
 * ⚠️ Consequência ACEITA: apagar o último médico faz o passo "voltar" a
 * pendente. Está correto — a clínica de fato não tem médico cadastrado agora.
 *
 * Os passos NÃO são os do checklist ótico (`OnboardingChecklist`/`OnboardingStep`
 * no Prisma), que tem marcos como FIRST_BRANCH e PRODUCTS_IMPORTED sem sentido
 * para clínica. Aquele modelo fica intocado.
 */
import type { ClinicUsage } from "@/lib/vis-usage-client";

export interface MedicalStep {
  key: string;
  label: string;
  /** O que este marco significa para o negócio — vira tooltip/legenda. */
  hint: string;
  done: boolean;
  /** Marcos essenciais entram no progresso; os demais são sinal de maturidade. */
  required: boolean;
}

export interface MedicalOnboarding {
  steps: MedicalStep[];
  /** Concluídos entre os obrigatórios. */
  doneRequired: number;
  totalRequired: number;
  /** 0..100, só sobre os obrigatórios. */
  percent: number;
  /**
   * A clínica passou do "configurei" para o "estou usando"? Exige atividade
   * clínica real, não só cadastro — é o sinal que separa trial que converte de
   * trial que morre.
   */
  ativa: boolean;
}

/**
 * Traduz contagens em marcos.
 *
 * A ordem é a do caminho natural de adoção: configurar a clínica → cadastrar
 * quem atende → abrir a agenda → receber paciente → atender.
 */
export function deriveMedicalOnboarding(usage: ClinicUsage): MedicalOnboarding {
  const steps: MedicalStep[] = [
    {
      key: "LEGAL_DATA",
      label: "Dados da clínica preenchidos",
      hint: "Razão social e CNPJ — necessários para emitir documentos.",
      done: usage.legalFieldsFilled === 1,
      required: true,
    },
    {
      key: "FIRST_DOCTOR",
      label: "Profissional cadastrado",
      hint: "Sem profissional ativo não é possível agendar.",
      done: usage.doctorsActive >= 1,
      required: true,
    },
    {
      key: "WORKING_HOURS",
      label: "Horário de funcionamento definido",
      hint: "A agenda só abre nos dias configurados.",
      done: usage.workingHoursDays >= 1,
      required: true,
    },
    {
      key: "FIRST_PATIENT",
      label: "Primeiro paciente cadastrado",
      hint: "Primeiro sinal de uso real, não só configuração.",
      done: usage.patients >= 1,
      required: true,
    },
    {
      key: "FIRST_APPOINTMENT",
      label: "Primeiro agendamento",
      hint: "A clínica começou a operar de fato.",
      done: usage.appointments >= 1,
      required: true,
    },
    {
      key: "TEAM",
      label: "Equipe além do administrador",
      hint: "Secretária ou segundo profissional — indica adoção pela equipe.",
      // >= 2 porque o admin que aceitou o convite já conta como 1.
      done: usage.staffActive >= 2,
      required: false,
    },
    {
      key: "FIRST_RECORD",
      label: "Primeiro prontuário",
      hint: "Uso clínico real — o passo mais tardio e mais forte.",
      done: usage.medicalRecords >= 1,
      required: false,
    },
    {
      key: "ONLINE_BOOKING",
      label: "Agendamento online ativado",
      hint: "Opcional — a clínica expôs a agenda ao paciente.",
      done: usage.onlineBookingEnabled === 1,
      required: false,
    },
  ];

  const obrigatorios = steps.filter((s) => s.required);
  const doneRequired = obrigatorios.filter((s) => s.done).length;
  const totalRequired = obrigatorios.length;

  return {
    steps,
    doneRequired,
    totalRequired,
    percent: totalRequired === 0 ? 0 : Math.round((doneRequired / totalRequired) * 100),
    // "Ativa" exige movimento RECENTE, não histórico: uma clínica que agendou
    // em janeiro e parou não está ativa hoje. É a diferença entre "já usou" e
    // "está usando" — e é essa a pergunta que decide se o trial converte.
    ativa: usage.appointmentsLast30d >= 1,
  };
}
