/**
 * The acknowledgement of a complaint.
 *
 * Regulation 16 guidance: every complaint is acknowledged, written or verbal.
 * Nothing in a register makes anyone write back; this is the step that does —
 * a letter ready to copy and send, due within three working days of the
 * complaint reaching us.
 *
 * Written from the record, not drafted: it says nothing about what happened
 * or who was at fault, so there is nothing to get wrong. The office can change
 * the wording before it goes.
 *
 * Pure: no I/O.
 */

/** Working days we allow ourselves to acknowledge a complaint. */
export const ACKNOWLEDGE_WITHIN_WORKING_DAYS = 3;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (dateIso: string) => new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
const longDate = (dateIso?: string | null) =>
  dateIso
    ? at(dateIso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";

/** The date the acknowledgement is due: three working days after it arrived, weekends skipped. */
export function acknowledgementDueBy(reportedOn: string): string {
  const d = at(reportedOn);
  let left = ACKNOWLEDGE_WITHIN_WORKING_DAYS;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return iso(d);
}

export interface AcknowledgementState {
  /** Sent, and when. */
  sentOn?: string;
  dueBy: string;
  /** Not sent and past its date. */
  overdue: boolean;
}

export function acknowledgementState(
  reportedOn: string,
  answers: Record<string, unknown> | null | undefined,
  today: string,
): AcknowledgementState {
  const sentOn =
    typeof answers?.sentOn === "string" && answers.sentOn ? answers.sentOn.slice(0, 10) : undefined;
  const dueBy = acknowledgementDueBy(reportedOn);
  return { sentOn, dueBy, overdue: !sentOn && today > dueBy };
}

export interface AcknowledgementInput {
  /** complaint | safeguarding | issue */
  kind: string;
  reference: string;
  raisedByName?: string | null;
  aboutName?: string | null;
  reportedOn: string;
  /** When the full response is due. */
  completeBy?: string | null;
  senderName?: string | null;
  organisationName: string;
  phone?: string | null;
}

const firstName = (full?: string | null) => (full || "").trim().split(/\s+/)[0] || "";

export function acknowledgementLetter(i: AcknowledgementInput): { subject: string; body: string } {
  const what = i.kind === "complaint" ? "complaint" : "concern";
  const about = i.aboutName ? `${firstName(i.aboutName)}'s care` : "our service";
  const lines: string[] = [
    `Dear ${i.raisedByName?.trim() || "Sir or Madam"},`,
    "",
    `Thank you for getting in touch on ${longDate(i.reportedOn)} about ${about}. I am sorry you have had cause to raise this, and I want you to know we are taking it seriously.`,
    "",
    `We have recorded your ${what} under the reference ${i.reference}. We are now looking into it: we will speak to the staff involved and check our records, and we may contact you if there is anything we need to ask.`,
    "",
    i.kind === "complaint" && i.completeBy
      ? `We aim to send you our full written response by ${longDate(i.completeBy)}. If it is going to take longer we will tell you why and when to expect it, and we will keep you updated in the meantime.`
      : `We will come back to you with what we have found and what we are doing about it${i.completeBy ? ` by ${longDate(i.completeBy)}` : ""}, and we will keep you updated in the meantime.`,
    "",
    `If you would like to add anything, or to talk it through, please ${i.phone ? `call us on ${i.phone} or ` : ""}reply to this letter, quoting the reference above.`,
  ];
  if (i.kind === "complaint") {
    lines.push(
      "",
      "If you are not satisfied once you have our response, you can ask the Local Government and Social Care Ombudsman to look at it. We will send their details with our response.",
    );
  }
  lines.push("", "Yours sincerely,", "", ...(i.senderName ? [i.senderName] : []), i.organisationName);
  return {
    subject: `Your ${what}${i.aboutName ? ` about ${firstName(i.aboutName)}'s care` : ""} — our reference ${i.reference}`,
    body: lines.join("\n"),
  };
}
