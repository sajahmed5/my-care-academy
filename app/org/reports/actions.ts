"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, type UserContext } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";
import { readRequest, isOpenRequest } from "@/lib/bespoke/requests";
import { reportDueOn, ukToday } from "@/lib/bespoke/working-days";
import { newRequestEmail, requestMessageEmail } from "@/lib/bespoke/request-email";
import type { SaveState } from "@/app/platform/actions";

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

/**
 * The company's side of a bespoke report request (BESPOKE-REPORTS.md): a
 * manager asks, writes on it, or withdraws it. Signed-in users only read the
 * request tables, so every write is the service role, after the role and the
 * package have both been checked here.
 */

async function managerWithReports(): Promise<UserContext | null> {
  const context = await requireRole("org_admin");
  if (!context.organisationId || !(await hasFeature(context, "reports.bespoke"))) return null;
  return context;
}

async function whoIs(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("users").select("full_name, email").eq("id", userId).maybeSingle();
  return {
    name: (data?.full_name as string | null) || (data?.email as string | null) || "A manager",
    email: (data?.email as string | null) ?? null,
  };
}

export async function askForReportAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await managerWithReports();
  if (!context) return { ok: false, error: "Bespoke reports aren't in your package." };
  const input = readRequest(Object.fromEntries([...formData].map(([k, v]) => [k, String(v)])));
  if (typeof input === "string") return { ok: false, error: input };

  const admin = createAdminClient();
  const dueOn = reportDueOn(ukToday());
  const { data, error } = await admin
    .from("report_requests")
    .insert({
      organisation_id: context.organisationId,
      title: input.title,
      question: input.question,
      audience: input.audience,
      audience_other: input.audienceOther,
      frequency: input.frequency,
      format: input.format,
      due_on: dueOn,
      requested_by: context.userId,
    })
    .select("id, request_no")
    .single();
  if (error || !data) return { ok: false, error: "The request couldn't be saved. Try again." };

  const [{ data: org }, me, origin] = await Promise.all([
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    whoIs(admin, context.userId),
    siteOrigin(),
  ]);
  const mail = newRequestEmail(
    {
      id: data.id as string,
      requestNo: Number(data.request_no),
      title: input.title,
      question: input.question,
      audience: input.audience,
      audienceOther: input.audienceOther,
      frequency: input.frequency,
      format: input.format,
      dueOn,
    },
    (org?.name as string | undefined) ?? "An organisation",
    me.email ? `${me.name} (${me.email})` : me.name,
    origin,
  );
  await sendEmail({ to: INBOX, replyTo: me.email ?? undefined, ...mail });
  await logAudit({ context, action: "report_request.created", entity: "report_request", entityId: data.id as string });

  revalidatePath("/org/reports");
  redirect(`/org/reports/requests/${data.id}`);
}

/** A message from the company on one of its own requests. */
export async function postRequestMessageAction(
  requestId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await managerWithReports();
  if (!context) return { ok: false, error: "Bespoke reports aren't in your package." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write your message first." };
  if (body.length > 4000) return { ok: false, error: "Keep the message under 4,000 characters." };

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("report_requests")
    .select("id, request_no, title, organisation_id")
    .eq("id", requestId)
    .eq("organisation_id", context.organisationId!)
    .maybeSingle();
  if (!request) return { ok: false, error: "That request wasn't found." };

  const { error } = await admin.from("report_request_messages").insert({
    request_id: request.id,
    organisation_id: context.organisationId,
    author_id: context.userId,
    from_us: false,
    body,
  });
  if (error) return { ok: false, error: "The message couldn't be sent. Try again." };

  const [{ data: org }, me, origin] = await Promise.all([
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    whoIs(admin, context.userId),
    siteOrigin(),
  ]);
  const mail = requestMessageEmail(
    { id: request.id as string, requestNo: Number(request.request_no), title: request.title as string },
    body,
    "us",
    `${me.name} at ${(org?.name as string | undefined) ?? "the company"}`,
    origin,
  );
  await sendEmail({ to: INBOX, replyTo: me.email ?? undefined, ...mail });

  revalidatePath(`/org/reports/requests/${requestId}`);
  return { ok: true };
}

/** No longer wanted. Only while it's still with us. */
export async function withdrawRequestAction(requestId: string): Promise<SaveState> {
  const context = await managerWithReports();
  if (!context) return { ok: false, error: "Bespoke reports aren't in your package." };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("report_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("organisation_id", context.organisationId!)
    .maybeSingle();
  if (!request) return { ok: false, error: "That request wasn't found." };
  if (!isOpenRequest(request.status as string)) return { ok: false, error: "Only a request still with us can be withdrawn." };

  const { error } = await admin
    .from("report_requests")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("organisation_id", context.organisationId!);
  if (error) return { ok: false, error: "The request couldn't be withdrawn. Try again." };
  await logAudit({ context, action: "report_request.withdrawn", entity: "report_request", entityId: requestId });

  revalidatePath("/org/reports");
  revalidatePath(`/org/reports/requests/${requestId}`);
  return { ok: true };
}
