import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { audienceOf } from "@/lib/form-library";
import type { ReviewRecord } from "@/lib/form-reviews";

const unwrap = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

/**
 * Every form record a review could fall due on, for one company (FORMS.md):
 * read by Who's due and the Overview's to-do list alike.
 */
export async function loadReviewRecords(supabase: SupabaseClient, orgId: string): Promise<ReviewRecord[]> {
  // Every record is read, not only dated ones: a newer record without a date
  // still replaces an older one that had a date.
  const rows = await fetchAll((f, t) =>
    supabase
      .from("form_responses")
      .select(
        "id, template_id, subject, client_id, user_id, submitted_at, review_due, template:form_templates (code, title), client:clients (full_name, status), person:users!form_responses_user_id_fkey (full_name, email, status)",
      )
      .eq("organisation_id", orgId)
      .order("id")
      .range(f, t),
  );
  return rows
    // An ended client or a member of staff who has left has nothing to review.
    .filter((r) => {
      const c = unwrap(r.client as { status?: string } | null);
      const u = unwrap(r.person as { status?: string } | null);
      if (r.subject === "client") return c?.status === "active";
      if (r.subject === "carer") return u?.status === "active";
      return true;
    })
    .map((r) => {
      const t = unwrap(r.template as { code?: string; title?: string } | null);
      const c = unwrap(r.client as { full_name?: string } | null);
      const u = unwrap(r.person as { full_name?: string | null; email?: string } | null);
      return {
        id: r.id as string,
        templateId: r.template_id as string,
        templateCode: t?.code ?? "",
        templateTitle: t?.title ?? "Form",
        subject: audienceOf(r.subject),
        clientId: (r.client_id as string | null) ?? null,
        clientName: c?.full_name ?? null,
        userId: r.user_id as string,
        userName: u?.full_name ?? u?.email ?? "Unnamed",
        submittedAt: r.submitted_at as string,
        reviewDue: (r.review_due as string | null) ?? null,
      };
    });
}
