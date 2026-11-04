import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { ACCOUNT_EMAIL_LABELS, ACCOUNT_EMAIL_TYPES, type AccountEmailType } from "@/lib/email-record";

/**
 * The emails a company's people were sent, for the platform's Emails tab
 * (ACCOUNT-ACCESS.md). Read through the service role: the copies are only
 * readable that way. Callers must have checked the platform role.
 */

export type EmailShow = "account" | "other" | "all";

export interface OrgEmailRow {
  id: string;
  to: string;
  /** Their name and role, when the address belongs to someone in the company. */
  person: { name: string; role: string } | null;
  type: string;
  /** "Invitation"; for other emails, the stored type made readable. */
  kind: string;
  subject: string;
  sent: boolean;
  at: string;
  /** Account emails open in full. */
  hasCopy: boolean;
}

const OTHER_LABELS: Record<string, string> = {
  digest: "Digest",
  reminder: "Training reminder",
  renewal: "Renewal reminder",
  required_again: "Required again",
  engagement_alert: "Engagement alert",
};

export function emailKind(type: string): string {
  return (ACCOUNT_EMAIL_LABELS as Record<string, string>)[type] ?? OTHER_LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function isAccountEmail(type: string): type is AccountEmailType {
  return (ACCOUNT_EMAIL_TYPES as readonly string[]).includes(type);
}

export function roleName(role: string): string {
  return role === "org_admin" ? "Manager" : role === "org_office" ? "Office worker" : role === "candidate" ? "Candidate" : "Carer";
}

/** The newest emails first; at most `limit`. */
export async function loadOrgEmails(orgId: string, show: EmailShow, limit = 300): Promise<OrgEmailRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("email_log")
    .select("id, to_email, type, subject, sent, created_at")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (show === "account") query = query.in("type", ACCOUNT_EMAIL_TYPES as unknown as string[]);
  if (show === "other") query = query.not("type", "in", `(${ACCOUNT_EMAIL_TYPES.join(",")})`);
  const [{ data: rows, error }, people] = await Promise.all([
    query,
    fetchAll<{ email: string; full_name: string | null; role: string }>((from, to) =>
      admin.from("users").select("email, full_name, role").eq("organisation_id", orgId).order("id").range(from, to),
    ),
  ]);
  if (error) throw new Error(`Emails couldn't be read: ${error.message}`);
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  return (rows ?? []).map((r) => {
    const p = byEmail.get((r.to_email as string).toLowerCase());
    return {
      id: r.id as string,
      to: r.to_email as string,
      person: p ? { name: p.full_name || p.email, role: roleName(p.role) } : null,
      type: r.type as string,
      kind: emailKind(r.type as string),
      subject: r.subject as string,
      sent: !!r.sent,
      at: r.created_at as string,
      hasCopy: isAccountEmail(r.type as string),
    };
  });
}

export interface OrgEmail {
  id: string;
  to: string;
  type: string;
  kind: string;
  subject: string;
  sent: boolean;
  at: string;
  html: string | null;
  userId: string | null;
  person: { id: string; name: string; role: string; lastSeenAt: string | null; status: string | null } | null;
  sentByName: string | null;
}

/** One email of this company's, with its copy; null if it isn't theirs. */
export async function loadOrgEmail(orgId: string, emailId: string): Promise<OrgEmail | null> {
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("email_log")
    .select("id, to_email, type, subject, sent, created_at, html, user_id, sent_by, organisation_id")
    .eq("id", emailId)
    .maybeSingle();
  if (!r || r.organisation_id !== orgId) return null;
  const [{ data: person }, { data: sender }] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, role, last_seen_at, status, organisation_id")
      .ilike("email", r.to_email as string)
      .maybeSingle(),
    r.sent_by
      ? admin.from("users").select("full_name, email").eq("id", r.sent_by as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const inOrg = person && person.organisation_id === orgId ? person : null;
  return {
    id: r.id as string,
    to: r.to_email as string,
    type: r.type as string,
    kind: emailKind(r.type as string),
    subject: r.subject as string,
    sent: !!r.sent,
    at: r.created_at as string,
    html: (r.html as string | null) ?? null,
    userId: (r.user_id as string | null) ?? (inOrg?.id as string | undefined) ?? null,
    person: inOrg
      ? {
          id: inOrg.id as string,
          name: (inOrg.full_name as string | null) || (inOrg.email as string),
          role: roleName(inOrg.role as string),
          lastSeenAt: (inOrg.last_seen_at as string | null) ?? null,
          status: (inOrg.status as string | null) ?? null,
        }
      : null,
    sentByName: sender ? ((sender.full_name as string | null) || (sender.email as string)) : null,
  };
}
