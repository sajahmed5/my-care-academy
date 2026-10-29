"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { nextReference } from "@/lib/complaints/data";
import { computeStageStatus } from "@/lib/complaints/compute";
import { UNTRIAGED } from "@/lib/complaints/stages";

export interface ConcernSubmitState {
  ok?: boolean;
  reference?: string;
  error?: string;
}

const ROLES = ["client", "family", "other"];

async function ip(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

/**
 * A concern raised by a family or a client from the company's link, with no
 * account. Written as the service role — anon has no privilege on any table —
 * after checking the token names a real, open link and the company still has
 * complaints in its package. It lands as a concern waiting for triage, with
 * the Complaint Form filled in from what was typed. A filled-in hidden field
 * marks a bot and is quietly dropped; more than a few from one address in an
 * hour is refused.
 */
export async function submitConcernAction(_prev: ConcernSubmitState, formData: FormData): Promise<ConcernSubmitState> {
  if (String(formData.get("website") ?? "")) return { ok: true };
  if (!rateLimit(`concern:${await ip()}`, 5, 60 * 60_000)) {
    return { error: "Too many concerns sent from here in the last hour. Please try again later, or phone the office." };
  }
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const role = String(formData.get("role") ?? "");
  const contact = String(formData.get("contact") ?? "").trim().slice(0, 200);
  const about = String(formData.get("about") ?? "").trim().slice(0, 120);
  const occurredOn = String(formData.get("occurredOn") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 10000);
  const desired = String(formData.get("desired") ?? "").trim().slice(0, 2000);
  if (!name) return { error: "Please give your name." };
  if (!contact) return { error: "Please give a phone number or email so the office can reply." };
  if (!description) return { error: "Please say what your concern is." };
  if (occurredOn && !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: "Please give the date as a date." };

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("concern_links")
    .select("organisation_id, is_open")
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.is_open) return { error: "This link is no longer taking concerns. Please phone the office." };
  const orgId = link.organisation_id as string;
  if (!(await hasFeatureForOrg(admin, orgId, "complaints.register"))) {
    return { error: "This link is no longer taking concerns. Please phone the office." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const reference = await nextReference(admin, UNTRIAGED, today, orgId);
  const { data: row, error } = await admin
    .from("complaints")
    .insert({
      organisation_id: orgId,
      reference,
      kind: UNTRIAGED,
      raised_by_name: name,
      raised_by_role: ROLES.includes(role) ? role : "other",
      raised_by_contact: contact,
      raised_via: "link",
      about_name: about || null,
      reported_on: today,
      occurred_on: occurredOn || null,
      description,
      desired_outcome: desired || null,
    })
    .select("id")
    .single();
  if (error) return { error: "Your concern could not be sent. Please try again, or phone the office." };

  // What they typed is the Complaint Form, as when the office raises one.
  // Who or what it concerns is left for the office to answer at triage.
  const { data: form } = await admin
    .from("complaint_stages")
    .select("id, name, kind")
    .eq("organisation_id", orgId)
    .eq("kind", "complaint_form")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (form) {
    const answers: Record<string, unknown> = {
      cf_date: today,
      cf_complainant: name,
      cf_relationship: ROLES.includes(role) ? role : "other",
      cf_about: about || undefined,
      cf_details: description,
      cf_source: "link",
      cf_desired: desired || undefined,
    };
    await admin.from("complaint_stage_entries").insert({
      complaint_id: row.id,
      stage_id: form.id,
      form_answers: answers,
      status: computeStageStatus(form as { name: string; kind: string }, answers, []) ?? "pending",
    });
  }
  return { ok: true, reference };
}
