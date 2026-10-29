import { CalendarCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { bookingWhen, kindLabel, loadBookings, shapeSelfAssessment } from "@/lib/supervisions";
import { SelfAssessmentForm } from "./self-assessment-form";

const fmt = (d: string) => formatDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Their booked supervisions and appraisals, and the self-assessment to fill
 * in before an appraisal. That is all a carer sees of Staff Audits: never the
 * manager's notes, a supervision record or a spot check (CARER-FILE.md §6).
 * Spot checks are unannounced, so they are never here.
 */
export default async function MyReviewsPage() {
  const context = await requireStaff();
  // Carers never see an upgrade prompt: no package, no page.
  await requireFeature(context, "people.supervisions", "/learn");
  const supabase = await createClient();
  const [bookings, { data: sas }] = await Promise.all([
    loadBookings(supabase, context.userId),
    supabase
      .from("appraisal_self_assessments")
      .select("id, booking_id, questions, answers, submitted_at")
      .eq("user_id", context.userId)
      .limit(20),
  ]);
  const saByBooking = new Map((sas ?? []).map((r) => [r.booking_id as string, shapeSelfAssessment(r as Record<string, unknown>)]));

  return (
    <DashboardShell learn title="Supervisions" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Your booked supervisions and appraisals. Before an appraisal you are asked a few questions about your year — only your manager sees your answers.
        </p>
        {bookings.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nothing booked">
            When your manager books a supervision or appraisal, it appears here and you get an email.
          </EmptyState>
        ) : (
          bookings.map((b) => {
            const sa = saByBooking.get(b.id);
            return (
              <Card key={b.id}>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <p className="font-semibold">{kindLabel(b.kind)}</p>
                    <p className="text-sm">{bookingWhen(b, fmt)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[b.with_name ? `With ${b.with_name}` : null, b.location].filter(Boolean).join(" · ")}
                    </p>
                    {b.note && <p className="mt-1 text-sm text-muted-foreground">{b.note}</p>}
                  </div>
                  {sa && (
                    <div className="space-y-2 border-t pt-4">
                      <p className="text-sm font-medium">
                        Your self-assessment{" "}
                        <span className={sa.submitted_at ? "text-green-700" : "text-amber-700"}>
                          {sa.submitted_at ? `· sent ${formatDate(sa.submitted_at)}` : "· not sent yet"}
                        </span>
                      </p>
                      <SelfAssessmentForm sa={sa} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
