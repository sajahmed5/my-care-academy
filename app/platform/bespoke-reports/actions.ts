"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";
import { requestMessageEmail, requestStatusEmail } from "@/lib/bespoke/request-email";
import type { SaveState } from "@/app/platform/actions";

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
    const [who, origin] = await Promise.all([requester(admin, request.requested_by as string | null), siteOrigin()]);
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
