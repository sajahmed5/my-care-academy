/**
 * Turning the library's Word forms into fillable library forms (ROADMAP §1:
 * "turning the 63 Word forms into real fields").
 *
 * The forms were imported as text blocks: a heading per section, a short
 * paragraph per field label ("Full name", "Date of DBS certificate"),
 * bracketed guidance, and bullets for things to consider. That is regular
 * enough to convert:
 *
 *   a short label            a field, typed by its wording — signature, date,
 *                            yes/no, a long answer, or a line of text
 *   a label followed by ☐    a checklist row from a flattened table: one
 *   boxes                    question, Yes / No / N/A by the number of boxes;
 *                            the column headings and the boxes are dropped
 *   guidance or bullets      one long-answer box for the section, labelled
 *                            with the section heading, where no field already
 *                            covers it
 *   the opening sentences    the form's description
 *
 * It is a first draft, not a finished form: every converted form is saved as
 * a draft for a platform admin to read through and publish. Pure.
 */

import type { FieldType, FormField } from "./forms";

export interface SourceBlock {
  type: "heading" | "paragraph" | "bullet" | "guidance";
  text: string;
  level?: number;
}

export interface ConvertedForm {
  description: string | null;
  fields: FormField[];
}

const LONG = /\b(details?|description|describe|notes?|comments?|outcome|actions?|reasons?|summary|explain|plan|concerns?|findings?|observations?|feedback|evidence|response|what happened)\b/i;

/** What kind of field a label asks for, from its wording. */
export function fieldTypeFor(label: string): FieldType {
  if (/signature|signed\b/i.test(label)) return "signature";
  if (/\bdate\b|\bdob\b|date of birth/i.test(label)) return "date";
  if (/\byes\s*\/\s*no\b|\?\s*$/i.test(label)) return "radio";
  if (LONG.test(label)) return "textarea";
  return "text";
}

/** A paragraph that reads as a field label rather than instructions. */
function isLabel(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 90 && !t.startsWith("[") && !/[.!]$/.test(t) && !t.includes("{{");
}

const BOX = /^[☐□▢✓✔x×\s]+$/i;
/** A flattened table's column heading or a lone tick box — not a question. */
function isTableNoise(text: string): boolean {
  const t = text.trim();
  return BOX.test(t) || /^(yes|no|n\/?a|check|l|s|rating|score|tick|comments?)$/i.test(t);
}

export function convertWordForm(title: string, blocks: SourceBlock[]): ConvertedForm {
  const firstHeading = blocks.findIndex((b) => b.type === "heading");
  const intro = (firstHeading < 0 ? [] : blocks.slice(0, firstHeading))
    .filter((b) => b.type === "paragraph" && b.text.length > 40 && /[a-z]/.test(b.text) && !b.text.includes("{{"))
    .map((b) => b.text.trim());

  const fields: FormField[] = [];
  const used = new Set<string>();
  const add = (label: string, type: FieldType) => {
    let l = label.replace(/[:\s]+$/, "").trim();
    if (!l) return;
    let n = 2;
    while (used.has(l.toLowerCase())) l = `${label.replace(/[:\s]+$/, "").trim()} (${n++})`;
    used.add(l.toLowerCase());
    fields.push({
      id: `f${fields.length + 1}`,
      label: l,
      type,
      options: type === "radio" ? ["Yes", "No"] : [],
      required: false,
      conditional: null,
      sort_order: fields.length,
    });
  };

  // Walk the sections. A section with guidance or bullets but no long-answer
  // field gets one, so the guidance has somewhere to be answered.
  let heading = "";
  let sectionHasLong = false;
  let sectionNeedsLong = false;
  const closeSection = () => {
    if (sectionNeedsLong && !sectionHasLong) add(heading || "Details", "textarea");
    sectionHasLong = false;
    sectionNeedsLong = false;
  };
  const body = blocks.slice(firstHeading < 0 ? 0 : firstHeading);
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b.type === "heading") {
      closeSection();
      heading = b.text.trim();
      continue;
    }
    if (b.type === "paragraph" && isTableNoise(b.text)) continue;
    // A checklist row: its label, then a tick box per column.
    let boxes = 0;
    while (body[i + 1 + boxes]?.type === "paragraph" && BOX.test(body[i + 1 + boxes].text.trim())) boxes++;
    if (b.type === "paragraph" && boxes > 0 && isLabel(b.text)) {
      add(b.text, "radio");
      fields[fields.length - 1].options = boxes >= 3 ? ["Yes", "No", "N/A"] : ["Yes", "No"];
      i += boxes;
      continue;
    }
    if (b.type === "paragraph" && isLabel(b.text)) {
      const type = fieldTypeFor(b.text);
      add(b.text, type);
      if (type === "textarea") sectionHasLong = true;
      continue;
    }
    if (b.type === "guidance" || b.type === "bullet") sectionNeedsLong = true;
  }
  closeSection();

  if (fields.length === 0) add("Details", "textarea");
  return {
    description: intro.length ? intro.join(" ").slice(0, 600) : null,
    fields,
  };
}

/** Where a converted form files, from the library category it came from. */
export function formCategoryFor(category: string): string {
  if (/recruit/i.test(category)) return "recruitment";
  if (/complain|safeguard|quality|audit/i.test(category)) return "quality";
  if (/review|supervision|appraisal/i.test(category)) return "review";
  if (/\bhr\b|human|staff|employ/i.test(category)) return "hr";
  if (/care|assessment|medication|client/i.test(category)) return "care";
  return "other";
}
