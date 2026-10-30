/**
 * The documents a candidate reads and signs in stage 4 (RECRUITMENT.md,
 * release 6): role acceptance (several parts, signed one after another), the
 * contract and the refund of training agreement. Brought across from
 * MyRoster's signingDocuments.ts, with its rota and carer-app references made
 * neutral, the job title a merge field, and two parts left out: "Information
 * for pay" (bank details: My Care Academy doesn't run payroll) and the Mileage
 * Form (one company's travel arrangement).
 *
 * THE WORDING IS A TEMPLATE. Pay, hours, holiday, notice and the rest are each
 * company's own terms, left as [blanks in square brackets]. A manager fills
 * them in under Settings → Recruitment → Documents to sign, and nothing can be sent to a
 * candidate while a blank remains. Every save is a new version, and a signed
 * copy keeps the exact wording that was signed. It is a draft for the company
 * to approve, not legal advice.
 *
 * Pure. Body format: "## " heading, "- " bullet, blank line between
 * paragraphs, {{mergeField}}.
 */

export type SigningDocKey = "role_acceptance" | "contract" | "refund_training";
/** The same keys as their steps in lib/recruitment.ts. */
export const SIGNING_DOC_KEYS: SigningDocKey[] = ["role_acceptance", "contract", "refund_training"];

export interface SigningPart {
  id: string;
  title: string;
  body: string;
  /** May be declined instead of signed (the working time opt-out must be voluntary). */
  optional?: boolean;
  declineLabel?: string;
}

export interface SigningDocument {
  key: SigningDocKey;
  title: string;
  /** The company signs too. */
  countersigned: boolean;
  parts: SigningPart[];
}

export const MERGE_FIELDS: Array<{ field: string; meaning: string }> = [
  { field: "candidateName", meaning: "the candidate's full name" },
  { field: "companyName", meaning: "your company's name" },
  { field: "position", meaning: "the job, as on their offer letter" },
  { field: "today", meaning: "the date the documents are sent" },
  { field: "startDate", meaning: "their start date, entered when you send the documents" },
  { field: "address", meaning: "their home address, from their application" },
];

