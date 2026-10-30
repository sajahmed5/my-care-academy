/**
 * What the record's papers — the response PDF, the interim update, the
 * evidence bundle — share: the record read once, with its stages, the
 * organisation's name and the people resolved to names. Through the request's
 * client, so RLS decides what may be printed.
 */

import { orgBranding } from "@/lib/branding";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadComplaint, loadStaffOptions, loadStages } from "./data";
import { stagesFor } from "./stages";
import type { PdfContext } from "./pdf";

export async function loadPdfContext(
  supabase: SupabaseClient,
  id: string,
  organisationId: string,
): Promise<(PdfContext & { allStages: Awaited<ReturnType<typeof loadStages>> }) | null> {
  const [complaint, allStages, staff, { data: org }] = await Promise.all([
    loadComplaint(supabase, id),
    loadStages(supabase, organisationId),
    loadStaffOptions(supabase, organisationId),
    supabase.from("organisations").select("name").eq("id", organisationId).maybeSingle(),
  ]);
  if (!complaint) return null;
  const names = new Map(staff.map((s) => [s.value, s.label]));
  return {
    complaint,
    allStages,
    stages: stagesFor(allStages, complaint.kind),
    organisationName: (org?.name as string) ?? "This organisation",
    organisationLogoUrl: (await orgBranding(organisationId))?.logoUrl ?? null,
    nameOf: (uid: string) => names.get(uid) ?? uid,
  };
}

/** Safe in a file name on any platform, and still readable. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90);
