import Link from "next/link";
import { requireConsole, roleLabel } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import {
  bucketOf,
  isActiveLearner,
  isNeverActive,
  loadOrgLearners,
} from "@/lib/org-learners";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteStaffForm } from "../../invite-staff-form";
import { CsvImport } from "../../csv-import";
import { CsvExport } from "../../csv-export";
import { StatusToggle } from "../../status-toggle";
import { DeleteStaffButton } from "../../delete-staff-button";
import { NUDGE_TYPES, type NudgeGroup } from "../../nudge-types";
import { RemindersTable, type ReminderRow } from "../reminders-table";
import {
  LearnerReminderPicker,
  type ReminderTarget,
} from "../learner-reminder-picker";
import { formatDate } from "@/lib/dates";

/** "Today" / "3 days ago" / a date — when they last used the account. */
function signedInLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Admin: add, deactivate and remove staff (learners and admin users alike),
 * plus the reminder history and bulk-remind (design doc v2).
 */
/** Three jobs that were one scroll: the staff list, reminders, and inviting. */
const SECTIONS = [
  { key: "staff", label: "Staff" },
  { key: "reminders", label: "Reminders" },
  { key: "invite", label: "Invite" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

export default async function LearnersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const context = await requireConsole();
  const { section: sectionParam } = await searchParams;
  // The staff table, the reminder picker, the reminder log, the invite form
  // and the CSV import sat on one page; on a 260-person organisation the
  // invite form was below everything (Saj, 24 Oct 2026).
  const section: Section = SECTIONS.some((x) => x.key === sectionParam)
    ? (sectionParam as Section)
    : "staff";
  const orgId = context.organisationId;
  // Only a manager may deactivate or delete a manager or office worker — the
  // rule consoleTargetBlock enforces. An office worker was offered the
  // buttons on those rows and every press was refused.
  const canChange = (role: string) =>
    role === "learner" || context.role === "org_admin";
  const supabase = await createClient();
  // Each tab reads only what it shows. The reminder picker needs every
  // learner's full training rollup (all enrolments and certificates) and the
  // email log; the Staff and Invite tabs used to pay for both on every visit.
  // The staff list stays on every tab — its count is the tab badge.
  const onReminders = section === "reminders";
  const [{ data: organisation }, staff, { data: nudgeLog }, learnerRows] =
    await Promise.all([
      supabase.from("organisations").select("name").eq("id", orgId!).single(),
      // Paged: a large roll would pass Supabase's silent 1,000-row cap.
      fetchAll((f, t) =>
        supabase
          .from("users")
          .select("id, full_name, email, role, status, created_at, last_seen_at")
          .eq("organisation_id", orgId!)
          .order("created_at", { ascending: true })
          .order("id")
          .range(f, t),
      ),
      onReminders
        ? supabase
            .from("email_log")
            .select("id, to_email, subject, sent, created_at, type")
            .eq("organisation_id", orgId!)
            .in("type", NUDGE_TYPES)
            .order("created_at", { ascending: false })
            // Was 200, which silently hid 61 of HG Care's 261 (24 Oct 2026).
            .limit(1000)
        : Promise.resolve({ data: null }),
      onReminders ? loadOrgLearners(supabase, orgId) : Promise.resolve([]),
    ]);

  const active = learnerRows.filter(isActiveLearner);

  // Only people with something to chase. The reason is spelt out so the
  // manager can decide who to skip (issue #32).
  const targets: ReminderTarget[] = active
    .map((r) => {
      const note = isNeverActive(r)
        ? "Never signed in"
        : r.stats.overdue > 0
          ? `${r.stats.overdue} overdue`
          : bucketOf(r) === "not_started"
            ? `${r.stats.notStarted} not started`
            : bucketOf(r) === "in_progress"
              ? `${r.stats.inProgress} in progress`
              : "";
      // The same three tests nudgeGroupAction uses, so the list a manager
      // sees under a group is exactly who "Send to all" will email.
      const groups: NudgeGroup[] = [];
      if (bucketOf(r) === "overdue") groups.push("overdue");
      if (bucketOf(r) === "not_started") groups.push("not_started");
      if (isNeverActive(r)) groups.push("never_signed_in");
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        lastRemindedAt: r.lastRemindedAt,
        note,
        groups,
      };
    })
    .filter((t) => t.note !== "");

  const nameByEmail = new Map<string, string>();
  for (const u of staff ?? []) {
    if (u.email) nameByEmail.set(u.email.toLowerCase(), u.full_name || u.email);
  }
  const reminders: ReminderRow[] = (nudgeLog ?? []).map((l) => ({
    id: l.id,
    toEmail: l.to_email,
    learnerName: nameByEmail.get(l.to_email.toLowerCase()) ?? null,
    subject: l.subject,
    sent: l.sent,
    createdAt: l.created_at,
    type: l.type,
  }));

  const exportRows = (staff ?? []).map((u) => ({
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    status: u.status ?? "active",
  }));

  return (
    <div className="space-y-6">
      <nav aria-label="Sections" className="flex items-center gap-1 border-b">
        {SECTIONS.map((x) => (
          <Link
            key={x.key}
            href={`/org/learners/admin?section=${x.key}`}
            aria-current={x.key === section ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
              x.key === section
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {x.label}
            {x.key === "staff" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{staff?.length ?? 0}</span>
            )}
          </Link>
        ))}
      </nav>

      {section === "staff" && (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Staff</CardTitle>
            <CardDescription>
              {staff?.length ?? 0} member(s) — managers, office staff and learners.
            </CardDescription>
          </div>
          <CsvExport
            rows={exportRows}
            filename={`${organisation?.name ?? "staff"}-staff.csv`}
          />
        </CardHeader>
        <CardContent>
          {/* Desktop: table (boxed + scrollable so it doesn't swallow the page) */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Signed in</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(staff ?? []).map((u) => {
                  const status = u.status ?? "active";
                  const isSelf = u.id === context.userId;
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          href={`/org/staff/${u.id}`}
                          className="font-medium hover:underline"
                        >
                          {u.full_name || u.email}
                        </Link>{" "}
                        <span className="text-muted-foreground">{u.email}</span>
                      </td>
                      <td className="px-3 py-2">
                        {roleLabel(u.role)}
                      </td>
                      {/* Two separate facts, deliberately not one word. This
                          column said "active" meaning "not deactivated", while
                          Learners → Overview uses "Active learners" to mean
                          "has signed in" — so a carer who had never logged in
                          read as active here and inactive there (issue #39).
                          "Enabled" drops the clashing word; "Deactivated" is
                          kept because the toggle and every other page already
                          use it, and a third synonym would be the same bug. */}
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            status === "deactivated" ? "destructive" : "secondary"
                          }
                        >
                          {status === "deactivated" ? "Deactivated" : "Enabled"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {u.last_seen_at ? (
                          <span className="text-muted-foreground">
                            {signedInLabel(u.last_seen_at)}
                          </span>
                        ) : (
                          <span className="font-medium text-rose-600">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : !canChange(u.role) ? (
                          <span className="text-xs text-muted-foreground">Manager only</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <StatusToggle userId={u.id} status={status} name={u.full_name || u.email} />
                            <DeleteStaffButton
                              userId={u.id}
                              name={u.full_name || u.email}
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-2 md:hidden">
            {(staff ?? []).map((u) => {
              const status = u.status ?? "active";
              const isSelf = u.id === context.userId;
              return (
                <div key={u.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/org/staff/${u.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {u.full_name || u.email}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                    <Badge
                      variant={
                        status === "deactivated" ? "destructive" : "secondary"
                      }
                    >
                      {/* Same words as the desktop table — the mobile card was
                          printing the raw "active"/"deactivated" (issue #39). */}
                      {status === "deactivated" ? "Deactivated" : "Enabled"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {roleLabel(u.role)} ·{" "}
                      {u.last_seen_at ? (
                        <>signed in {signedInLabel(u.last_seen_at)}</>
                      ) : (
                        <span className="font-medium text-rose-600">never signed in</span>
                      )}
                    </span>
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : !canChange(u.role) ? (
                      <span className="text-xs text-muted-foreground">Manager only</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <StatusToggle userId={u.id} status={status} name={u.full_name || u.email} />
                        <DeleteStaffButton
                          userId={u.id}
                          name={u.full_name || u.email}
                        />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      )}

      {section === "reminders" && (
      <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Send a reminder</CardTitle>
            <CardDescription>
              Pick a group to see who&apos;s in it, then remind them one at a
              time or all together. Sends even to someone reminded recently.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LearnerReminderPicker learners={targets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders sent</CardTitle>
          <CardDescription>
            Everything that has gone out, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RemindersTable rows={reminders} />
        </CardContent>
      </Card>
      </>
      )}

      {section === "invite" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invite a staff member</CardTitle>
            <CardDescription>
              They&apos;ll get an email to join and set a password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteStaffForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk import</CardTitle>
            <CardDescription>Invite many staff at once from a spreadsheet (CSV file).</CardDescription>
          </CardHeader>
          <CardContent>
            <CsvImport />
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
