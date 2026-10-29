import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireCandidate } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDone, progress, settingsFromRow, STAGES, type CandidateDocRecord } from "@/lib/recruitment";
import { UploadStep } from "./upload-step";
import Link from "next/link";

export const metadata: Metadata = { title: "Your application" };

/**
 * The candidate's own page (RECRUITMENT.md, mock-up R3): where their
 * application stands, what's theirs to do, and what they're waiting on.
 * Read as the service role for the candidate records linked to their own
 * account — their login has no organisation of its own.
 */
export default async function MyApplicationPage() {
  const context = await requireCandidate();
  const admin = createAdminClient();
  const { data: candidates } = await admin
    .from("candidates")
    .select("id, full_name, status, role_applied, organisation_id, dbs_conviction, organisations(name)")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });

  const views = await Promise.all(
    (candidates ?? []).map(async (c) => {
      const [{ data: docs }, { data: settingsRow }] = await Promise.all([
        admin.from("candidate_documents").select("doc_type, file_path, expires_at, not_required, review_status, review_note").eq("candidate_id", c.id as string),
        admin.from("recruitment_settings").select("*").eq("organisation_id", c.organisation_id as string).maybeSingle(),
      ]);
      const stages = progress((docs ?? []) as CandidateDocRecord[], settingsFromRow(settingsRow), { dbsConviction: c.dbs_conviction === true });
      return { c, stages };
    }),
  );
  const first = String(views[0]?.c.full_name ?? "").split(" ")[0];

  return (
    <div className="mx-auto min-h-svh max-w-lg bg-background px-4 pb-16 pt-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Hi{first ? ` ${first}` : ""}</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">Sign out</button>
        </form>
      </header>

      {views.length === 0 && (
        <p className="mt-6 rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          There&apos;s no application on this login yet. If you&apos;ve applied, the company will be in touch.
        </p>
      )}

      {views.map(({ c, stages }) => {
        const company = (c.organisations as unknown as { name: string } | null)?.name ?? "";
        const open = stages.flatMap((s) => (s.locked ? [] : s.steps));
        const mine = open.filter((s) => s.candidateUploads && (s.state === "not_started" || s.state === "sent_back" || s.state === "expired") && (s.required || s.state === "sent_back"));
        // The health form is theirs to fill in online, not an upload.
        const form = open.find((s) => s.key === "starter_form" && (s.state === "not_started" || s.state === "sent_back"));
        const waiting = open.filter((s) => s.required && !isDone(s.state) && !mine.includes(s) && s !== form);
        const done = stages.flatMap((s) => s.steps).filter((s) => isDone(s.state));
        const current = stages.find((s) => !s.complete)?.stage ?? 4;
        return (
          <section key={c.id as string} aria-label={`Your application to ${company}`} className="mt-6 space-y-4">
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-sm font-semibold text-accent-foreground">{company}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {c.status === "hired" ? "You've been taken on." : c.status === "rejected" ? "This application has closed." : `Your application${c.role_applied ? ` for ${String(c.role_applied).toLowerCase()}` : ""}`}
              </p>
              {c.status === "candidate" && (
                <ol aria-label="Your progress" className="mt-4 grid grid-cols-4 gap-1.5">
                  {STAGES.map((s) => {
                    const st = stages[s.stage - 1];
                    const pct = st.complete ? 100 : s.stage === current && st.total ? Math.round((st.done / st.total) * 100) : 0;
                    return (
                      <li key={s.stage} className={`text-[11px] ${s.stage === current ? "font-semibold" : "text-muted-foreground"}`}>
                        <span aria-hidden="true" className="mb-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="block h-1.5 bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                        {s.short}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {c.status === "candidate" && (
              <>
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">For you to do</h2>
                {form && (
                  <div className="rounded-2xl border border-primary bg-card p-4">
                    <p className="font-medium">{form.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {form.state === "sent_back" ? `The office asked you to change something: ${form.doc?.review_note ?? ""}` : "About 10 minutes. Your answers are confidential."}
                    </p>
                    <Link href={`/my-application/health/${c.id as string}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                      Fill it in
                    </Link>
                  </div>
                )}
                {mine.length === 0 && !form ? (
                  <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nothing right now. We&apos;ll email you when there is.</p>
                ) : (
                  mine.map((s) => (
                    <UploadStep key={s.key} candidateId={c.id as string} step={s.key} label={s.label} hint={s.hint} note={s.state === "sent_back" ? (s.doc?.review_note ?? null) : null} />
                  ))
                )}

                {waiting.length > 0 && (
                  <>
                    <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Waiting on others</h2>
                    <ul className="divide-y rounded-2xl border bg-card">
                      {waiting.map((s) => (
                        <li key={s.key} className="flex justify-between gap-3 px-4 py-3.5 text-sm">
                          <span>{s.label}</span>
                          <span className="text-muted-foreground">{s.state === "submitted" ? "Office checking" : "To come"}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            {done.length > 0 && (
              <>
                <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Done</h2>
                <ul className="divide-y rounded-2xl border bg-card">
                  {done.map((s) => (
                    <li key={s.key} className="flex items-center gap-2.5 px-4 py-3.5 text-sm">
                      <CheckCircle2 className="size-4 text-green-700" aria-hidden="true" /> {s.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
      <p className="mt-8 text-center text-xs text-muted-foreground">Powered by My Care Academy</p>
    </div>
  );
}
