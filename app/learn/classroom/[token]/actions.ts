"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSignInToken, signInProblem } from "@/lib/classroom-sign-in";
import type { SaveState } from "@/app/platform/actions";

/**
 * "I'm here": the signed-in member of staff joins the session's attendance.
 * The service role writes it — a carer can't write attendance under RLS —
 * once the code is checked and they're the company's own current staff.
 */
export async function signInToClassroomAction(token: string): Promise<SaveState> {
  const context = await requireStaff();
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("classroom_sessions")
    .select("id, organisation_id, finished_at, sign_in_expires_at")
    .eq("sign_in_token_hash", hashSignInToken(token))
    .maybeSingle();
  const problem = signInProblem(session, context.organisationId);
  if (problem) return { ok: false, error: problem };

  const { error } = await admin.from("classroom_attendance").upsert(
    {
      session_id: session!.id,
      organisation_id: context.organisationId,
      user_id: context.userId,
      signed_in_at: new Date().toISOString(),
    },
    { onConflict: "session_id,user_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/classroom/${session!.id}`);
  return { ok: true };
}
