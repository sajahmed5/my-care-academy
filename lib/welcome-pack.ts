import { parseBody } from "@/lib/signing-documents";

/**
 * The welcome pack a new starter is emailed when they're hired (RECRUITMENT.md,
 * release 6), brought across from MyRoster's welcomePack.ts: the company's
 * welcome guide and who to ring. MyRoster's second guide, to its carer app,
 * has no counterpart here; the guide says where their training is instead.
 *
 * The default is neutral, shared by every company, so it says nothing about
 * pay days, uniform or anything one company decides for itself. Each company
 * edits its own under Recruitment → Settings.
 */

export interface WelcomeContact { label: string; name: string; phone: string; email: string; hours: string }

export const MAX_CONTACTS = 8;
export const MAX_GUIDE_CHARS = 12000;

export const WELCOME_FIELDS: Array<{ field: string; meaning: string }> = [
  { field: "firstName", meaning: "the new starter's first name" },
  { field: "companyName", meaning: "your company name" },
  { field: "startDate", meaning: "their start date, from when you sent their documents to sign" },
];

export const DEFAULT_WELCOME_GUIDE = `## Welcome to {{companyName}}

Hi {{firstName}}, welcome to the team. We're really pleased you're joining us. Your start date is {{startDate}}.

This guide covers the things new starters ask us most. Keep it somewhere you can find it.

## Your training

- Your training is on My Care Academy. Sign in with the same email and password you used for your application.
- Start with the courses at the top of your list: they're your induction, and you need them before you work on your own.
- You won't be sent anywhere on your own until your training and shadowing are done and you feel ready. If you're not sure about something, ask. Nobody minds.

## On every visit

- Arrive on time, and read the care plan before you start: it tells you who the person is, what matters to them and what they need from you.
- Stay for the time your contract sets out. If the person doesn't need everything on the list, use the time to talk with them.
- Record what you did before you leave: tasks, medication and your notes. If it isn't written down, we can't show it happened.
- Treat the person's home, belongings and choices with respect. It's their home, not our workplace.

## If something is wrong

- Running late, lost or can't get in: ring the office straight away. Don't leave without telling us.
- Someone is unwell, has fallen or seems different from normal: ring 999 if it's an emergency, then ring the office.
- Worried that someone is being harmed or neglected: tell the office the same day. You'll never be in trouble for raising a concern.
- You made a mistake, for example with medication: tell us at once. Telling us quickly is what keeps people safe.

## Looking after yourself and us

- If you're ill and can't work, ring the office yourself, with the notice your contract asks for where you can and always before your first visit. A text or a message isn't enough.
- Ask for holiday with the notice your contract asks for.
- What you see and hear in people's homes is confidential. Don't post about work or the people you support on social media.
- Don't accept gifts or money, and never give your own phone number to the people you support.

## Who to contact

The numbers are at the bottom of this email. Save them in your phone today.`;

export function sanitiseContacts(raw: unknown): WelcomeContact[] {
  const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return (Array.isArray(raw) ? raw : [])
    .map((c) => {
      const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { label: line(r.label, 60), name: line(r.name, 80), phone: line(r.phone, 40), email: line(r.email, 120), hours: line(r.hours, 80) };
    })
    .filter((c) => c.label && (c.phone || c.email))
    .slice(0, MAX_CONTACTS);
}

export interface WelcomeValues { firstName: string; companyName: string; startDate: string }

const FIELD = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
export const mergeWelcome = (guide: string, v: WelcomeValues) =>
  guide.replace(FIELD, (whole, name: string) => {
    const value = (v as unknown as Record<string, string>)[name];
    return typeof value === "string" && value.trim() ? value : whole;
  });

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The email: the guide, then who to contact. The company's name at the top, My Care Academy in the footer. */
export function welcomeHtml(args: { guide: string; contacts: WelcomeContact[]; values: WelcomeValues; signInUrl: string }): string {
  const { guide, contacts, values, signInUrl } = args;
  const blocks = parseBody(mergeWelcome(guide, values))
    .map((b) =>
      b.type === "heading"
        ? `<h2 style="color:#0f172a;font-size:17px;margin:22px 0 8px">${esc(b.text)}</h2>`
        : b.type === "list"
          ? `<ul style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 14px;padding-left:22px">${b.items.map((i) => `<li style="margin:0 0 4px">${esc(i)}</li>`).join("")}</ul>`
          : `<p style="color:#1e293b;font-size:15px;line-height:1.6;margin:0 0 14px">${esc(b.text)}</p>`,
    )
    .join("");
  const people = contacts.length
    ? `<h2 style="color:#0f172a;font-size:17px;margin:22px 0 8px">Who to contact</h2>${contacts
        .map(
          (c) => `<p style="color:#1e293b;font-size:15px;line-height:1.5;margin:0 0 12px"><strong>${esc(c.label)}</strong>${c.name ? `: ${esc(c.name)}` : ""}${
            c.phone ? `<br><a href="tel:${esc(c.phone.replace(/\s+/g, ""))}" style="color:#0f766e">${esc(c.phone)}</a>` : ""
          }${c.email ? `<br><a href="mailto:${esc(c.email)}" style="color:#0f766e">${esc(c.email)}</a>` : ""}${c.hours ? `<br><span style="color:#64748b">${esc(c.hours)}</span>` : ""}</p>`,
        )
        .join("")}`
    : "";
  return `<div style="background:#f8fafc;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <div style="border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:8px"><p style="color:#1e293b;margin:0;font-size:22px;font-weight:700">${esc(values.companyName)}</p></div>
    ${blocks}
    <p style="margin:18px 0"><a href="${esc(signInUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Start your training</a></p>
    ${people}
  </div>
  <p style="max-width:600px;margin:12px auto 0;color:#64748b;font-size:12px;text-align:center">Sent for ${esc(values.companyName)} by My Care Academy.</p>
</div>`;
}