const ROLE_PARTS: SigningPart[] = [
  {
    id: "jobDescription", title: "Job description",
    body: `## {{position}}: job description

Accountable to: the Registered Manager. Working hours: flexible, including evenings, weekends and bank holidays.

Essential: the Care Certificate, or working towards it. No previous experience is required.

## What the job is

To provide care in line with each person's care plan, our policies and procedures, and the law — so that the people we support can stay safely and comfortably in their own homes.

## Main tasks

- Helping people to wash, bathe, shower, shave, dress and undress, and with toileting and continence care, always protecting their dignity.
- Helping people in and out of bed and to move around safely, using equipment you have been trained to use.
- Prompting or assisting with prescribed medication, as set out in the care plan and our medication policy, and recording it.
- Preparing meals, snacks and drinks the person likes, and helping them to eat and drink where needed.
- Light household tasks: cleaning, laundry, ironing, emptying bins, shopping where it is in the care plan.
- Day, evening, night-sitting and sleep-in visits as required.
- Recording every visit accurately in the care records, including the times you arrive and leave.
- Reporting any concern about a person's health, safety or wellbeing to the office straight away.
- Keeping your training up to date.

You may be asked to carry out other reasonable duties. The role may change as the needs of the service change.

I have read and understood this job description.`,
  },
  {
    id: "codeOfConduct", title: "Code of conduct",
    body: `## {{companyName}} Code of Conduct

This is how everyone who works for {{companyName}} is expected to behave. It follows the national Code of Conduct for Healthcare Support Workers and Adult Social Care Workers in England (Skills for Care and Skills for Health), and says what each of its seven standards means in the homes of the people we support. It applies on every visit, and it sits alongside your contract and the Employee Handbook.

If you are ever unsure what to do, stop and ring the office. Asking is never the wrong answer.

## 1. Be accountable for what you do, and for what you leave undone

- Only carry out tasks that are in the care plan and that you have been trained and signed off to do. If you have not been trained, say so and ring the office.
- Record the time you arrive and leave every visit, and stay for the time your contract sets out for each visit.
- Tell the office straight away about anything that could affect your ability to work safely, including your own health.
- Keep professional boundaries. You are there as their carer, not as a friend, a lender or a customer.
- Never accept money, loans, gifts or hospitality from the people we support or their families, and never offer them. Tell the office if something is offered.
- Never take on private work for someone we support.
- Report anything you or a colleague has done, or not done, that could put someone at risk. If you do not feel listened to, use the whistleblowing procedure in the Handbook. You will not be treated badly for raising a genuine concern.

## 2. Protect people's privacy, dignity, rights, health and wellbeing

- Treat every person with respect and compassion, in their home and on their terms.
- Ask for consent before you give any care, every time, and respect a person's right to say no. Record a refusal and tell the office.
- Support people to do what they can for themselves, and to make their own choices.
- Keep people covered, doors and curtains closed, and personal care private.
- Notice changes: in mood, skin, eating, drinking, mobility or the home. Record them and report them the same day.
- Never abuse, neglect, harm or exploit anyone. Report any sign of abuse or neglect to the office immediately, whoever is responsible.
- Take every comment and complaint seriously and pass it to the office.

## 3. Work with your colleagues to give safe, high quality, compassionate care

- Be reliable. Turn up to the visits on your rota, on time. If you cannot, ring the office yourself as early as you can so the visit can be covered.
- On a double-up visit, work as a team and never move a person alone when the care plan says two people.
- Treat colleagues, families, nurses, social workers and other professionals with respect.
- Hand over clearly, so the next person knows what has happened.

## 4. Communicate openly and well

- Explain what you are about to do and check the person is happy before you carry on.
- Write clear, accurate, respectful notes in the care records at every visit: what you did, how the person was, and anything that changed. Notes are a legal record and families may read them.
- Record medication at the time you give or prompt it. Never record something you did not do.
- Report concerns to the office at once. Do not wait for the next visit or leave it for someone else.
- Speak to the person, not over them, and use the language and name they prefer.

## 5. Respect confidentiality

- What you see and hear in a person's home stays private. Do not discuss the people we support with your family, friends or other clients, or on social media.
- Never take or share photographs of a person or their home, except where the company asks you to as part of your work.
- Keep key safe codes, addresses and care records secure, and never share your logins.
- If you are unsure whether you should share something, ask the office first. If someone is at risk of harm, you must tell the office: that is never a breach of confidentiality.

## 6. Keep improving through training and development

- Complete your induction, the Care Certificate and all mandatory training, and keep them up to date.
- Take part in supervisions, spot checks and appraisals, and act on feedback.
- Ask for training when you feel unsure. Help new colleagues who are shadowing you.

## 7. Uphold equality, diversity and inclusion

- Respect each person's culture, religion, language, identity and way of life, and those of your colleagues.
- Never discriminate, and do not stay silent when others do. Report it to the office.
- Give every person the same standard of care.

## While you are at work

- Wear your uniform and photo ID badge on every visit, and follow our infection control and hygiene rules.
- Do not smoke or vape in or outside a person's home, and never work under the influence of alcohol or drugs.
- Use your phone only for work during a visit.
- Do not bring children, friends, relatives or pets to a visit.
- Do not use a person's belongings, food, phone or money for yourself. Handle a person's money only as the care plan sets out, with a receipt and a record every time.
- Look after people's keys and property as carefully as you would your own.

## If this code is not followed

A breach of this code may be dealt with under the disciplinary procedure in the Employee Handbook. A serious breach, such as abuse, theft, falsifying records or working under the influence of alcohol or drugs, may be treated as gross misconduct. Where the law requires it, we will refer the matter to the Disclosure and Barring Service, the local authority safeguarding team or the police.

I have read and understood the {{companyName}} Code of Conduct, and I agree to follow it at all times in my work.`,
  },
  {
    id: "workingTime", title: "Working time — 48 hour opt-out", optional: true, declineLabel: "I don't want to opt out",
    body: `## Working Time Regulations — opt-out agreement

The law says you cannot be made to work more than 48 hours a week on average. You can choose to opt out of that limit. This is your choice: you do not have to sign this, you will not be treated any differently if you don't, and it has no effect on your offer of employment.

If you sign: I agree that I may work more than an average of 48 hours a week. If I change my mind, I will give {{companyName}} at least two weeks' notice in writing to end this agreement.

A copy is kept on your personal file.`,
  },
  {
    id: "uniform", title: "Uniform and ID badge",
    body: `## Uniform and ID badge

I understand that {{companyName}} will give me a uniform and a photo ID badge, and that I must wear them at all times on shift unless a manager agrees otherwise. The ID badge is how the people we care for know who I am: wearing it is a condition of my employment.

The uniform and badge remain the property of {{companyName}} and I will return them when my employment ends. If I do not, the company may recover their cost ([cost of the uniform] for the uniform, [cost of the badge] for the badge) from my final pay, provided that this never takes my pay below the National Minimum Wage.`,
  },
  {
    id: "deductions", title: "Authority to make deductions",
    body: `## Authority to make deductions from wages

I agree that the following are terms of my contract of employment, and I authorise {{companyName}} to make these deductions from my pay. No deduction will ever take my pay below the National Minimum Wage for the pay period; any balance would be recovered from later pay or repaid by me.

- Holiday: if I leave having taken more holiday than I have earned, the excess will be deducted from my final pay.
- Uniform and ID badge: the cost of any not returned when I leave ([cost of the uniform] uniform, [cost of the badge] badge).
- Property and equipment: the cost of company property I do not return when I leave.
- Loss or damage: all or part of the cost of loss or damage caused by my carelessness or negligence, including any insurance excess.
- Training costs: as set out in my Refund of Training Agreement.
- Fines: parking or motoring fines I incur while working.
- Overpayments: any overpayment of wages or expenses.`,
  },
  {
    id: "handbook", title: "Staff handbook",
    body: `## Staff handbook

I confirm that I have been given access to the {{companyName}} Employee Handbook and that I will read it before I start work. I understand that it contains the rules, policies and procedures that apply to my employment, including the disciplinary, grievance and sickness procedures.

I confirm that everything I have told {{companyName}} during my application is true to the best of my knowledge.`,
  },
];

