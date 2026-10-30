"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailLayout, esc } from "@/lib/email-layout";
import { formatDate } from "@/lib/dates";
import { addMonths, parseAgreedActions } from "@/lib/records";
import { sanitiseWith, validateSection, type Answers, type FieldError } from "@/lib/recruitment-application";
import { ukDate } from "@/lib/hr-pdf";
import { PROBATION_SECTIONS, outcomeProblems, reviewPoints } from "@/lib/hr/probation";
import { monthsText } from "@/lib/hr/letters";
import { createLetterDraft, firstName, hrPerson, probationFacts, probationSettings, setEmployment } from "@/lib/hr/server";

/**
 * Probation (HR-PACK.md): the start date it runs from, booking each review
 * (the carer is told the date, as with supervisions), holding it, and the
 * final outcome with its letter. Every action checks the person is one of
 * this company's staff on the HR pack; the review itself is the manager's
 * record and the carer never reads it.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const done = (userId: string) => {
  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org/hr/probation");
};

export async function saveEmploymentAction(
  userId: string,
  input: { startDate: string; jobTitle: string; noProbation: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const person = await hrPerson(admin, context.organisationId, userId);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  if (input.startDate && !ISO.test(input.startDate)) return { ok: false, error: "Check the start date." };
  const { data: existing } = await admin.from("staff_employment").select("probation_status").eq("user_id", userId).maybeSingle();
  const status = existing?.probation_status as string | undefined;
  const patch: Parameters<typeof setEmployment>[3] = {
    start_date: input.startDate || null,
    job_title: input.jobTitle.replace(/\s+/g, " ").trim().slice(0, 80) || null,
  };
  // "No probation" for someone who was here before the HR pack; switching it
  // back puts them in probation from their start date.
  if (input.noProbation) patch.probation_status = "none";
  else if (!status || status === "none") patch.probation_status = "in_probation";
  const r = await setEmployment(admin, context.organisationId!, userId, patch, context.userId);
  if (r.error) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.employment_saved", entity: "user", entityId: userId, detail: { ...input } });
  done(userId);
  return { ok: true };
}

/** A due date that is one of this person's review points. */
async function pointFor(userId: string, orgId: string, dueOn: string) {
  const admin = createAdminClient();
  const [{ data: emp }, s, { data: reviews }] = await Promise.all([
    admin.from("staff_employment").select("start_date, probation_status, probation_ends_on").eq("user_id", userId).maybeSingle(),
    probationSettings(admin, orgId),
    admin.from("probation_reviews").select("due_on, is_final, status").eq("user_id", userId),
  ]);
  const heldFinals = (reviews ?? []).filter((r) => r.is_final && r.status === "held").map((r) => r.due_on as string);
  return reviewPoints(emp as never, s, heldFinals).find((p) => p.dueOn === dueOn) ?? null;
}

export async function bookProbationReviewAction(
  userId: string,
  dueOn: string,
  input: { bookedOn: string; bookedTime: string },
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const person = await hrPerson(admin, context.organisationId, userId);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  if (!ISO.test(input.bookedOn)) return { ok: false, error: "Choose the date." };
  const point = await pointFor(userId, context.organisationId!, dueOn);
  if (!point) return { ok: false, error: "That review isn't on their schedule any more." };
  const { data: existing } = await admin.from("probation_reviews").select("id, status").eq("user_id", userId).eq("due_on", dueOn).maybeSingle();
  if (existing?.status === "held") return { ok: false, error: "That review has been held." };
  const time = input.bookedTime.replace(/\s+/g, " ").trim().slice(0, 40) || null;
  const { error } = existing
    ? await admin.from("probation_reviews").update({ booked_on: input.bookedOn, booked_time: time }).eq("id", existing.id as string)
    : await admin.from("probation_reviews").insert({
        organisation_id: context.organisationId,
        user_id: userId,
        due_on: dueOn,
        is_final: point.isFinal,
        booked_on: input.bookedOn,
        booked_time: time,
        status: "booked",
        created_by: context.userId,
      });
  if (error) return { ok: false, error: "That didn't save. Try again." };

  // They're told the date, as with supervisions.
  if (person.email) {
    const [{ data: org }, { data: me }] = await Promise.all([
      admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
      admin.from("users").select("full_name").eq("id", context.userId).maybeSingle(),
    ]);
    const orgName = (org?.name as string | undefined) ?? "Your employer";
    const when = `${formatDate(input.bookedOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${time ? ` at ${time}` : ""}`;
    after(() =>
      sendEmail({
        to: person.email!,
        subject: `Your ${point.label.toLowerCase()} is booked: ${formatDate(input.bookedOn, { day: "numeric", month: "short" })}`,
        html: emailLayout({
          body: `<p>Hi ${esc(firstName(person))},</p>
<p>${esc(orgName)} has booked your ${esc(point.label.toLowerCase())}:</p>
<p style="font-size:17px"><strong>${esc(when)}</strong></p>
<p>With ${esc((me?.full_name as string | null) ?? "your manager")}. It's a chance to talk about how you're getting on. If the time doesn't work, let the office know.</p>`,
          footer: `My Care Academy — sent for ${esc(orgName)}.`,
        }),
      }).then(() => undefined),
    );
  }
  await logAudit({ context, action: "hr.probation_review_booked", entity: "user", entityId: userId, detail: { dueOn, bookedOn: input.bookedOn } });
  done(userId);
  return { ok: true };
}

