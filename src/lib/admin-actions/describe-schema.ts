// src/lib/admin-actions/describe-schema.ts
//
// Serializa um blueprint para o client: o z.ZodType NÃO atravessa a fronteira
// server→client, então derivamos uma descrição plana dos campos do schema
// (introspecção do Zod 4) que a UI usa para gerar inputs. `companyId` é oculto —
// a UI sempre injeta a partir do contexto, não é um input visível.
import { z } from "zod";
import type { AdminActionBlueprint, RiskLevel } from "./types";
import type { AdminRole } from "@prisma/client";

export type FieldType = "string" | "number" | "enum";

export interface FieldDescriptor {
  name: string;
  type: FieldType;
  options?: string[]; // só para enum
}

export interface BlueprintDescriptor {
  id: string;
  label: string;
  description: string;
  category: "client" | "system";
  icon: string;
  riskLevel: RiskLevel;
  confirm?: { requireReason: boolean; typeToConfirm?: "companyName" };
  allowedRoles: AdminRole[];
  fields: FieldDescriptor[];
}

const HIDDEN_FIELDS = new Set(["companyId"]);

/** Mapeia o `def.type` do Zod 4 para o tipo de campo da UI. */
function fieldTypeOf(zType: z.ZodType): FieldType | null {
  const t = (zType as { def?: { type?: string } }).def?.type;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "enum") return "enum";
  // unwrap opcionais/default/nullable expondo o inner
  const inner = (zType as { def?: { innerType?: z.ZodType } }).def?.innerType;
  if (inner) return fieldTypeOf(inner);
  return null;
}

/** Extrai as opções de um z.enum (Zod 4: def.entries é um Record valor→valor). */
function enumOptions(zType: z.ZodType): string[] {
  const entries = (zType as { def?: { entries?: Record<string, string> } }).def?.entries;
  return entries ? Object.values(entries) : [];
}

/**
 * Descreve os campos VISÍVEIS de um schema de objeto Zod (oculta companyId).
 * Schemas não-objeto retornam lista vazia (defensivo).
 */
export function describeFields(schema: z.ZodType): FieldDescriptor[] {
  const shape = (schema as { def?: { shape?: Record<string, z.ZodType> } }).def?.shape;
  if (!shape) return [];

  const fields: FieldDescriptor[] = [];
  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (HIDDEN_FIELDS.has(name)) continue;
    const type = fieldTypeOf(fieldSchema);
    if (!type) continue;
    if (type === "enum") {
      fields.push({ name, type, options: enumOptions(fieldSchema) });
    } else {
      fields.push({ name, type });
    }
  }
  return fields;
}

/** Projeta um blueprint nos campos seguros + descrição de campos (sem execute/schema). */
export function describeBlueprint(bp: AdminActionBlueprint): BlueprintDescriptor {
  return {
    id: bp.id,
    label: bp.label,
    description: bp.description,
    category: bp.category,
    icon: bp.icon,
    riskLevel: bp.riskLevel,
    ...(bp.confirm ? { confirm: bp.confirm } : {}),
    allowedRoles: bp.allowedRoles,
    fields: describeFields(bp.schema),
  };
}
