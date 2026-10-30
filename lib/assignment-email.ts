/**
 * Telling someone they have been given something to do (#66, #72).
 *
 * Assigning a form or training, or making someone the owner of a complaint
 * action, used to happen silently: it showed in their list, if they had one and looked. Now
 * each person gets one short email, logged in email_log like every other send.
 *
 * Who is skipped, and why:
 *   - the person doing the assigning — they know;
 *   - anyone not active, or with no email;
 *   - anyone who has never signed in. They cannot follow the link yet, and
 *     their invitation (or the manager's Remind, which sends a set-password
 *     link) is the email that helps them. A task email first is noise.
 *
 * Callers run this inside after(), so the manager's click is not held up by
 * the mail provider, and a failed send never undoes the assignment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailBatch } from "./email";
import { emailButton, emailLayout, esc } from "./email-layout";
import { formatDate } from "./dates";

export type AssignmentKind = "form_assigned" | "action_assigned" | "training_assigned";

export interface AssignmentNotice {
  userId: string;
  /** What they are to do: the form's title, or the action as written. */
  title: string;
  dueDate: string | null;
  /** Where to do it, as a path; null when there is no page for them to open. */
  href: string | null;
  /** The manager's note or the action's detail, if any. */
  note?: string | null;
}

export interface Recipient {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  last_seen_at: string | null;
}

/** Whether this person should be emailed about something assigned to them. */
export function shouldNotify(r: Recipient, assignedBy: string): boolean {
  return r.id !== assignedBy && r.status === "active" && !!r.email && !!r.last_seen_at;
}

/** The subject and body for one notice. Pure, so it can be tested. */
export function assignmentEmail(
  kind: AssignmentKind,
  notice: AssignmentNotice,
  ctx: { name: string | null; assignedByName: string; orgName: string; origin: string },
): { subject: string; html: string } {
  const what = kind === "form_assigned" ? "a form to complete" : kind === "training_assigned" ? "training to complete" : "an action";
  const subject =
    kind === "form_assigned"
      ? `Form to complete: ${notice.title}`
      : kind === "training_assigned"
        ? `Training to complete: ${notice.title}`
        : `Action assigned to you: ${notice.title}`;
  const due = notice.dueDate
    ? `<p>Please have it done by <strong>${formatDate(notice.dueDate, { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
    : "";
  const note = notice.note ? `<p style="color:#444">${esc(notice.note)}</p>` : "";
  const link = notice.href
    ? emailButton(`${ctx.origin}${notice.href}`, "Open it")
    : `<p>Speak to ${esc(ctx.assignedByName)} if you need more detail.</p>`;
  const html = emailLayout({
    body: `<p>Hi ${esc(ctx.name ?? "there")},</p>
<p>${esc(ctx.assignedByName)} at ${esc(ctx.orgName)} has given you ${what} on My Care Academy:</p>
<p style="font-size:17px"><strong>${esc(notice.title)}</strong></p>
${note}${due}${link}`,
    footer: `My Care Academy — sent for ${esc(ctx.orgName)}.`,
  });
  return { subject, html };
}

/**
 * Email each notice's person, skipping as above, and log every send. Returns
 * how many went. Never throws: an assignment stands whether or not the mail
 * did.
 */
export async function emailAssignees(
  admin: SupabaseClient,
  kind: AssignmentKind,
  notices: AssignmentNotice[],
  ctx: { organisationId: string; assignedBy: string; origin: string },
): Promise<number> {
  try {
    if (notices.length === 0) return 0;
    // A hundred ids at a time: they travel in the URL, and "everyone" in a
    // large organisation is past what one request can carry.
    const ids = [...new Set(notices.map((n) => n.userId))];
    const [people, { data: org }, { data: by }] = await Promise.all([
      Promise.all(
        Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
          admin
            .from("users")
            .select("id, full_name, email, status, last_seen_at")
            .eq("organisation_id", ctx.organisationId)
            .in("id", ids.slice(i * 100, i * 100 + 100)),
        ),
      ).then((pages) => pages.flatMap((p) => (p.data ?? []) as Recipient[])),
      admin.from("organisations").select("name").eq("id", ctx.organisationId).maybeSingle(),
      admin.from("users").select("full_name, email").eq("id", ctx.assignedBy).maybeSingle(),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const assignedByName = (by?.full_name as string | null) || (by?.email as string | null) || "Your manager";
    const orgName = (org?.name as string | null) ?? "your organisation";

    const outgoing = notices.flatMap((n) => {
      const r = byId.get(n.userId);
      if (!r || !shouldNotify(r, ctx.assignedBy)) return [];
      const { subject, html } = assignmentEmail(kind, n, { name: r.full_name, assignedByName, orgName, origin: ctx.origin });
      return [{ to: r.email!, subject, html, organisationId: ctx.organisationId }];
    });
    if (outgoing.length === 0) return 0;

    const sent = await sendEmailBatch(outgoing);
    await admin.from("email_log").insert(
      outgoing.map((m, i) => ({
        organisation_id: ctx.organisationId,
        to_email: m.to,
        type: kind,
        subject: m.subject,
        sent: sent[i],
      })),
    );
    return sent.filter(Boolean).length;
  } catch (err) {
    console.error("Assignment email failed:", err);
    return 0;
  }
}
