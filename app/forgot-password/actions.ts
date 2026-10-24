"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { createPasswordReset } from "@/lib/invites";

export interface ResetState {
  ok?: boolean;
  message?: string;
  /** Dev-only fallback link, surfaced when email isn't configured. */
  link?: string;
}

/**
 * Local development only. The link below is a working password-reset token for
 * whichever address was typed in, so on a deployed site it must never be
 * rendered: anyone could type a manager's email and, on any send failure, be
 * handed the keys to that account. It is here so that a developer without
 * RESEND_API_KEY can still get through the invite flow.
 */
const SHOW_DEV_LINK = process.env.NODE_ENV !== "production";

export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Enter your email address." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`reset:${ip}`, 5, 60_000)) {
    return { ok: false, message: "Too many attempts — please wait a minute and try again." };
  }

  // Always respond the same way whether or not the account exists — never leak
  // which emails are registered.
  const generic: ResetState = {
    ok: true,
    message:
      "If an account exists for that email, we've sent a link to reset your password. It can take a minute to arrive — check your junk folder too.",
  };
  try {
    const res = await createPasswordReset(email);
    if (SHOW_DEV_LINK && !res.sent && res.link) {
      return { ...generic, link: res.link };
    }
    return generic;
  } catch {
    return generic;
  }
}
