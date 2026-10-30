"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { emailLayout, esc } from "@/lib/email-layout";
import { logAudit } from "@/lib/audit";
import { SAME_TEAM_COOKIE, SAME_TEAM_PRODUCTS, type SameTeamProduct } from "@/lib/same-team";

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

/**
 * "I'm interested" on the From the same team card (TRIAL.md): tells us who,
 * from which company, about which product — like the upgrade request. Also
 * from the trial-ended page, once the company is paused.
 */
export async function sameTeamInterestAction(product: SameTeamProduct): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole({ allowEndedTrial: true });
  const item = SAME_TEAM_PRODUCTS[product];
  if (!item) return { ok: false, error: "Something went wrong." };

  const supabase = await createClient();
  const [{ data: org }, { data: me }] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    supabase.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
  ]);
  const company = (org?.name as string | undefined) ?? "A company";
  const email = (me?.email as string | undefined) ?? context.email ?? null;
  const who = (me?.full_name as string | null) || email || "Someone";

  const sent = await sendEmail({
    to: INBOX,
    replyTo: email ?? undefined,
    subject: `Interested in ${item.name}: ${company}`,
    html: emailLayout({
      heading: `Someone's interested in ${item.name}`,
      body: `<p><strong>${esc(who)}</strong>${email ? ` (${esc(email)})` : ""} at <strong>${esc(company)}</strong>
        pressed "I'm interested" on the ${esc(item.name)} advert in My Care Academy.</p>
        <p>Reply to this email to get in touch with them.</p>`,
      footer: "My Care Academy — the From the same team card.",
    }),
  });
  if (!sent) return { ok: false, error: "That didn't go through. Try again, or visit the website." };

  await logAudit({
    context,
    action: "same_team.interested",
    entity: "organisation",
    entityId: context.organisationId!,
    detail: { product },
  });
  return { ok: true };
}

/** Hide the card, in this browser, for a year. */
export async function hideSameTeamAction(): Promise<void> {
  await requireConsole();
  (await cookies()).set(SAME_TEAM_COOKIE, "hidden", {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/org");
  revalidatePath("/org/billing");
}
