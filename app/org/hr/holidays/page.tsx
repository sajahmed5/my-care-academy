import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { STAFF_ROLES } from "@/lib/roles";
import { addDays } from "@/lib/hr/probation";
import { BANK_HOLIDAYS, amountText, canApprove, clashes, holidaySettingsFromRow, leaveTypeLabel, leaveTypesFor, overlaps, type LeaveRequest } from "@/lib/hr/holidays";
import { DecideLeave, LeaveForm } from "./holiday-forms";

const fmt = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

/**
 * Holidays across the company (HR-PACK.md): requests waiting, with who else
 * is off on those days; who's off this week; a month's calendar; and leave
 * entered for someone. Managers and office approve carers' leave; only
 * managers approve office staff's; nobody approves their own.
 */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const today = new Date().toISOString().slice(0, 10);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = addDays(`${nextMonth(month)}-01`, -1);
  const weekEnd = addDays(today, 6);

  const [people, requests, { data: settingsRow }] = await Promise.all([
    fetchAll((f, t) =>
      supabase.from("users").select("id, full_name, email, role").eq("organisation_id", orgId).in("role", STAFF_ROLES).eq("status", "active").order("id").range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from("leave_requests")
        .select("id, user_id, leave_type, start_date, end_date, amount, unit, status, note, over_limit")
        .eq("organisation_id", orgId)
        .in("status", ["requested", "approved"])
        .gte("end_date", addDays(monthStart < today ? monthStart : today, -1))
        .order("id")
        .range(f, t),
    ),
    supabase.from("hr_settings").select("leave_year_start, bank_holidays_from_allowance, max_off_at_once, leave_types").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const s = holidaySettingsFromRow(settingsRow);
  const types = leaveTypesFor(s.own);
  const byId = new Map(people.map((p) => [p.id as string, { id: p.id as string, role: p.role as string, name: ((p.full_name as string | null) || (p.email as string)) ?? "Unnamed" }]));
  const name = (id: string) => byId.get(id)?.name ?? "Someone who has left";
  const all = requests as unknown as Array<LeaveRequest & { note: string | null; over_limit: boolean }>;
  const approved = all.filter((r) => r.status === "approved");
  const waiting = all.filter((r) => r.status === "requested").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const offToday = approved.filter((r) => overlaps(r, today, today));
  const offWeek = approved.filter((r) => overlaps(r, addDays(today, 1), weekEnd) && !offToday.includes(r));
  const sortedPeople = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

  const days: string[] = [];
  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) days.push(d);
  const lead = (new Date(`${monthStart}T12:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <DashboardShell title="Holidays" context={context}>
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Waiting for a decision ({waiting.length})</h3>
          {waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests waiting.</p>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {waiting.map((r) => {
                  const person = byId.get(r.user_id);
                  const c = clashes(r, approved);
                  const mine = person ? canApprove({ id: context.userId, role: context.role! }, person) : false;
                  return (
                    <div key={r.id} className="space-y-2 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <Link href={`/org/staff/${r.user_id}?section=employment&sub=holidays`} className="font-medium text-primary hover:underline">
                            {name(r.user_id)}
                          </Link>
                          <span className="ml-2 text-muted-foreground">
                            {leaveTypeLabel(r.leave_type, s.own)} · {fmt(r.start_date)}
                            {r.end_date !== r.start_date ? ` to ${fmt(r.end_date)}` : ""} · {amountText(r.amount, r.unit)}
                          </span>
                        </span>
                        {mine ? (
                          <DecideLeave id={r.id} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.user_id === context.userId ? "Your own: another manager decides" : "A manager decides"}</span>
                        )}
                      </div>
                      {r.note && <p className="text-muted-foreground">&ldquo;{r.note}&rdquo;</p>}
                      <p className={`text-xs ${s.maxOffAtOnce && c.busiest > s.maxOffAtOnce ? "font-medium text-amber-800" : "text-muted-foreground"}`}>
                        {c.others.length ? `Also off then: ${c.others.map(name).join(", ")}.` : "Nobody else is off then."}
                        {s.maxOffAtOnce ? ` Your limit is ${s.maxOffAtOnce} off at once.` : ""}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              <p className="font-semibold">Off today ({offToday.length})</p>
              {offToday.length === 0 ? (
                <p className="text-muted-foreground">Nobody.</p>
              ) : (
                <ul className="space-y-1">
                  {offToday.map((r) => (
                    <li key={r.id}>
                      {name(r.user_id)} <span className="text-muted-foreground">· back after {fmt(r.end_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              <p className="font-semibold">Off later this week ({offWeek.length})</p>
              {offWeek.length === 0 ? (
                <p className="text-muted-foreground">Nobody.</p>
              ) : (
                <ul className="space-y-1">
                  {offWeek.map((r) => (
                    <li key={r.id}>
                      {name(r.user_id)} <span className="text-muted-foreground">· {fmt(r.start_date)} to {fmt(r.end_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {formatDate(monthStart, { month: "long", year: "numeric" })}
            </h3>
            <div className="flex gap-3 text-sm">
              <Link href={`/org/hr/holidays?month=${prevMonth(month)}`} className="text-primary hover:underline">← Earlier</Link>
              <Link href="/org/hr/holidays" className="text-primary hover:underline">This month</Link>
              <Link href={`/org/hr/holidays?month=${nextMonth(month)}`} className="text-primary hover:underline">Later →</Link>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-1 font-semibold text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
            {days.map((d) => {
              const off = approved.filter((r) => overlaps(r, d, d));
              const pending = waiting.filter((r) => overlaps(r, d, d));
              return (
                <div key={d} className={`min-h-20 rounded-lg border p-1 ${d === today ? "border-primary" : ""} ${BANK_HOLIDAYS.has(d) ? "bg-muted/60" : "bg-card"}`}>
                  <p className="font-medium">{Number(d.slice(8))}</p>
                  {off.slice(0, 4).map((r) => (
                    <p key={r.id} className="truncate rounded bg-teal-50 px-1 text-teal-900">{name(r.user_id)}</p>
                  ))}
                  {off.length > 4 && <p className="text-muted-foreground">+{off.length - 4} more</p>}
                  {pending.length > 0 && <p className="truncate text-amber-700">{pending.length} waiting</p>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Shaded days are bank holidays in England and Wales.</p>
        </section>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="font-semibold">Add leave for someone</h3>
            <LeaveForm types={types} unit="days" bankHolidaysFromAllowance={s.bankHolidaysFromAllowance} people={sortedPeople} canApproveNow />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
