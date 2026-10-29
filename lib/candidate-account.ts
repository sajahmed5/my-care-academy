import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, emailLinkFallback, esc } from "@/lib/email-layout";

/**
 * A candidate's login (RECRUITMENT.md, release 2b): role 'candidate' and no
 * organisation, linked from candidates.user_id. They set a password from an
 * invite, then follow their application and upload documents. Hired, the same
 * account becomes the company's learner.
 */

type Admin = ReturnType<typeof createAdminClient>;

async function linkFor(admin: Admin, type: "invite" | "recovery", email: string, fullName: string) {
  const { data, error } = await admin.auth.admin.generateLink(
    type === "invite"
      ? { type, email, options: { data: { role: "candidate", organisation_id: null, full_name: fullName } } }
      : { type, email },
  );
  if (error || !data.properties?.hashed_token) return null;
  const url = `${await siteOrigin()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${type}&next=/auth/set-password`;
  return { url, userId: data.user?.id ?? null };
}

/**
 * Give a candidate a login and email them the link to set their password. An
 * email that already has a candidate login is linked to it and sent a fresh
 * link. An email that belongs to a member of staff somewhere is refused: that
 * account can't also be a candidate's.
 */
export async function inviteCandidate(
  admin: Admin,
  candidateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: c } = await admin
    .from("candidates")
    .select("id, full_name, email, user_id, organisations(name)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!c?.email) return { ok: false, error: "Add their email address first." };
  const email = (c.email as string).trim().toLowerCase();
  const company = (c.organisations as unknown as { name: string } | null)?.name ?? "the company";

  const { data: existing } = await admin.from("users").select("id, role").ilike("email", email).maybeSingle();
  if (existing && existing.role !== "candidate") {
    return { ok: false, error: "This email already has a My Care Academy login as staff, so it can't be used for a candidate's." };
  }
  const link = existing
    ? await linkFor(admin, "recovery", email, c.full_name as string)
    : await linkFor(admin, "invite", email, c.full_name as string);
  if (!link) return { ok: false, error: "The login couldn't be made. Try again." };
  const userId = existing?.id ?? link.userId;
  if (userId && c.user_id !== userId) await admin.from("candidates").update({ user_id: userId }).eq("id", candidateId);

  const html = emailLayout({
    heading: `Follow your application to ${company}`,
    body: `<p>Hello ${esc(String(c.full_name ?? "").split(" ")[0] || "there")},</p>
      <p>${esc(company)} has given you a login to follow your application. Set a password, and you'll see what's
      done, what's next, and anything you need to send — you can upload your documents from your phone.</p>
      ${emailButton(link.url, "Set my password")}
      ${emailLinkFallback(link.url)}`,
    footer: `Sent for ${esc(company)} by My Care Academy.`,
  });
  const sent = await sendEmail({ to: email, subject: `Follow your application to ${company}`, html });
  return sent ? { ok: true } : { ok: false, error: "The email couldn't be sent. Try again." };
}

/**
 * Hired: the candidate's own login becomes the company's learner, so they
 * sign in with the password they already have. Returns false when there's no
 * candidate login to move (the caller invites them as a learner instead).
 */
export async function makeCandidateStaff(admin: Admin, candidateId: string, orgId: string, opts: { email?: boolean } = {}): Promise<boolean> {
  const { data: c } = await admin.from("candidates").select("user_id, full_name, email, organisations(name)").eq("id", candidateId).maybeSingle();
  if (!c?.user_id) return false;
  const { data: user } = await admin.from("users").select("role").eq("id", c.user_id as string).maybeSingle();
  if (user?.role !== "candidate") return false;
  await admin.from("users").update({ role: "learner", organisation_id: orgId }).eq("id", c.user_id as string);
  // The welcome pack says the same and more, when it's going.
  if (opts.email === false) return true;
  const company = (c.organisations as unknown as { name: string } | null)?.name ?? "your new employer";
  const url = `${await siteOrigin()}/login`;
  await sendEmail({
    to: c.email as string,
    subject: `Welcome to ${company}`,
    html: emailLayout({
      heading: `Welcome to ${company}`,
      body: `<p>Hello ${esc(String(c.full_name ?? "").split(" ")[0] || "there")},</p>
        <p>You've been taken on. Sign in with the same email and password as before: your training is waiting for you.</p>
        ${emailButton(url, "Sign in")}`,
      footer: `Sent for ${esc(company)} by My Care Academy.`,
    }),
  });
  return true;
}
