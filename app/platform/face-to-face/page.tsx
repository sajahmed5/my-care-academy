import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFICE_ADDRESS, sessionDay, sessionTitle, ukDay, ukTime } from "@/lib/face-to-face";
import { formatDate } from "@/lib/dates";
import { SessionForm } from "./session-form";
import { ClosedDays } from "./closed-days";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface SessionRow {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  trainer_name: string | null;
  places: number;
  cancelled_at: string | null;
  course: { title: string } | { title: string }[] | null;
}

/**
 * Face-to-face training, our side (FACE-TO-FACE.md, 29 Oct 2026): the
 * sessions at our office, and the days nothing runs.
 */
export default async function FaceToFacePage() {
  const context = await requireRole("platform_admin");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: past }, { data: courses }, { data: closed }] = await Promise.all([
    supabase
      .from("face_to_face_sessions")
      .select("id, kind, starts_at, ends_at, trainer_name, places, cancelled_at, course:courses (title)")
      .gte("ends_at", now)
      .order("starts_at")
      .limit(500),
    supabase
      .from("face_to_face_sessions")
      .select("id, kind, starts_at, ends_at, trainer_name, places, cancelled_at, course:courses (title)")
      .lt("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(50),
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("face_to_face_closed_days").select("day, reason").gte("day", ukDay(now)).order("day"),
  ]);

  const closedDays = Object.fromEntries((closed ?? []).map((d) => [d.day as string, (d.reason as string | null) ?? null]));

  return (
    <DashboardShell title="Face-to-face training" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Sessions at our training office, {OFFICE_ADDRESS}. Enterprise companies book their staff onto them, included in
          their price.
        </p>
        <SessionForm courses={(courses ?? []).map((c) => ({ id: c.id as string, title: c.title as string }))} closedDays={closedDays} />

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionTable rows={(upcoming ?? []) as SessionRow[]} empty="No sessions set up yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Closed days</CardTitle>
            <CardDescription>Days no training runs. Nothing can be set up or booked on them.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClosedDays
              days={(closed ?? []).map((d) => ({
                day: d.day as string,
                label: formatDate(`${d.day}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
                reason: (d.reason as string | null) ?? null,
              }))}
            />
          </CardContent>
        </Card>

        {(past ?? []).length > 0 && (
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Past sessions</summary>
            <div className="mt-3">
              <SessionTable rows={(past ?? []) as SessionRow[]} empty="" />
            </div>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}

function SessionTable({ rows, empty }: { rows: SessionRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">When</th>
            <th className="py-2 pr-3 font-medium">Session</th>
            <th className="py-2 pr-3 font-medium">Trainer</th>
            <th className="py-2 pr-3 text-right font-medium">Places</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((s) => (
            <tr key={s.id} className={s.cancelled_at ? "text-muted-foreground line-through" : undefined}>
              <td className="py-2 pr-3 whitespace-nowrap">
                {sessionDay(s.starts_at)}
                <span className="block text-xs text-muted-foreground">
                  {ukTime(s.starts_at)}–{ukTime(s.ends_at)}
                </span>
              </td>
              <td className="py-2 pr-3">
                <Link href={`/platform/face-to-face/${s.id}`} className="font-medium text-primary hover:underline">
                  {sessionTitle(s.kind, one(s.course)?.title)}
                </Link>
                {s.cancelled_at && <span className="ml-2 text-xs no-underline">cancelled</span>}
              </td>
              <td className="py-2 pr-3">{s.trainer_name ?? "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{s.places}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
