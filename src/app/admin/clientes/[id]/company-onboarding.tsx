import { CheckCircle, Circle, Clock } from "lucide-react";

type OnboardingStep = {
  id: string;
  stepKey: string;
  title: string;
  description: string | null;
  order: number;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: Date | null;
  notes: string | null;
};

type OnboardingChecklist = {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  steps: OnboardingStep[];
};

export function CompanyOnboarding({ checklist }: { checklist: OnboardingChecklist | null }) {
  if (!checklist) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Onboarding</h2>
        <p className="text-sm text-gray-600">Checklist de onboarding não iniciado.</p>
      </div>
    );
  }

  const steps = [...checklist.steps].sort((a, b) => a.order - b.order);
  const requiredSteps = steps.filter((s) => s.isRequired);
  const completedRequired = requiredSteps.filter((s) => s.isCompleted).length;
  const totalRequired = requiredSteps.length;
  const pct = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  const barColor =
    pct === 100 ? "bg-green-500" :
    pct >= 60   ? "bg-blue-500"  :
    pct >= 30   ? "bg-yellow-500" :
                  "bg-red-500";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Header com progress */}
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Onboarding</h2>
          <span className={`text-sm font-bold ${pct === 100 ? "text-green-400" : "text-white"}`}>
            {pct}%
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {completedRequired} de {totalRequired} etapas obrigatórias concluídas
          {checklist.completedAt && (
            <span className="ml-2 text-green-400">
              · Concluído em {new Date(checklist.completedAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </p>
      </div>

      {/* Steps */}
      <div className="divide-y divide-gray-800/40">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 px-5 py-3.5 ${
              step.isCompleted ? "opacity-70" : ""
            }`}
          >
            {/* Ícone */}
            <div className="flex-shrink-0 mt-0.5">
              {step.isCompleted ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : step.isRequired ? (
                <Circle className="h-4 w-4 text-gray-600" />
              ) : (
                <Clock className="h-4 w-4 text-gray-700" />
              )}
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm ${step.isCompleted ? "line-through text-gray-500" : "text-white"}`}>
                  {step.title}
                </p>
                {!step.isRequired && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">opcional</span>
                )}
              </div>
              {step.description && !step.isCompleted && (
                <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
              )}
              {step.isCompleted && step.completedAt && (
                <p className="text-xs text-gray-600 mt-0.5">
                  Concluído em {new Date(step.completedAt).toLocaleDateString("pt-BR")}
                </p>
              )}
              {step.notes && (
                <p className="text-xs text-gray-500 mt-0.5 italic">{step.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