const CONTRACT_BODY = `## Statement of Main Terms of Employment

This statement, dated {{today}}, sets out the main terms on which {{companyName}} ("the Company") employs {{candidateName}}, of {{address}} ("you"). There are no collective agreements affecting your employment. Any change to these terms will be confirmed to you in writing within one month.

## Start date

This contract takes effect on {{startDate}}, and your continuous employment with the Company counts from that date. No employment before it counts towards it.

## Probation

You are on probation for your first [length of probation], during which your performance and conduct are assessed. The Company may extend this. During probation either of us may end your employment by giving the notice set out under "Notice".

## Job title and place of work

You are employed as a {{position}}. You may be asked to carry out other reasonable duties. You will travel to and work in the homes of the people we support, and accompany them in the community.

## DBS and safeguarding checks

Your employment is conditional on a satisfactory enhanced DBS check, and on satisfactory checks whenever the Company asks for them again. You must co-operate fully with these. If you are registered with the DBS Update Service you agree to the Company checking your certificate online while you work for us. The Company may also ask you to obtain a basic check from the Disclosure and Barring Service.

You must tell your manager immediately if you are questioned, arrested, charged, cautioned or convicted in connection with any criminal matter, if you are suspended by another employer, or if any allegation is made against you, inside or outside work, that could affect the safety of children or adults at risk. A child is anyone under 18. Failing to do so may lead to disciplinary action, including dismissal.

## Right to work in the UK

If your right to work in the UK is time-limited, the Company will repeat its checks as the law requires. You must keep the Company up to date with any immigration application or appeal and give us copies of any new documents.

## Driving

If you drive for work you must hold a valid licence, keep your vehicle taxed, insured for business use and roadworthy, and let the Company check your driving record when asked. You must tell us immediately if you are no longer entitled to drive or have a medical condition or medication that may affect your driving.

## Hours of work

The Company guarantees to offer you at least [guaranteed weekly hours] hours of work each week, averaged over each calendar month (the same period you are paid for). You agree to be available for that work at the times you gave us as your availability, and to tell us in good time if your availability changes. Hours above [guaranteed weekly hours] are offered when work is available and are not guaranteed.

If, in a calendar month, the Company does not offer you [guaranteed weekly hours] hours a week on average at times within your availability, you will be paid for the shortfall at your basic rate. Hours you turn down, swap away, or miss through unauthorised absence count as hours offered.

Your hours vary with the needs of the people we support, including evenings, weekends and bank holidays. Rotas are issued in advance. We will give you as much notice as we reasonably can of any change, and you may be asked to cover for colleagues at short notice. You are entitled to rest breaks under the Working Time Regulations 1998.

## Pay

Your basic rate of pay is [basic hourly rate] an hour. You are paid [how often, on which day and for which period].

## Travel time and mileage

[How travel time and mileage are paid: whether travel is paid inside the visit or separately, the mileage rate if there is one, and what is paid when a visit is cancelled at short notice.]

Travel between your home and your first and last visit of the day is not paid.

Whichever option you are on, your pay for a pay period will never be less than the National Minimum Wage for all your working time, including travel between visits.

[Which bank and public holidays are paid at a higher rate, and the rate. If none, say that they are paid at your basic rate.]

The Company may deduct from your pay any sum you owe it, as set out in your Authority to Make Deductions. No deduction will take your pay below the National Minimum Wage for the pay period.

If you cannot work because of police bail conditions or an order of a court or regulator, that period is unpaid.

## Holidays

The holiday year runs from [start and end of the holiday year]. You are entitled to 5.6 weeks' paid holiday a year: 20 days plus the 8 bank and public holidays, for someone working five days a week. If you work fewer days your entitlement is in proportion, and in your first year you earn it at one twelfth for each month worked. Because carers work bank holidays as ordinary days, your 8 bank holiday days are taken as holiday at other times agreed with the office.

[Any extra holiday for long service. Delete this line if there is none.]

A week's holiday pay is your average weekly pay, worked out from the hours you actually worked over the previous 52 weeks in which you were paid (or over the weeks you have worked, if fewer).

Holiday must be approved in advance by the office, with at least [notice needed for holiday] notice. Where too many people ask for the same dates, holiday is granted first come, first served. Holiday cannot be carried into the next year except where the law requires it. You continue to earn holiday during sickness absence and family leave.

When you leave you are paid for holiday earned and not taken. If you have taken more than you have earned, the difference is deducted from your final pay.

## Sickness

You are paid Statutory Sick Pay when you qualify for it. The Company does not pay sick pay above Statutory Sick Pay. You must follow the sickness reporting procedure in the Employee Handbook. You must telephone your local office yourself — a text or message is not enough — at least [notice of sickness] before the visit wherever you can, so that your visits can be covered; if you become ill with less warning than that, telephone as soon as you know and in any case before your first visit. The Company may ask you to see a doctor of its choice or to agree to a report from your own doctor.

## Pension

The Company operates a pension scheme with [pension provider] that meets the automatic enrolment rules. You will be enrolled if you qualify. You may opt out; details are available from the office.

## Training

You must complete induction training, including the Care Certificate, before working alone, and keep all mandatory training up to date. The Company pays for mandatory training. Your Refund of Training Agreement sets out when part of the cost of your induction is repayable if you leave.

## Notice

During probation, after one month's service: one week's notice from either of us. After probation: you must give [notice the employee gives]; the Company will give you [notice the Company gives], and never less than the law requires (one week for each complete year of service, up to a maximum of twelve weeks). The Company may dismiss without notice for gross misconduct, may pay you in lieu of notice, and may ask you not to work during your notice period.

## Disciplinary, appeals and grievances

The disciplinary rules and procedure are in the Employee Handbook. If you are unhappy with a disciplinary decision you may appeal to a Director. If you have a grievance about your employment, raise it with your line manager; the procedure is in the Handbook.

## Other work

You must not do other work during your hours with us. You need the Company's written consent (which will not be unreasonably withheld) to work for another care provider or in any role that could conflict with your duties to us, and you must tell us your hours elsewhere so that we can meet our working time duties.

## Confidentiality

You must never disclose confidential information about the Company, the people we support or their families, during or after your employment, except as your job requires or the law demands. Records, documents and equipment belong to the Company and must be returned when asked and when you leave.

## Uniform

The Company provides a uniform which you must wear on duty. It is replaced free of charge for fair wear and tear. It must be returned when you leave, as set out in your role acceptance documents.

## Monitoring and your data

The Company may monitor its phones, email and systems for work purposes. Any call monitoring or care records system the Company uses may record the time and location at which you arrive at and leave each visit, so that we can show care was delivered safely. The Company processes your personal data as set out in its staff privacy notice, which is in the Employee Handbook.

## Declaration

I have read and accept this statement, the Employee Handbook and the documents I signed when accepting my role. I agree that the holiday section of this statement is a "relevant agreement" for the purposes of the Working Time Regulations 1998.`;

