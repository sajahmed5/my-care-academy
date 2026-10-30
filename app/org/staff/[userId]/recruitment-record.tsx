import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { docLabel, stepDef } from "@/lib/recruitment";
import { SIGNING_DOC_KEYS } from "@/lib/signing-documents";
import { latestAttempt } from "@/lib/literacy-attempts";
import { ApplicationFiles, type ApplicationDoc } from "./staff-documents";

const fmt = (d: string | null | undefined) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The candidate record this person was hired from: matched on the login
 * hiring gave them, or else by email within the organisation (older hires
 * were invited from the candidate's email). Read under RLS, so a company
 * without the HR pack, or another company's candidate, finds nothing.
 */
export async function findCandidateFor(supabase: Supabase, userId: string): Promise<string | null> {
  const { data: byLogin } = await supabase
    .from("candidates")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (byLogin?.[0]) return byLogin[0].id as string;
  const { data: person } = await supabase.from("users").select("email, organisation_id").eq("id", userId).maybeSingle();
  if (!person?.email) return null;
  const { data: byEmail } = await supabase
    .from("candidates")
    .select("id")
    .eq("organisation_id", person.organisation_id as string)
    .ilike("email", person.email as string)
    .order("created_at", { ascending: false })
    .limit(1);
  return (byEmail?.[0]?.id as string | undefined) ?? null;
}

/**
 * The Recruitment sub-page of the documents page (HR-PACK.md): everything
 * from when they were recruited on the site — application, test result,
 * interview, references, letters, the signed documents and every file — each
 * a link into the recruitment record that holds it. Nothing is copied: the
 * record stays where it was made, and this is the way back to it from the
 * person's file.
 */
export async function RecruitmentRecord({ userId }: { userId: string }) {
  const supabase = await createClient();
  const candidateId = await findCandidateFor(supabase, userId);
  if (!candidateId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          They weren&apos;t recruited on My Care Academy, so there is no recruitment record. Their documents are on the Documents tab.
        </CardContent>
      </Card>
    );
  }

  // The candidate's own tables are read as the service role, as the
  // candidate page reads them; the candidate row above was found under RLS,
  // so it is this organisation's and the HR pack is on.
  const admin = createAdminClient();
  const [{ data: c }, { data: docs }, { data: app }, attempt, { data: interview }, { data: refs }, { data: letters }, { data: starter }, { data: signings }, { data: shadowing }] =
    await Promise.all([
      admin
        .from("candidates")
        .select("id, full_name, role_applied, source, entry_date, start_date, hired_at, status, dbs_conviction")
        .eq("id", candidateId)
        .maybeSingle(),
      admin.from("candidate_documents").select("doc_type, file_path, expires_at, review_status, not_required").eq("candidate_id", candidateId),
      admin.from("candidate_applications").select("status, submitted_at").eq("candidate_id", candidateId).maybeSingle(),
      latestAttempt(admin, candidateId),
      admin.from("candidate_interviews").select("status, overall_score, outcome").eq("candidate_id", candidateId).maybeSingle(),
      admin
        .from("candidate_references")
        .select("id, position, referee_name, referee_type, organisation, status, received_at")
        .eq("candidate_id", candidateId)
        .order("position"),
      admin.from("candidate_letters").select("kind, sent_at").eq("candidate_id", candidateId),
      admin.from("candidate_starter_forms").select("status, submitted_at").eq("candidate_id", candidateId).maybeSingle(),
      admin.from("candidate_signings").select("doc_key, status").eq("candidate_id", candidateId),
      admin.from("candidate_shadowing").select("status, completed_at").eq("candidate_id", candidateId).maybeSingle(),
    ]);
  if (!c) return null;
  const base = `/org/recruitment/${candidateId}`;
  const files: ApplicationDoc[] = (docs ?? [])
    .filter((d) => d.file_path)
    .map((d) => ({ label: docLabel(d.doc_type as string), file_path: d.file_path as string, expires_at: (d.expires_at as string | null) ?? null }));
  const offer = (letters ?? []).find((l) => l.kind === "offer");

  const rows: Array<{ label: string; detail: string; href?: string; link?: string }> = [
    {
      label: "Application form",
      detail: app?.status === "submitted" ? `Sent in ${fmt(app.submitted_at as string | null)}` : app ? "Started, not sent in" : stepNote(docs, "application"),
      href: app ? `${base}/application` : undefined,
      link: "Read it",
    },
    {
      label: "Literacy test",
      detail:
        attempt?.status === "submitted"
          ? `${attempt.percent ?? "—"}% · ${attempt.passed ? "passed" : "not passed"}`
          : stepNote(docs, "literacy"),
      href: attempt?.status === "submitted" ? base : undefined,
      link: "See the marking",
    },
    {
      label: "Interview",
      detail:
        interview?.status === "complete"
          ? `Scored ${interview.overall_score} of 5 · ${interview.outcome}`
          : interview
            ? "Started, not finished"
            : stepNote(docs, "interview"),
      href: interview ? `${base}/interview` : undefined,
      link: "Open the record",
    },
    {
      label: "Conditional offer",
      detail: offer?.sent_at ? `Sent ${fmt(offer.sent_at as string)}` : stepNote(docs, "offer"),
      href: offer ? `${base}/offer` : undefined,
      link: "Read the letter",
    },
    ...(starter
      ? [{ label: "Health, equality and DBS form", detail: starter.status === "submitted" ? `Sent in ${fmt(starter.submitted_at as string)}` : "Started", href: starter.status === "submitted" ? `${base}/starter` : undefined, link: "Read their answers" }]
      : []),
    ...(refs ?? []).map((r) => ({
      label: `Reference ${r.position}: ${r.referee_name}`,
      detail: [r.referee_type, r.organisation, r.status === "received" ? `answered ${fmt(r.received_at as string)}` : r.status === "requested" ? "asked, not answered" : String(r.status).replace("_", " ")]
        .filter(Boolean)
        .join(" · "),
      href: r.status === "received" ? `${base}/reference/${r.id}` : undefined,
      link: "Read it",
    })),
    ...(c.dbs_conviction ? [{ label: "DBS risk assessment", detail: stepNote(docs, "dbs_risk_assessment") }] : []),
    ...SIGNING_DOC_KEYS.flatMap((k) => {
      const s = (signings ?? []).find((g) => g.doc_key === k);
      if (!s) return [];
      return [
        {
          label: stepDef(k)?.label ?? k,
          detail: s.status === "signed" ? "Signed" : String(s.status).replace("_", " "),
          href: s.status === "signed" ? `${base}/signed/${k}` : undefined,
          link: "Read the signed copy",
        },
      ];
    }),
    ...(shadowing
      ? [{ label: "Shadowing", detail: shadowing.status === "complete" ? `Finished ${fmt(shadowing.completed_at as string)}` : "Started", href: `${base}/shadowing`, link: "Read the feedback" }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
          <div>
            <p className="font-medium">{[c.role_applied, c.source && `heard about the job through ${c.source}`].filter(Boolean).join(" · ") || "Recruited on My Care Academy"}</p>
            <p className="text-muted-foreground">
              Applied {fmt(c.entry_date as string | null)}
              {c.hired_at ? ` · hired ${fmt(c.hired_at as string)}` : ""}
              {c.start_date ? ` · started ${fmt(c.start_date as string)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={base} className="inline-flex min-h-9 items-center rounded-full border px-4 font-medium hover:bg-accent">
              Open the recruitment record
            </Link>
            {files.length > 0 && (
              <a href={`${base}/zip`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 font-medium hover:bg-accent">
                <Download className="size-4" /> Every file (ZIP)
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <span>
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.detail}</span>
                </span>
                {r.href && (
                  <Link href={r.href} className="text-xs font-medium text-primary hover:underline">
                    {r.link}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {files.length > 0 && <ApplicationFiles docs={files} />}
    </div>
  );
}

/** A step done the paper way: held on paper, not needed, or not done. */
function stepNote(docs: Array<Record<string, unknown>> | null, key: string): string {
  const d = (docs ?? []).find((x) => x.doc_type === key);
  if (!d) return "Not recorded";
  if (d.not_required) return "Not needed";
  if (d.file_path) return "Uploaded (in the files below)";
  return d.review_status === "confirmed" || !d.review_status ? "Done on paper" : "Waiting";
}
