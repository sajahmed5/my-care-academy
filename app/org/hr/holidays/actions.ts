"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { canApprove, clashes, type LeaveRequest } from "@/lib/hr/holidays";
import { emailLeaveDecision, holidaySettings as settingsFor, unitFor, validateLeave, type LeaveInput } from "@/lib/hr/holidays-server";
import { hrPerson, personName, type Admin } from "@/lib/hr/server";

/**
 * Holidays from the console (HR-PACK.md): each person's allowance, leave
 * entered on someone's behalf, and approving or declining requests — with
 * who else is off, and the company's "no more than X off at once" as a
 * warning the approver can override, never a block.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Result = { ok: boolean; error?: string };

const done = (userId: string) => {
  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org/hr/holidays");
  revalidatePath("/org");
};


export async function setAllowanceAction(userId: string, input: { yearStart: string; amount: number; unit: string; note: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  if (!(await hrPerson(admin, context.organisationId, userId))) return { ok: false, error: "That person is not one of your staff." };
  if (!ISO.test(input.yearStart)) return { ok: false, error: "Choose the leave year." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 2000) return { ok: false, error: "Enter the allowance as a number." };
  const { error } = await admin.from("leave_allowances").upsert(
    {
      organisation_id: context.organisationId,
      user_id: userId,
      year_start: input.yearStart,
      amount,
      unit: input.unit === "hours" ? "hours" : "days",
      note: input.note.replace(/\s+/g, " ").trim().slice(0, 200) || null,
      updated_by: context.userId,
    },
    { onConflict: "user_id,year_start" },
  );
  if (error) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.allowance_set", entity: "user", entityId: userId, detail: { yearStart: input.yearStart, amount, unit: input.unit } });
  done(userId);
  return { ok: true };
}

export async function addLeaveAction(userId: string, input: LeaveInput & { approveNow: boolean }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const person = await hrPerson(admin, context.organisationId, userId);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  const { row, error } = await validateLeave(admin, context.organisationId!, input);
  if (!row) return { ok: false, error };
  const approve = input.approveNow && canApprove({ id: context.userId, role: context.role! }, person);
  if (input.approveNow && !approve) return { ok: false, error: "Only a manager can approve this person's leave, and nobody approves their own. Save it as a request instead." };
  const { error: insErr } = await admin.from("leave_requests").insert({
    ...row,
    organisation_id: context.organisationId,
    user_id: userId,
    unit: await unitFor(admin, context.organisationId!, userId, input.start),
    status: approve ? "approved" : "requested",
    decided_by: approve ? context.userId : null,
    decided_at: approve ? new Date().toISOString() : null,
    requested_by: context.userId,
  });
  if (insErr) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.leave_added", entity: "user", entityId: userId, detail: { ...row, approved: approve } });
  done(userId);
  return { ok: true };
}

async function loadRequest(admin: Admin, context: UserContext, id: string) {
  const { data } = await admin.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!data || data.organisation_id !== context.organisationId) return null;
  const person = await hrPerson(admin, context.organisationId, data.user_id as string);
  return person ? { request: data, person } : null;
}

/**
 * Approve or decline. Approving past the company's limit returns the clash
 * first; the approver confirms to go ahead.
 */
export async function decideLeaveAction(
  id: string,
  decision: "approved" | "declined",
  note: string,
  override: boolean,
): Promise<Result & { overLimit?: { busiest: number; limit: number; others: string[] } }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const loaded = await loadRequest(admin, context, id);
  if (!loaded) return { ok: false, error: "Request not found." };
  const { request, person } = loaded;
  if (!canApprove({ id: context.userId, role: context.role! }, person)) {
    return { ok: false, error: context.userId === person.id ? "Nobody approves their own leave." : "Only a manager can decide on this person's leave." };
  }
  if (request.status !== "requested") return { ok: false, error: "It has already been decided." };
  const decisionNote = note.replace(/\r/g, "").trim().slice(0, 500) || null;
  if (decision === "declined" && !decisionNote) return { ok: false, error: "Give the reason: it goes in their email." };
  let overLimit = false;
  if (decision === "approved") {
    const s = await settingsFor(admin, context.organisationId!);
    const { data: approved } = await admin
      .from("leave_requests")
      .select("id, user_id, leave_type, start_date, end_date, amount, unit, status")
      .eq("organisation_id", context.organisationId!)
      .eq("status", "approved")
      .lte("start_date", request.end_date as string)
      .gte("end_date", request.start_date as string);
    const c = clashes(request as unknown as LeaveRequest, (approved ?? []) as unknown as LeaveRequest[]);
    if (s.maxOffAtOnce && c.busiest > s.maxOffAtOnce) {
      if (!override) {
        const { data: names } = await admin.from("users").select("full_name, email").in("id", c.others.length ? c.others : ["00000000-0000-0000-0000-000000000000"]);
        return { ok: false, overLimit: { busiest: c.busiest, limit: s.maxOffAtOnce, others: (names ?? []).map((n) => personName(n as never)) } };
      }
      overLimit = true;
    }
  }
  const { data: updated } = await admin
    .from("leave_requests")
    .update({ status: decision, decision_note: decisionNote, decided_by: context.userId, decided_at: new Date().toISOString(), over_limit: overLimit })
    .eq("id", id)
    .eq("status", "requested")
    .select("*")
    .maybeSingle();
  if (!updated) return { ok: false, error: "It has already been decided." };
  after(() => emailLeaveDecision(admin, person, updated as never, context.organisationId!));
  await logAudit({ context, action: `hr.leave_${decision}`, entity: "user", entityId: person.id, detail: { request: id, overLimit } });
  done(person.id);
  return { ok: true };
}

/** Take back leave: a request, or approved leave that hasn't been taken. */
export async function cancelLeaveAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const loaded = await loadRequest(admin, context, id);
  if (!loaded) return { ok: false, error: "Request not found." };
  if (loaded.request.status === "cancelled" || loaded.request.status === "declined") return { ok: false, error: "It isn't booked." };
  await admin.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
  await logAudit({ context, action: "hr.leave_cancelled", entity: "user", entityId: loaded.person.id, detail: { request: id } });
  done(loaded.person.id);
  return { ok: true };
}
