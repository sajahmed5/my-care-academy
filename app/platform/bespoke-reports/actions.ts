"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";
import { requestMessageEmail, requestStatusEmail } from "@/lib/bespoke/request-email";
import type { SaveState } from "@/app/platform/actions";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { parseDefinition } from "@/lib/bespoke/definition";

/**
 * Our side of a bespoke report request (BESPOKE-REPORTS.md): moving it along
 * and writing to the company. Every write is the service role, after
 * requireRole("platform_admin").
 */

const STATUSES = ["asked", "building", "ready"] as const;
type Status = (typeof STATUSES)[number];

async function requester(admin: ReturnType<typeof createAdminClient>, userId: string | null) {
  if (!userId) return null;
  const { data } = await admin.from("users").select("full_name, email, status").eq("id", userId).maybeSingle();
  if (!data?.email || data.status === "deactivated") return null;
  return { name: (data.full_name as string | null) ?? null, email: data.email as string };
}

/** Asked, being built or ready. The manager who asked is emailed when it starts and when it's ready. */
export async function setRequestStatusAction(requestId: string, status: string): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  if (!STATUSES.includes(status as Status)) return { ok: false, error: "Choose a status." };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("report_requests")
    .select("id, request_no, title, due_on, status, requested_by, organisation_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "That request wasn't found." };
  if (request.status === "withdrawn") return { ok: false, error: "The company withdrew this request." };
  if (request.status === status) return { ok: true };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "building") patch.building_at = now;
  if (status === "ready") patch.ready_at = now;
  if (status !== "ready") patch.ready_at = null;
  const { error } = await admin.from("report_requests").update(patch).eq("id", requestId);
  if (error) return { ok: false, error: "The status couldn't be saved. Try again." };

  await logAudit({
    context,
    organisationId: request.organisation_id as string,
    action: "report_request.status",
    entity: "report_request",
    entityId: requestId,
    detail: { from: request.status, to: status },
  });

  if (status === "building" || status === "ready") {
    const [who, origin, { data: built }] = await Promise.all([
      requester(admin, request.requested_by as string | null),
      siteOrigin(),
      admin.from("bespoke_reports").select("id").eq("request_id", requestId).is("archived_at", null).limit(1),
    ]);
    if (who) {
      const mail = requestStatusEmail(
        {
          id: request.id as string,
          requestNo: Number(request.request_no),
          title: request.title as string,
          dueOn: request.due_on as string,
        },
        status,
        who.name,
        origin,
        (built?.[0]?.id as string | undefined) ?? null,
      );
      await sendEmail({ to: who.email, ...mail });
    }
  }

  revalidatePath("/platform/bespoke-reports");
  revalidatePath(`/platform/bespoke-reports/requests/${requestId}`);
  return { ok: true };
}

/** A message from us; the manager who asked is emailed it. */
export async function postOurMessageAction(requestId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write your message first." };
  if (body.length > 4000) return { ok: false, error: "Keep the message under 4,000 characters." };
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("report_requests")
    .select("id, request_no, title, requested_by, organisation_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "That request wasn't found." };

  const { error } = await admin.from("report_request_messages").insert({
    request_id: request.id,
    organisation_id: request.organisation_id,
    author_id: context.userId,
    from_us: true,
    body,
  });
  if (error) return { ok: false, error: "The message couldn't be sent. Try again." };

  const [who, origin] = await Promise.all([requester(admin, request.requested_by as string | null), siteOrigin()]);
  if (who) {
    const mail = requestMessageEmail(
      { id: request.id as string, requestNo: Number(request.request_no), title: request.title as string },
      body,
      "company",
      "My Care Academy",
      origin,
    );
    await sendEmail({ to: who.email, ...mail });
  }

  revalidatePath(`/platform/bespoke-reports/requests/${requestId}`);
  return { ok: true };
}

/**
 * Start a report for one company — from its request, or on its own. Only a
 * company whose package has bespoke reports can have one.
 */
export async function createReportAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const requestId = String(formData.get("requestId") ?? "") || null;
  let orgId = String(formData.get("organisationId") ?? "");
  let title = String(formData.get("title") ?? "").trim();
  let description: string | null = null;

  if (requestId) {
    const { data: request } = await admin
      .from("report_requests")
      .select("id, organisation_id, title, question")
      .eq("id", requestId)
      .maybeSingle();
    if (!request) return { ok: false, error: "That request wasn't found." };
    const { data: existing } = await admin.from("bespoke_reports").select("id").eq("request_id", requestId).limit(1);
    if (existing?.[0]) redirect(`/platform/bespoke-reports/${existing[0].id}`);
    orgId = request.organisation_id as string;
    title = title || (request.title as string);
    description = ((request.question as string) ?? "").slice(0, 2000) || null;
  }
  if (!orgId) return { ok: false, error: "Choose the company." };
  if (!title) return { ok: false, error: "Give the report a name." };
  if (!(await hasFeatureForOrg(admin, orgId, "reports.bespoke"))) {
    return { ok: false, error: "That company's package doesn't include bespoke reports." };
  }

  const { data, error } = await admin
    .from("bespoke_reports")
    .insert({
      organisation_id: orgId,
      request_id: requestId,
      title: title.slice(0, 150),
      description,
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The report couldn't be started. Try again." };
  if (requestId) {
    await admin
      .from("report_requests")
      .update({ status: "building", building_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "asked");
  }
  await logAudit({ context, organisationId: orgId, action: "bespoke_report.created", entity: "bespoke_report", entityId: data.id as string });
  redirect(`/platform/bespoke-reports/${data.id}`);
}

/** Save what the builder holds. The definition is re-read against the catalogue. */
export async function saveReportAction(
  id: string,
  input: { title: string; description: string; definition: unknown },
): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the report a name." };
  if (title.length > 150) return { ok: false, error: "Keep the name under 150 characters." };
  const description = input.description.trim();
  if (description.length > 2000) return { ok: false, error: "Keep the description under 2,000 characters." };
  const definition = parseDefinition(input.definition);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bespoke_reports")
    .update({ title, description: description || null, definition, updated_by: context.userId })
    .eq("id", id)
    .select("organisation_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "The report couldn't be saved. Try again." };
  await logAudit({ context, organisationId: data.organisation_id as string, action: "bespoke_report.saved", entity: "bespoke_report", entityId: id });

  revalidatePath(`/platform/bespoke-reports/${id}`);
  revalidatePath("/platform/bespoke-reports");
  return { ok: true };
}

/** Take a report down (the company stops seeing it), or put it back. */
export async function setReportArchivedAction(id: string, archived: boolean): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bespoke_reports")
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_by: context.userId })
    .eq("id", id)
    .select("organisation_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "That couldn't be saved. Try again." };
  await logAudit({
    context,
    organisationId: data.organisation_id as string,
    action: archived ? "bespoke_report.archived" : "bespoke_report.restored",
    entity: "bespoke_report",
    entityId: id,
  });
  revalidatePath(`/platform/bespoke-reports/${id}`);
  revalidatePath("/platform/bespoke-reports");
  return { ok: true };
}
