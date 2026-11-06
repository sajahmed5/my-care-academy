/**
 * The sign-up form's state, kept out of actions.ts: a "use server" file may
 * only export async functions, so the initial state can't live beside the
 * action that returns it (as the contact form's enquiry.ts).
 */
import type { TrialSignupFieldErrors, TrialSignupValues } from "@/lib/trial-signup";

export interface TrialSignupState {
  status: "idle" | "sent" | "error";
  /** Shown above the form — a reason the whole sign-up failed. */
  error?: string;
  fieldErrors?: TrialSignupFieldErrors;
  values?: TrialSignupValues;
  /** Once signed up: where the welcome went, and the trial's last day. */
  email?: string;
  endsOn?: string;
  /** Whether the welcome email went; when not, we get in touch instead. */
  emailed?: boolean;
}

export const INITIAL_TRIAL_SIGNUP_STATE: TrialSignupState = { status: "idle" };
