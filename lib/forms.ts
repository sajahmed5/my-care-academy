export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "signature";

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

// ---------------------------------------------------------------------------
// Pre-made templates (cloned into a new form)
// ---------------------------------------------------------------------------
export interface TemplateField {
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  conditionalOn?: { label: string; equals: string };
}

export interface FormTemplate {
  key: string;
  title: string;
  description: string;
  fields: TemplateField[];
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: "application",
    title: "Job application form",
    description: "Collect applicant details and right-to-work.",
    fields: [
      { label: "Full name", type: "text", required: true },
      { label: "Email", type: "text", required: true },
      { label: "Phone", type: "text" },
      { label: "Role applied for", type: "text", required: true },
      { label: "Do you have the right to work in the UK?", type: "radio", options: ["Yes", "No"], required: true },
      {
        label: "Share code",
        type: "text",
        conditionalOn: { label: "Do you have the right to work in the UK?", equals: "Yes" },
      },
      { label: "Do you drive?", type: "radio", options: ["Yes", "No"] },
      { label: "CV upload", type: "file" },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    key: "care_assessment",
    title: "Care assessment",
    description: "Initial needs assessment for a person receiving care.",
    fields: [
      { label: "Client name", type: "text", required: true },
      { label: "Date of assessment", type: "date", required: true },
      { label: "Mobility needs", type: "checkbox", options: ["Walking aid", "Wheelchair", "Hoist", "None"] },
      { label: "Does the client take medication?", type: "radio", options: ["Yes", "No"], required: true },
      {
        label: "Medication details",
        type: "textarea",
        conditionalOn: { label: "Does the client take medication?", equals: "Yes" },
      },
      { label: "Dietary requirements", type: "textarea" },
      { label: "Assessor signature", type: "signature", required: true },
    ],
  },
  {
    key: "client_qa",
    title: "Client quality assurance",
    description: "Satisfaction and quality check for a client.",
    fields: [
      { label: "Client name", type: "text", required: true },
      { label: "Overall satisfaction", type: "radio", options: ["Very satisfied", "Satisfied", "Unsatisfied"], required: true },
      {
        label: "What could we improve?",
        type: "textarea",
        conditionalOn: { label: "Overall satisfaction", equals: "Unsatisfied" },
      },
      { label: "Are carers on time?", type: "radio", options: ["Always", "Usually", "Rarely"] },
      { label: "Additional comments", type: "textarea" },
    ],
  },
];
