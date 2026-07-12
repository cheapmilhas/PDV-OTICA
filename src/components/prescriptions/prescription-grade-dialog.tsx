"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PrescriptionGradeForm,
  type PrescriptionGradeValue,
} from "./prescription-grade-form";
import { validateGrade } from "@/lib/prescription-grade-validation";
import toast from "react-hot-toast";

/**
 * Modal de digitar/editar o grau de uma receita do Livro (cenário exame puro,
 * sem OS). Reusa PrescriptionGradeForm + bloco paciente/dependente. Salva via
 * PATCH /api/prescriptions/[id]/grau (writer único). Usado pela tela do Livro
 * e pela ficha do cliente.
 */

interface Props {
  prescriptionId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const emptyGrade: PrescriptionGradeValue = { od: {}, oe: {}, adicao: "" };

export function PrescriptionGradeDialog({ prescriptionId, open, onClose, onSaved }: Props) {
  const [grade, setGrade] = useState<PrescriptionGradeValue>(emptyGrade);
  const [isDependente, setIsDependente] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Bloqueia o submit se a grade estiver fora da faixa (fonte única). Antes o
    // dialog salvava mesmo com erro (só pintava vermelho no form).
    const gradeCheck = validateGrade({ od: grade.od, oe: grade.oe, adicao: grade.adicao });
    if (!gradeCheck.ok) {
      toast.error(gradeCheck.errors[0]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/grau`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          od: grade.od,
          oe: grade.oe,
          adicao: grade.adicao,
          isDependente,
          patientName: isDependente ? patientName || null : null,
          patientBirthDate: isDependente && patientBirthDate ? patientBirthDate : null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast.success("Receita salva");
      onSaved();
    } catch {
      toast.error("Não foi possível salvar a receita");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Digitar grau da receita</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <PrescriptionGradeForm
            value={grade}
            onChange={(patch) =>
              setGrade((prev) => ({ ...prev, ...patch } as PrescriptionGradeValue))
            }
          />

          <div className="rounded-md border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                data-testid="is-dependente"
                type="checkbox"
                checked={isDependente}
                onChange={(e) => setIsDependente(e.target.checked)}
              />
              A receita é de um dependente (não o titular)
            </label>
            {isDependente && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  data-testid="patient-name"
                  placeholder="Nome do paciente"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
                <Input
                  data-testid="patient-birth"
                  type="date"
                  value={patientBirthDate}
                  onChange={(e) => setPatientBirthDate(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
