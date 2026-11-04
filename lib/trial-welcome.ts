import { emailButton, emailLayout, emailLinkFallback, esc } from "./email-layout";
import { SETUP_LINK_DAYS } from "./account-setup";
import { TRIAL_DAYS } from "./trial";
import { formatDate } from "./dates";

/**
 * The welcome a person gets when they're set up on a free trial
 * (ACCOUNT-ACCESS.md, mock-up 7): the trial's dates, their role, who else is
 * in, a 14-day "Set up your account" button, and three things to try first.
 * A link, never a password (Saj, 4 Nov 2026). Replies come to us.
 */

const longDate = { weekday: "long", day: "numeric", month: "long" } as const;

export interface TrialWelcome {
  /** "Priya Shah"; the email uses the first name. */
  name: string;
  email: string;
  orgName: string;
  /** "manager" or "office worker". */
  roleLabel: string;
  /** The trial's first day, yyyy-mm-dd UK, when they're set up with the company; null when joining one already running. */
  startsKey: string | null;
  /** Today, yyyy-mm-dd UK. */
  todayKey: string;
  endsAt: Date;
  /** Everyone else in, as "Tom Reid" + "office worker". */
  others: { name: string; roleLabel: string }[];
  setupLink: string;
}

function article(roleLabel: string): string {
  return /^[aeiou]/i.test(roleLabel) ? `an ${roleLabel}` : `a ${roleLabel}`;
}

function others(list: TrialWelcome["others"], joining: boolean): string {
  if (list.length === 0) return "";
  const named = list.map((o) => `${esc(o.name)} (${esc(o.roleLabel)})`);
  const joined = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return joining ? ` Also here: ${joined}.` : ` ${joined} ${list.length === 1 ? "has" : "have"} been invited too.`;
}

export function trialWelcomeEmail(w: TrialWelcome): { subject: string; html: string } {
  const first = esc(w.name.trim().split(/\s+/)[0] || "there");
  const org = esc(w.orgName);
  const ends = esc(formatDate(w.endsAt, longDate));
  const joining = w.startsKey === null;
  const startsToday = !joining && w.startsKey! <= w.todayKey;
  const starts = joining || startsToday ? "today" : `on ${formatDate(`${w.startsKey}T12:00:00Z`, longDate)}`;

  const subject = joining
    ? `You've joined ${w.orgName}'s free trial of My Care Academy`
    : `Your ${TRIAL_DAYS}-day My Care Academy trial starts ${starts}`;
  const heading = joining
    ? `Welcome, ${first}: you've joined ${org}'s free trial`
    : `Welcome, ${first}: your free trial starts ${esc(starts)}`;
  const html = emailLayout({
    heading,
    body: `<p>${org} has everything My Care Academy does until the end of <strong>${ends}</strong>. Nothing to pay, and no card needed.</p>
      <p>You're set up as ${esc(article(w.roleLabel))}.${others(w.others, joining)}</p>
      <p>You sign in with <strong>${esc(w.email)}</strong>. Press the button to choose your password.</p>
      ${emailButton(w.setupLink, "Set your password and start")}
      <p style="margin:0 0 8px;font-weight:600">Three things to try first</p>
      <ol style="margin:0 0 16px;padding-left:20px">
        <li>Add two or three of your carers.</li>
        <li>Assign them the mandatory training.</li>
        <li>Open Today to see who's due what.</li>
      </ol>
      <p style="color:#587070;font-size:13px">The button keeps working for ${SETUP_LINK_DAYS} days, until you've signed in. If it has stopped working, use "Forgot your password?" on the sign-in page, or reply and we'll sort it.</p>
      ${emailLinkFallback(w.setupLink)}
      <p>Any questions, just reply to this email.<br>Saj, My Care Academy</p>`,
    footer: "My Care Academy — you're receiving this because a free trial was set up for your company.",
  });
  return { subject, html };
}
