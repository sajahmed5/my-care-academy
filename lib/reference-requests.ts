import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, newToken } from "@/lib/candidate-links";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, emailLinkFallback, esc } from "@/lib/email-layout";
import { REFERENCE_LINK_DAYS, refereeRowsFromApplication, reminderDue } from "@/lib/recruitment-references";
import type { Entry } from "@/lib/recruitment-application";

/**
 * Asking referees, and chasing them (RECRUITMENT.md, release 4). Each request
 * or reminder makes a fresh link — only its hash is stored, so the old one
 * stops working — and emails it from the company, by name.
 */

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The referees the candidate named on their application, copied once into
 * candidate_references. If the office has entered any already, theirs stand.
 */
export async function importReferees(admin: Admin, candidateId: string, orgId: string): Promise<void> {
  const { count } = await admin.from("candidate_references").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId);
  if ((count ?? 0) > 0) return;
  const { data: app } = await admin.from("candidate_applications").select("answers, status").eq("candidate_id", candidateId).maybeSingle();
  const referees = app?.status === "submitted" && Array.isArray((app.answers as Record<string, unknown>)?.referees)
    ? ((app.answers as Record<string, unknown>).referees as Entry[])
    : [];
  if (!referees.length) return;
  await admin.from("candidate_references").insert(
    refereeRowsFromApplication(referees).map((r) => ({ ...r, candidate_id: candidateId, organisation_id: orgId })),
  );
}

/** Email a referee their link: the first request, or a reminder. */
export async function sendReferenceRequest(admin: Admin, referenceId: string, by: string | null, reminder: boolean): Promise<boolean> {
  const { data: r } = await admin
    .from("candidate_references")
    .select("id, email, referee_name, reminder_count, candidates(full_name), organisations(name)")
    .eq("id", referenceId)
    .maybeSingle();
  if (!r?.email) return false;
  const raw = newToken();
  const now = new Date();
  await admin
    .from("candidate_references")
    .update({
      token_hash: hashToken(raw),
      token_expires_at: new Date(now.getTime() + REFERENCE_LINK_DAYS * 86_400_000).toISOString(),
      status: "requested",
      ...(reminder
        ? { reminder_count: ((r.reminder_count as number) ?? 0) + 1, last_reminded_at: now.toISOString() }
        : { requested_at: now.toISOString(), requested_by: by, reminder_count: 0, last_reminded_at: null }),
    })
    .eq("id", referenceId);

  const candidate = (r.candidates as unknown as { full_name: string } | null)?.full_name ?? "a candidate";
  const company = (r.organisations as unknown as { name: string } | null)?.name ?? "a care company";
  const link = `${await siteOrigin()}/reference?t=${raw}`;
  return sendEmail({
    to: r.email as string,
    subject: `${reminder ? "Reminder: r" : "R"}eference for ${candidate}`,
    html: emailLayout({
      heading: `A reference for ${candidate}`,
      body: `<p>Dear ${esc(String(r.referee_name ?? "referee"))},</p>
        <p>${esc(candidate)} has applied to work as a carer with ${esc(company)} and has given your name as a referee.
        ${reminder ? "We haven't had your reference yet, and it's holding up their start." : ""}</p>
        <p>The form takes about five minutes. Their name and details are filled in for you.</p>
        ${emailButton(link, "Give a reference")}
        ${emailLinkFallback(link)}
        <p>Thank you for your help. Carers work alone with people who may be vulnerable, so your honest answers matter.</p>`,
      footer: `Sent for ${esc(company)} by My Care Academy.`,
    }),
  });
}

/** The daily chase: every request due a reminder, sent once each. */
export async function chaseReferences(admin: Admin, now: Date, dryRun: boolean): Promise<{ due: number; sent: number }> {
  const { data } = await admin
    .from("candidate_references")
    .select("id, status, requested_at, last_reminded_at, reminder_count, token_expires_at, candidates(status)")
    .eq("status", "requested")
    .limit(500);
  const due = (data ?? []).filter(
    (r) =>
      (r.candidates as unknown as { status: string } | null)?.status !== "rejected" &&
      reminderDue(
        {
          status: r.status as string,
          requested_at: r.requested_at as string | null,
          last_reminded_at: r.last_reminded_at as string | null,
          reminder_count: (r.reminder_count as number) ?? 0,
          token_expires_at: r.token_expires_at as string | null,
        },
        now.getTime(),
      ),
  );
  let sent = 0;
  if (!dryRun) for (const r of due) if (await sendReferenceRequest(admin, r.id as string, null, true)) sent++;
  return { due: due.length, sent };
}