const REFUND_BODY = `## Agreement for refund of training fees

This agreement is an addendum to your Statement of Main Terms of Employment with {{companyName}}.

The Company will pay for your induction training. The cost to the Company is [cost of induction training].

The purpose of this agreement is to let you take training that benefits both you and the Company, which the Company pays for on the understanding that you will repay part of the cost if you leave soon afterwards.

## If you do not complete the training

If you do not start the course once it has been paid for, do not complete it, or leave the Company during it, you will repay the full cost. The Company may waive all or part of this at its discretion.

## If you leave after completing the training

If your employment ends for any reason after you complete the course, the amount repayable depends on how many hours you have worked for the Company since completing it:

- fewer than 150 hours worked: 100%
- 150 hours or more, but fewer than 300: 75%
- 300 hours or more, but fewer than 450: 50%
- 450 hours or more, but fewer than 600: 25%
- 600 hours or more: nothing to repay

Hours worked are taken from the Company's visit records.

## How it is repaid

The amount becomes due when your employment ends and is deducted from your final pay. A deduction will never take your pay below the National Minimum Wage for that pay period; any balance remains owed by you and is repayable within 28 days, or by instalments agreed in writing with the Company.

## Declaration

I have read, understood and accept this agreement. I authorise the Company to deduct the amount set out above from my pay, including my final pay, and I agree to repay any balance.`;

