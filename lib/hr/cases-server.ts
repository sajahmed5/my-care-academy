import "server-only";
import { after } from "next/server";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { caseRef, firstStage, type CaseKind } from "@/lib/hr/cases";
import type { Admin } from "@/lib/hr/server";

/** The next reference for this company, kind and year. */
async function nextRef(admin: Admin, orgId: string, kind: CaseKind): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = caseRef(kind, year, 0).slice(0, -3);
  const { count } = await admin.from("hr_cases").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).like("ref", `${prefix}%`);
  return caseRef(kind, year, (count ?? 0) + 1);
}

/**
 * Insert a case with the next reference, retrying if two are opened at once
 * and take the same number. The caller has checked who may open it.
 */
export async function createCase(
  admin: Admin,
  a: {
    orgId: string;
    kind: CaseKind;
    subtype: string;
    userId: string;
    aboutUserId: string | null;
    summary: string;
    raisedVia: string;
    raisedBy: string;
    linkedType: string;
    linkedId: string;
    linkedLabel: string;
    by: string;
  },
): Promise<{ id?: string; ref?: string }> {
  const line = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max);
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await nextRef(admin, a.orgId, a.kind);
    const { data, error } = await admin
      .from("hr_cases")
      .insert({
        organisation_id: a.orgId,
        ref,
        kind: a.kind,
        subtype: a.kind === "disciplinary" ? (a.subtype === "capability" ? "capability" : "conduct") : null,
        user_id: a.userId,
        about_user_id: a.aboutUserId,
        summary: a.summary,
        raised_via: ["office", "own_login", "in_writing"].includes(a.raisedVia) ? a.raisedVia : "office",
        raised_by: a.raisedBy,
        linked_type: line(a.linkedType, 40) || null,
        linked_id: /^[0-9a-f-]{36}$/.test(a.linkedId) ? a.linkedId : null,
        linked_label: line(a.linkedLabel, 200) || null,
        stage: firstStage(a.kind),
      })
      .select("id")
      .single();
    if (!error) {
      await admin.from("hr_case_notes").insert({ organisation_id: a.orgId, case_id: data.id, kind: "event", body: `Case opened by ${a.by}.`, created_by: a.raisedBy });
      return { id: data.id as string, ref };
    }
    if (!/duplicate|unique/i.test(error.message)) break;
  }
  return {};
}

/** Tell the managers who may see it that a grievance has come in from someone's login. Never the manager it's about. */
export async function emailNewGrievance(admin: Admin, orgId: string, caseId: string, raisedBy: string, aboutUserId: string | null): Promise<void> {
  const [{ data: managers }, origin] = await Promise.all([
    admin.from("users").select("id, email").eq("organisation_id", orgId).eq("role", "org_admin").eq("status", "active").limit(50),
    siteOrigin(),
  ]);
  const to = (managers ?? []).filter((m) => m.id !== aboutUserId && m.id !== raisedBy).map((m) => m.email as string).filter(Boolean);
  after(async () => {
    for (const email of to) {
      await sendEmail({
        to: email,
        subject: "A grievance has been raised",
        html: emailLayout({
          heading: "A grievance has been raised",
          body: `<p>A member of staff has raised a grievance from their own login. Acknowledge it in writing and arrange a meeting without unreasonable delay.</p>${emailButton(`${origin}/org/hr/cases/${caseId}`, "Open the case")}`,
        }),
      });
    }
  });
}
