// src/lib/admin-actions/registry.ts
//
// Registro central dos blueprints de ação do admin. Indexado por blueprint.id.
import type { AdminActionBlueprint } from "./types";
import * as client from "./blueprints/client";

const all: AdminActionBlueprint[] = Object.values(client) as AdminActionBlueprint[];

export const actionRegistry: Record<string, AdminActionBlueprint> =
  Object.fromEntries(all.map((bp) => [bp.id, bp]));

export function getBlueprint(id: string): AdminActionBlueprint | undefined {
  return actionRegistry[id];
}
