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
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Onboarding</h2>
        <p className="text-sm text-muted-foreground">Checklist de onboarding não iniciado.</p>
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header com progress */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Onboarding</h2>
          <span className={`text-sm font-bold ${pct === 100 ? "text-emerald-600" : "text-foreground"}`}>
            {pct}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {completedRequired} de {totalRequired} etapas obrigatórias concluídas
          {checklist.completedAt && (
            <span className="ml-2 text-emerald-600">
              · Concluído em {new Date(checklist.completedAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </p>
      </div>

      {/* Steps */}
      <div className="divide-y divide-border">
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
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              ) : step.isRequired ? (
                <Circle className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm ${step.isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {step.title}
                </p>
                {!step.isRequired && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">opcional</span>
                )}
              </div>
              {step.description && !step.isCompleted && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              )}
              {step.isCompleted && step.completedAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Concluído em {new Date(step.completedAt).toLocaleDateString("pt-BR")}
                </p>
              )}
              {step.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">{step.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
