const TRUTHY_VALUES = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "ativo",
  "ativa",
  "active",
  "true",
  "verdadeiro",
  "v",
  "1",
]);

const FALSY_VALUES = new Set([
  "não",
  "nao",
  "n",
  "no",
  "inativo",
  "inativa",
  "inactive",
  "false",
  "falso",
  "f",
  "0",
]);

export type BooleanFieldResult = {
  value: boolean;
  recognized: boolean;
};

export function parseBooleanField(
  raw: unknown,
  defaultValue: boolean,
): BooleanFieldResult {
  if (raw === undefined || raw === null || raw === "") {
    return { value: defaultValue, recognized: true };
  }
  if (typeof raw === "boolean") {
    return { value: raw, recognized: true };
  }
  if (typeof raw === "number") {
    return { value: raw !== 0, recognized: true };
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") {
    return { value: defaultValue, recognized: true };
  }
  if (TRUTHY_VALUES.has(normalized)) {
    return { value: true, recognized: true };
  }
  if (FALSY_VALUES.has(normalized)) {
    return { value: false, recognized: true };
  }
  return { value: defaultValue, recognized: false };
}