export const DEFAULT_SIGNING_DOCUMENTS: Record<SigningDocKey, SigningDocument> = {
  role_acceptance: { key: "role_acceptance", title: "Role acceptance", countersigned: false, parts: ROLE_PARTS },
  contract: { key: "contract", title: "Contract", countersigned: true, parts: [{ id: "contract", title: "Statement of main terms of employment", body: CONTRACT_BODY }] },
  refund_training: { key: "refund_training", title: "Refund of training agreement", countersigned: true, parts: [{ id: "refund", title: "Refund of training agreement", body: REFUND_BODY }] },
};

// ─── The company's own wording ──────────────────────────────────────────────

/** A company's saved wording for one part. */
export interface WordingOverride { docKey: string; partId: string; version: number; body: string }
export type DocumentInForce = SigningDocument & { versions: Record<string, number> };

/** The wording in force: the company's latest version of each part, else ours (version 0). */
export function documentsInForce(overrides: WordingOverride[]): Record<SigningDocKey, DocumentInForce> {
  const out = {} as Record<SigningDocKey, DocumentInForce>;
  for (const key of SIGNING_DOC_KEYS) {
    const def = DEFAULT_SIGNING_DOCUMENTS[key];
    const versions: Record<string, number> = {};
    const parts = def.parts.map((p) => {
      const latest = overrides.filter((o) => o.docKey === key && o.partId === p.id).sort((a, b) => b.version - a.version)[0];
      versions[p.id] = latest?.version ?? 0;
      return latest ? { ...p, body: latest.body } : p;
    });
    out[key] = { ...def, parts, versions };
  }
  return out;
}