/** Open (or carry on) the review for one due date, with what the site knows today. */
export async function startProbationReviewAction(userId: string, dueOn: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const person = await hrPerson(admin, context.organisationId, userId);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  const point = await pointFor(userId, context.organisationId!, dueOn);
  const { data: existing } = await admin.from("probation_reviews").select("id, status").eq("user_id", userId).eq("due_on", dueOn).maybeSingle();
  if (existing?.status === "held" || existing?.status === "draft") return { ok: true, id: existing.id as string };
  if (!point) return { ok: false, error: "That review isn't on their schedule any more." };
  const facts = await probationFacts(admin, context.organisationId!, userId);
  if (existing) {
    await admin.from("probation_reviews").update({ status: "draft", facts }).eq("id", existing.id as string);
    return { ok: true, id: existing.id as string };
  }
  const { data, error } = await admin
    .from("probation_reviews")
    .insert({ organisation_id: context.organisationId, user_id: userId, due_on: dueOn, is_final: point.isFinal, status: "draft", facts, created_by: context.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: "The review couldn't be started. Try again." };
  return { ok: true, id: data.id as string };
}

export interface ReviewOutcomeInput {
  outcome: string | null;
  extendMonths: number | null;
  reason: string;
}

/**
 * Save the review as it's typed; finish it on purpose. Finishing a final
 * review settles probation — passed, extended (the end moves on, with a review
 * at the new end) or not passed — and starts the letter to go with it, which a
 * person then reads and sends.
 */
export async function saveProbationReviewAction(
  id: string,
  raw: unknown,
  o: ReviewOutcomeInput,
  finish: boolean,
): Promise<{ ok: boolean; error?: string; problems?: FieldError[]; letterId?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const { data: review } = await admin.from("probation_reviews").select("*").eq("id", id).maybeSingle();
  if (!review || review.organisation_id !== context.organisationId) return { ok: false, error: "Review not found." };
  const person = await hrPerson(admin, context.organisationId, review.user_id as string);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  if (review.status === "held") return { ok: false, error: "This review has been finished." };
  const answers: Answers = sanitiseWith(PROBATION_SECTIONS, raw);
  const reason = o.reason.replace(/\r/g, "").trim().slice(0, 2000);
  const outcome = o.outcome || null;
  const extendMonths = outcome === "extended" ? Number(o.extendMonths) || null : null;
  if (finish) {
    const today = new Date().toISOString().slice(0, 10);
    const problems = PROBATION_SECTIONS.flatMap((s) => validateSection(s, answers, today));
    const outcomeIssues = outcomeProblems({ isFinal: review.is_final as boolean, outcome, extendMonths, reason });
    if (problems.length || outcomeIssues.length) {
      return { ok: false, error: outcomeIssues[0] ?? "Some answers still need filling in.", problems };
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin
    .from("probation_reviews")
    .update({
      answers,
      outcome,
      extend_months: extendMonths,
      outcome_reason: reason || null,
      ...(finish ? { status: "held", held_on: today, held_by: context.userId } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, error: "That didn't save. Try again." };
  if (!finish) return { ok: true };

  const userId = person.id;
  const orgId = context.organisationId!;
  // What was agreed becomes actions on their file, as with supervisions.
  const agreed = parseAgreedActions(String(answers.agreed ?? ""));
  if (agreed.length) {
    await admin.from("record_actions").insert(
      agreed.map((title) => ({
        organisation_id: orgId,
        user_id: userId,
        title,
        detail: `Agreed at their probation review on ${ukDate(today)}.`,
        due_date: null,
        source_type: "manual",
        source_id: null,
        created_by: context.userId,
      })),
    );
  }

  let letterId: string | undefined;
  if (review.is_final) {
    const { data: emp } = await admin.from("staff_employment").select("probation_ends_on").eq("user_id", userId).maybeSingle();
    const end = (emp?.probation_ends_on as string | null) ?? (review.due_on as string);
    if (outcome === "passed") {
      await setEmployment(admin, orgId, userId, { probation_status: "passed" }, context.userId);
      letterId = (await createLetterDraft(admin, { orgId, person, kind: "probation_passed", sourceType: "probation_review", sourceId: id, values: { date: ukDate(today) }, by: context.userId })).id;
    } else if (outcome === "extended" && extendMonths) {
      const newEnd = addMonths(end, extendMonths);
      await setEmployment(admin, orgId, userId, { probation_status: "extended", probation_ends_on: newEnd }, context.userId);
      letterId = (
        await createLetterDraft(admin, {
          orgId,
          person,
          kind: "probation_extended",
          sourceType: "probation_review",
          sourceId: id,
          values: { months: monthsText(extendMonths), date: ukDate(newEnd), reason, details: String(answers.agreed ?? "").trim() || String(answers.improve ?? "").trim() },
          by: context.userId,
        })
      ).id;
    } else if (outcome === "not_passed") {
      await setEmployment(admin, orgId, userId, { probation_status: "not_passed" }, context.userId);
      letterId = (
        await createLetterDraft(admin, {
          orgId,
          person,
          kind: "probation_not_passed",
          sourceType: "probation_review",
          sourceId: id,
          values: { date: ukDate(today), reason, deadline: ukDate(addWorkingDays(today, 5)) },
          by: context.userId,
        })
      ).id;
    }
  }
  await logAudit({ context, action: "hr.probation_review_held", entity: "user", entityId: userId, detail: { review: id, outcome, final: review.is_final } });
  done(userId);
  return { ok: true, letterId };
}

/** Five working days on, for an appeal deadline (weekends skipped; bank holidays aren't known here). */
function addWorkingDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}
