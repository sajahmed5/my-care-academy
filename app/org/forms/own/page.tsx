import { redirect } from "next/navigation";

/**
 * The old builder's list. A company's own forms are built under Settings →
 * Forms now (FORMS.md, "Editable"), and the old builder's forms were carried
 * across there (migration 20261031120400).
 */
export default function OldOwnFormsPage() {
  redirect("/org/settings/forms");
}
