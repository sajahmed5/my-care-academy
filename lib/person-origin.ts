/**
 * Who added a company's manager or office worker, and when (Saj, 19 Nov
 * 2026), read back from the audit trail for the platform's company page.
 *
 * Nothing on the users row says who made it, and the add-person entries
 * mostly name the email rather than the new account's id, so a person is
 * matched by email to the earliest entry that added them, and by id to the
 * latest role change. Pure, so it can be tested without a database.
 */

/** The audit entries that add someone to a company or change their role. */
export const ORIGIN_ACTIONS = [
  "organisation.signed_up",
  "organisation.invited",
  "org.admin_invited",
  "user.invited",
  "org.user_role_changed",
] as const;

export interface OriginAuditRow {
  action: string;
  created_at: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  detail: Record<string, unknown> | null;
}

export interface OriginActor {
  name: string | null;
  role: string | null;
}

export interface OriginEvent {
  at: string;
  /** "My Care Academy (Jo Smith)", "Gavin Chilcott", "themselves on the website". */
  by: string;
}

export interface PersonOrigin {
  /** When they were added and by whom; null when no entry was found. */
  added: OriginEvent | null;
  /** Their latest move between learner, office and manager, if any. */
  roleChange: (OriginEvent & { from: string; to: string }) | null;
}

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** The emails an entry added, lower-cased. */
function emailsAdded(row: OriginAuditRow): string[] {
  const d = row.detail ?? {};
  switch (row.action) {
    case "organisation.signed_up":
      return [lower((d.manager as Record<string, unknown> | undefined)?.email)];
    case "organisation.invited":
      return Array.isArray(d.people)
        ? (d.people as Record<string, unknown>[]).filter((p) => p.ok !== false).map((p) => lower(p.email))
        : [];
    case "org.admin_invited":
    case "user.invited":
      return [lower(d.email)];
    default:
      return [];
  }
}

function describeActor(row: OriginAuditRow, actors: Map<string, OriginActor>): string {
  if (row.action === "organisation.signed_up" && !row.actor_id) return "themselves, on the free-trial page";
  const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
  const name = actor?.name?.trim() || row.actor_email || null;
  if (actor?.role === "platform_admin") {
    return name && name !== "My Care Academy" ? `My Care Academy (${name})` : "My Care Academy";
  }
  return name ?? "someone no longer on the platform";
}

export function personOrigins(
  people: { id: string; email: string | null }[],
  rows: OriginAuditRow[],
  actors: Map<string, OriginActor>,
): Map<string, PersonOrigin> {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out = new Map<string, PersonOrigin>();
  for (const p of people) {
    const email = lower(p.email);
    const add = email ? sorted.find((r) => emailsAdded(r).includes(email)) : undefined;
    const role = [...sorted].reverse().find((r) => r.action === "org.user_role_changed" && r.entity_id === p.id);
    out.set(p.id, {
      added: add ? { at: add.created_at, by: describeActor(add, actors) } : null,
      roleChange: role
        ? {
            at: role.created_at,
            by: describeActor(role, actors),
            from: String(role.detail?.from ?? ""),
            to: String(role.detail?.to ?? ""),
          }
        : null,
    });
  }
  return out;
}