/** A blank the company still has to fill in, such as "[basic hourly rate]". Never a {{merge field}}. */
const BLANK = /\[[^[\]\n]{2,240}\]/g;
export const blanksIn = (body: string): string[] => [...new Set(body.match(BLANK) ?? [])];

export interface MergeValues { candidateName: string; companyName: string; position: string; today: string; startDate: string; address: string }

const FIELD = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Merge fields this text uses that are empty for this candidate, or that we don't know. */
export function missingFields(body: string, values: MergeValues): string[] {
  const missing = new Set<string>();
  for (const m of body.matchAll(FIELD)) {
    const v = (values as unknown as Record<string, string>)[m[1]];
    if (v === undefined) missing.add(`{{${m[1]}}} isn't a field we know`);
    else if (!v.trim()) missing.add(m[1]);
  }
  return [...missing];
}

export function mergeBody(body: string, values: MergeValues): string {
  return body.replace(FIELD, (whole, name: string) => {
    const v = (values as unknown as Record<string, string>)[name];
    return typeof v === "string" && v.trim() ? v : whole;
  });
}

/** One line of address, from the application's answers. */
export const addressFromApplication = (a: Record<string, unknown> | null | undefined): string =>
  ["address1", "address2", "city", "postcode"].map((k) => String(a?.[k] ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");

export type Block = { type: "heading" | "paragraph"; text: string } | { type: "list"; items: string[] };

/** "## heading", "- bullet", blank-line paragraphs: blocks the pages render. */
export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) { blocks.push({ type: "paragraph", text: para.join(" ") }); para = []; }
      if (list.length) { blocks.push({ type: "list", items: list }); list = []; }
    };
    for (const line of lines) {
      if (line.startsWith("## ")) { flush(); blocks.push({ type: "heading", text: line.slice(3).trim() }); }
      else if (line.startsWith("- ")) { if (para.length) flush(); list.push(line.slice(2).trim()); }
      else { if (list.length) flush(); para.push(line); }
    }
    flush();
  }
  return blocks;
}

// ─── A candidate's copy ─────────────────────────────────────────────────────

/** What is frozen onto a candidate's copy when it is sent: the text they read IS the text they sign. */
export interface SnapshotPart { id: string; title: string; body: string; version: number; optional: boolean; declineLabel?: string }
export interface PartState { signedAt?: string; signedName?: string; dataUrl?: string; declined?: boolean }
export interface CompanySignature { dataUrl: string; signedName: string; signedTitle: string; signedAt: string }
export interface Snapshot { title: string; countersigned: boolean; parts: SnapshotPart[] }

export function snapshotFor(doc: DocumentInForce, values: MergeValues): Snapshot {
  return {
    title: doc.title,
    countersigned: doc.countersigned,
    parts: doc.parts.map((p) => ({
      id: p.id,
      title: p.title,
      body: mergeBody(p.body, values),
      version: doc.versions[p.id] ?? 0,
      optional: p.optional === true,
      declineLabel: p.declineLabel,
    })),
  };
}

export const partDone = (s: PartState | undefined) => !!s && (s.declined === true || (!!s.signedAt && !!s.dataUrl));
export const allPartsDone = (snap: Snapshot, state: Record<string, PartState>) => snap.parts.every((p) => partDone(state[p.id]));

/** What stops the documents being sent: blanks in the wording, or a field we can't fill for this candidate. */
export function sendProblems(docs: DocumentInForce[], values: MergeValues): string[] {
  const out: string[] = [];
  for (const d of docs) {
    for (const p of d.parts) {
      const blanks = blanksIn(p.body);
      if (blanks.length) out.push(`${d.title}, ${p.title}: a manager needs to fill in ${blanks.join(", ")} under Settings → Documents to sign.`);
      const missing = missingFields(p.body, values);
      if (missing.length) out.push(`${d.title}, ${p.title}: we don't have ${missing.join(", ")} for them.`);
    }
  }
  return out;
}

/** A signature is a PNG data URL, and not an enormous one. */
export const validSignature = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("data:image/png;base64,") && v.length > 200 && v.length < 300_000;
