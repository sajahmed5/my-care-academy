import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { documentsInForce, type DocumentInForce, type SigningDocKey } from "@/lib/signing-documents";

/**
 * Documents signed online (RECRUITMENT.md, release 6): the company's wording
 * in force, and the email telling a candidate their documents are ready.
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function wordingInForce(admin: Admin, orgId: string): Promise<Record<SigningDocKey, DocumentInForce>> {
  const { data } = await admin.from("recruitment_documents").select("doc_key, part_id, version, body").eq("organisation_id", orgId);
  return documentsInForce((data ?? []).map((r) => ({ docKey: r.doc_key as string, partId: r.part_id as string, version: r.version as number, body: r.body as string })));
}

/** The status of each document a candidate has been sent. */
export async function signingsFor(admin: Admin, candidateId: string) {
  const { data } = await admin
    .from("candidate_signings")
    .select("doc_key, status, snapshot, state, company, sent_at, signed_at, countersigned_at")
    .eq("candidate_id", candidateId);
  return data ?? [];
}

export async function emailDocumentsReady(admin: Admin, candidateId: string, titles: string[]): Promise<boolean> {
  const { data: c } = await admin.from("candidates").select("full_name, email, organisation_id, organisations(name)").eq("id", candidateId).maybeSingle();
  if (!c?.email) return false;
  const company = (c.organisations as unknown as { name: string } | null)?.name ?? "the company";
  const url = `${await siteOrigin()}/my-application`;
  return sendEmail({
    to: c.email as string,
    organisationId: c.organisation_id as string,
    subject: `${company}: your documents to sign`,
    html: emailLayout({
      heading: "Your documents are ready to sign",
      body: `<p>Hello ${esc(String(c.full_name ?? "").split(" ")[0] || "there")},</p>
        <p>${esc(company)} has sent you ${titles.length === 1 ? "a document" : "your documents"} to read and sign:
        ${titles.map(esc).join(", ")}. Sign in to your application, read each one, and sign with your finger or mouse.</p>
        ${emailButton(url, "Read and sign")}`,
      footer: `Sent for ${esc(company)} by My Care Academy.`,
    }),
  });
}
