"use server";

import { requireConsole } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { LOCKED_COPY } from "@/lib/locked";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * An office worker's "Let my manager know": an email to each manager of the
 * organisation, naming the feature and linking to the page where they can
 * ask us for it. Only an office worker sends it — a manager has the upgrade
 * button instead.
 */
export async function askManagerAction(feature: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  if (context.role !== "org_office") return { ok: false, error: "Only office staff send this." };
  const key = FEATURES.find((f) => f.key === feature)?.key as FeatureKey | undefined;
  const copy = key ? LOCKED_COPY[key] : undefined;
  if (!key || !copy) return { ok: false, error: "That isn't something we can ask about." };

  const admin = createAdminClient();
  const [{ data: managers }, { data: me }] = await Promise.all([
    admin
      .from("users")
      .select("email")
      .eq("organisation_id", context.organisationId!)
      .eq("role", "org_admin")
      .or("status.is.null,status.neq.deactivated"),
    admin.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
  ]);
  const to = (managers ?? []).map((m) => m.email as string).filter(Boolean);
  if (to.length === 0) return { ok: false, error: "Your company has no manager on the site to tell." };

  const name = (me?.full_name as string | null) || (me?.email as string) || "Someone in your office";
  const who = esc(name);
  const link = `${await siteOrigin()}/org/locked/${key}`;
  const html = emailLayout({
    heading: `${copy.area}: not in your package yet`,
    body: `<p>${who} would like to use <strong>${esc(copy.heading.toLowerCase())}</strong> on My Care Academy.
      It isn't in your company's package. As a manager, you can ask us to add it.</p>
      ${emailButton(link, "See what it includes")}`,
    footer: "My Care Academy — sent because a member of your office asked for it.",
  });
  const results = await Promise.all(
    to.map((email) => sendEmail({ to: email, subject: `${name} asked about ${copy.area} on My Care Academy`, html })),
  );
  return results.some(Boolean) ? { ok: true } : { ok: false, error: "The email couldn't be sent. Try again later." };
}
