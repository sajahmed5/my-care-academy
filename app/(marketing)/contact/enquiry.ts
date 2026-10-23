/**
 * The shape of the form's state, kept out of actions.ts on purpose: a
 * "use server" file may only export async functions, so the initial state
 * constant cannot live beside the action that returns it.
 */
import type { EnquiryTopic } from "./topics";

/** What the visitor typed, kept so a rejected form comes back filled in. */
export interface EnquiryValues {
  name: string;
  email: string;
  phone: string;
  organisation: string;
  teamSize: string;
  topic: EnquiryTopic;
  message: string;
}

export interface EnquiryState {
  status: "idle" | "sent" | "error";
  /** Shown above the form — a reason the whole submission failed. */
  error?: string;
  fieldErrors?: Partial<Record<keyof EnquiryValues, string>>;
  values?: EnquiryValues;
}

export const INITIAL_ENQUIRY_STATE: EnquiryState = { status: "idle" };
