import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendInviteEmail, sendPasswordResetEmail, type SendResult } from "@/lib/email";
import type { UserRole } from "@/lib/auth";

/**
 * Generates a Supabase invite link (creating the auth user with role/org in its
 * metadata, which the handle_new_user trigger turns into a profile) and emails
 * it. The invitee accepts at /auth/confirm, then sets a password.
 */
export async function createInvite(opts: {
  email: string;
  role: UserRole;
  organisationId: string | null;
  fullName?: string;
  orgName?: string | null;
  roleLabel: string;
}): Promise<SendResult & { userId?: string }> {
  const admin = createAdminClient();
  const origin = await siteOrigin();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: opts.email,
    options: {
      data: {
        role: opts.role,
        organisation_id: opts.organisationId,
        full_name: opts.fullName || opts.email,
      },
    },
  });
  if (error) throw error;

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Failed to generate invite token.");

  const inviteUrl =
    `${origin}/auth/confirm?token_hash=${tokenHash}` +
    `&type=invite&next=/auth/set-password`;

  const result = await sendInviteEmail({
    to: opts.email,
    inviteUrl,
    roleLabel: opts.roleLabel,
    orgName: opts.orgName,
    organisationId: opts.organisationId,
  });
  return { ...result, userId: data.user?.id };
}

/**
 * A fresh link that lets an existing account set a password and get in, landing
 * at /auth/set-password. Used both for a password reset and for chasing someone
 * who never signed in: a `recovery` link works for any existing auth user,
 * whereas re-issuing an `invite` fails once the account exists — and the
 * original invite token has long expired by the time anyone chases it.
 * Throws if the email doesn't belong to an account — callers on public pages
 * must swallow that so account existence is never revealed.
 */
export async function createSetPasswordLink(email: string): Promise<string> {
  const admin = createAdminClient();
  const origin = await siteOrigin();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error) throw error;

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Failed to generate reset token.");

  return (
    `${origin}/auth/confirm?token_hash=${tokenHash}` +
    `&type=recovery&next=/auth/set-password`
  );
}

/**
 * Generates a Supabase recovery link for an existing account and emails it. The
 * recipient sets a new password at /auth/set-password (same flow as invites).
 */
export async function createPasswordReset(email: string): Promise<SendResult> {
  const resetUrl = await createSetPasswordLink(email);
  // The account's company, so with white label the email is in its name.
  const { data: profile } = await createAdminClient()
    .from("users")
    .select("organisation_id")
    .eq("email", email.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  return sendPasswordResetEmail({ to: email, resetUrl, organisationId: (profile?.organisation_id as string | null) ?? null });
}
