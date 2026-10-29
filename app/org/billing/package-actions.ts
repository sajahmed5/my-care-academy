"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailLayout, esc } from "@/lib/email-layout";
import { PACKAGE_TIERS, tierLabel, type PackageTier } from "@/lib/organisations";
import { createClient } from "@/lib/supabase/server";

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

/**
 * A manager asks to move to another package (29 Oct 2026). Package changes
 * stay with us, as the Account page has always said: this records the request
 * and tells the team, and nothing changes until we've been in touch.
 */
export async function requestPackageChangeAction(
  toTier: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  const to = PACKAGE_TIERS.find((t) => t.value === toTier)?.value as PackageTier | undefined;
  if (!to) return { ok: false, error: "Choose a package." };
  const trimmed = note.trim().slice(0, 2000);

  const supabase = await createClient();
  const [{ data: org }, { data: open }, { data: me }] = await Promise.all([
    supabase.from("organisations").select("name, package_tier").eq("id", context.organisationId!).maybeSingle(),
    supabase
      .from("package_change_requests")
      .select("id")
      .eq("organisation_id", context.organisationId!)
      .eq("to_tier", to)
      .eq("status", "open")
      .limit(1),
    supabase.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
  ]);
  const from = (org?.package_tier ?? "core") as PackageTier;
  if (from === to) return { ok: false, error: `You're already on ${tierLabel(to)}.` };
  // Asked already: say so rather than sending the team a second email.
  if (open && open.length > 0) return { ok: true };

  const { error } = await supabase.from("package_change_requests").insert({
    organisation_id: context.organisationId,
    requested_by: context.userId,
    from_tier: from,
    to_tier: to,
    note: trimmed || null,
  });
  if (error) return { ok: false, error: "The request couldn't be saved. Try again." };

  const who = (me?.full_name as string | null) || (me?.email as string) || "A manager";
  await sendEmail({
    to: INBOX,
    replyTo: (me?.email as string | undefined) ?? undefined,
    subject: `Package change: ${org?.name ?? "an organisation"} asks for ${tierLabel(to)}`,
    html: emailLayout({
      heading: "A package change request",
      body: `<p><strong>${esc(org?.name ?? "An organisation")}</strong> would like to move from
        ${esc(tierLabel(from))} to <strong>${esc(tierLabel(to))}</strong>.</p>
        <p>Asked by ${esc(who)}${me?.email ? ` (${esc(me.email as string)})` : ""}.</p>
        ${trimmed ? `<p>Their note: ${esc(trimmed)}</p>` : ""}
        <p>Change the package on the organisation's page in the platform console, then let them know.</p>`,
      footer: "My Care Academy — sent from a manager's Account page.",
    }),
  });

  revalidatePath("/org/billing");
  return { ok: true };
}
