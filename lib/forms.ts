export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "signature"
  /** Not a question: a section title, to break a long form into parts. */
  | "heading";

export interface Conditional {
  /** Show this field only when another field's value matches. */
  whenFieldId: string;
  equals: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  conditional: Conditional | null;
  sort_order: number;
  /** Guidance shown under the question, or under a heading. */
  hint?: string;
  /** A number's safe range, where it has one (a fridge at 1–5°C); outside it is flagged. */
  min?: number;
  max?: number;
}

export const FIELD_TYPES: {
  value: FieldType;
  label: string;
  hasOptions: boolean;
}[] = [
  { value: "text", label: "Short text", hasOptions: false },
  { value: "textarea", label: "Long text", hasOptions: false },
  { value: "number", label: "Number", hasOptions: false },
  { value: "date", label: "Date", hasOptions: false },
  { value: "select", label: "Dropdown", hasOptions: true },
  { value: "radio", label: "Single choice", hasOptions: true },
  { value: "checkbox", label: "Multiple choice", hasOptions: true },
  { value: "file", label: "File upload", hasOptions: false },
  { value: "signature", label: "Signature", hasOptions: false },
  { value: "heading", label: "Section heading", hasOptions: false },
];

export function fieldHasOptions(type: FieldType): boolean {
  return FIELD_TYPES.find((t) => t.value === type)?.hasOptions ?? false;
}

/**
 * Whether a field should be visible given the current answers.
 * Pure — the fill UI and any server-side validation both use this.
 */
export function isFieldVisible(
  field: Pick<FormField, "conditional">,
  values: Record<string, unknown>,
): boolean {
  const c = field.conditional;
  if (!c || !c.whenFieldId) return true;
  const actual = values[c.whenFieldId];
  if (Array.isArray(actual)) return actual.map(String).includes(c.equals);
  return String(actual ?? "") === c.equals;
}

/**
 * A list of fields as sent by an editor, made safe to keep: only labelled
 * fields, known types, options as strings, a conditional only when it names
 * a field, a range only on a number, and the order they were given. A field
 * without an id gets one, so answers can be keyed to it.
 */
export function cleanFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const validTypes = new Set(FIELD_TYPES.map((t) => t.value));
  const list = (raw as Partial<FormField>[]).filter((f) => f && typeof f.label === "string" && f.label.trim()).slice(0, 500);
  return list.map((f, i) => {
    const type = validTypes.has(f.type as FieldType) ? (f.type as FieldType) : "text";
    return {
      id: typeof f.id === "string" && f.id ? f.id.slice(0, 64) : crypto.randomUUID(),
      label: (f.label as string).trim().slice(0, 500),
      type,
      options: fieldHasOptions(type) && Array.isArray(f.options) ? f.options.map(String).map((o) => o.trim()).filter(Boolean).slice(0, 100) : [],
      required: type === "heading" ? false : !!f.required,
      ...(typeof f.hint === "string" && f.hint.trim() ? { hint: f.hint.trim().slice(0, 600) } : {}),
      conditional:
        f.conditional && typeof f.conditional.whenFieldId === "string" && f.conditional.whenFieldId
          ? { whenFieldId: f.conditional.whenFieldId, equals: String(f.conditional.equals ?? "") }
          : null,
      sort_order: i,
      ...(type === "number" && typeof f.min === "number" && Number.isFinite(f.min) ? { min: f.min } : {}),
      ...(type === "number" && typeof f.max === "number" && Number.isFinite(f.max) ? { max: f.max } : {}),
    };
  });
}

/** Whether a number answer falls outside the field's safe range. */
export function isOutOfRange(field: Pick<FormField, "type" | "min" | "max">, value: unknown): boolean {
  if (field.type !== "number" || value === undefined || value === null || value === "") return false;
  const n = Number(value);
  if (Number.isNaN(n)) return false;
  return (typeof field.min === "number" && n < field.min) || (typeof field.max === "number" && n > field.max);
}

/** "1–5", "up to 43", "-18 or below" — the range as a reader would say it. */
export function rangeLabel(field: Pick<FormField, "min" | "max">): string | null {
  const { min, max } = field;
  if (typeof min === "number" && typeof max === "number") return `${min} to ${max}`;
  if (typeof max === "number") return `${max} or below`;
  if (typeof min === "number") return `${min} or above`;
  return null;
}
