import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, newToken } from "@/lib/candidate-links";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail, sendEmailBatch } from "@/lib/email";
import { emailButton, emailLayout, emailLinkFallback, esc } from "@/lib/email-layout";
import { chunk } from "@/lib/engine-digest";
import { MAX_REMINDERS, REFERENCE_LINK_DAYS, REMINDER_AFTER_DAYS, refereeRowsFromApplication, reminderDue } from "@/lib/recruitment-references";
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

/** A reference row as read for its email. */
const REQUEST_COLUMNS = "id, email, referee_name, reminder_count, organisation_id, candidates(full_name), organisations(name)";

interface RequestRow {
  id: unknown;
  email: unknown;
  referee_name: unknown;
  reminder_count: unknown;
  organisation_id: unknown;
  candidates: unknown;
  organisations: unknown;
}

/**
 * A fresh link for this referee: its hash is stored, so any older link stops
 * working. Null if the row couldn't be updated — then the new link wouldn't
 * work either, so nothing is sent.
 */
async function freshLink(admin: Admin, r: RequestRow, by: string | null, reminder: boolean, now: Date): Promise<string | null> {
  const raw = newToken();
  const { error } = await admin
    .from("candidate_references")
    .update({
      token_hash: hashToken(raw),
      token_expires_at: new Date(now.getTime() + REFERENCE_LINK_DAYS * 86_400_000).toISOString(),
      status: "requested",
      ...(reminder
        ? { reminder_count: ((r.reminder_count as number) ?? 0) + 1, last_reminded_at: now.toISOString() }
        : { requested_at: now.toISOString(), requested_by: by, reminder_count: 0, last_reminded_at: null }),
    })
    .eq("id", r.id as string);
  return error ? null : raw;
}

/** The email asking a referee for their reference, sent as the company. */
function requestEmail(r: RequestRow, raw: string, origin: string, reminder: boolean): { to: string; subject: string; html: string; organisationId: string } {
  const candidate = (r.candidates as { full_name: string } | null)?.full_name ?? "a candidate";
  const company = (r.organisations as { name: string } | null)?.name ?? "a care company";
  const link = `${origin}/reference?t=${raw}`;
  return {
    to: r.email as string,
    organisationId: r.organisation_id as string,
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
  };
}

/** Email a referee their link: the first request, or a reminder. */
export async function sendReferenceRequest(admin: Admin, referenceId: string, by: string | null, reminder: boolean): Promise<boolean> {
  const { data: r } = await admin.from("candidate_references").select(REQUEST_COLUMNS).eq("id", referenceId).maybeSingle();
  if (!r?.email) return false;
  const raw = await freshLink(admin, r, by, reminder, new Date());
  if (!raw) return false;
  return sendEmail(requestEmail(r, raw, await siteOrigin(), reminder));
}

/** At most this many reminders a day; the rest are next in line tomorrow. */
const CHASE_MAX = 500;

/** Links made at once while chasing. */
const LINKS_AT_ONCE = 20;

/**
 * The daily chase: every request due a reminder, sent once each, in one
 * batch. The query asks only for what could be due, longest-waiting first, so
 * a backlog over the cap is worked through in order rather than starving
 * whoever falls past it.
 */
export async function chaseReferences(admin: Admin, now: Date, dryRun: boolean): Promise<{ due: number; sent: number }> {
  const quietSince = new Date(now.getTime() - REMINDER_AFTER_DAYS * 86_400_000).toISOString();
  // Quiet for long enough (since the last reminder, or the request), and the link still live.
  const quiet = `or(last_reminded_at.lte.${quietSince},and(last_reminded_at.is.null,requested_at.lte.${quietSince}))`;
  const live = `or(token_expires_at.is.null,token_expires_at.gt.${now.toISOString()})`;
  const { data, error } = await admin
    .from("candidate_references")
    .select("id, email, referee_name, reminder_count, organisation_id, organisations(name), status, requested_at, last_reminded_at, token_expires_at, candidates(full_name, status)")
    .eq("status", "requested")
    .lt("reminder_count", MAX_REMINDERS)
    .or(`and(${quiet},${live})`)
    .order("last_reminded_at", { ascending: true, nullsFirst: true })
    .order("requested_at", { ascending: true })
    .order("id")
    .limit(CHASE_MAX);
  if (error) console.error("reference chase read failed:", error.message);
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
  if (dryRun) return { due: due.length, sent: 0 };
  const origin = await siteOrigin();
  const messages: ReturnType<typeof requestEmail>[] = [];
  for (const part of chunk(due.filter((r) => r.email), LINKS_AT_ONCE)) {
    const links = await Promise.all(part.map((r) => freshLink(admin, r, null, true, now)));
    part.forEach((r, i) => {
      const raw = links[i];
      if (raw) messages.push(requestEmail(r, raw, origin, true));
    });
  }
  const results = messages.length ? await sendEmailBatch(messages) : [];
  return { due: due.length, sent: results.filter(Boolean).length };
}
