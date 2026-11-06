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
  /**
   * Who just signed up, so the success screen can book them a demo
   * (lib/demo-booking.ts). Left off a bot's "success", which made nothing.
   */
  booking?: { orgId: string; orgName: string; name: string; phone: string | null };
}

export const INITIAL_TRIAL_SIGNUP_STATE: TrialSignupState = { status: "idle" };

/** The demo chooser's state, after Book this demo. */
export interface DemoBookingState {
  status: "idle" | "booked" | "error";
  error?: string;
  /** "Tuesday 10 November, 10:00 to 10:30", once booked. */
  when?: string;
}

export const INITIAL_DEMO_BOOKING_STATE: DemoBookingState = { status: "idle" };
