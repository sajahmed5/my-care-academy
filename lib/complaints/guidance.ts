/**
 * "What to do": how the company handles a concern, to hand to a client, a
 * council or CQC. Brought across from MyRoster (src/lib/complaintGuidance.ts)
 * on 29 Oct 2026 and made the company's own: MyRoster's names one
 * provider's policy numbers and its local councils, and this site serves many
 * providers. The councils listed are the ones on the company's client list;
 * the timescales are this site's (3 working days to acknowledge, 28 to
 * respond), aligned to Regulation 16 (receiving and acting on complaints)
 * and Regulation 20 (duty of candour).
 *
 * Pure: the PDF renders it.
 */

export interface GuidanceStep {
  title: string;
  points: string[];
}

export interface ComplaintGuidance {
  title: string;
  intro: string[];
  timescales: { label: string; value: string }[];
  steps: GuidanceStep[];
  safeguarding: string[];
  doNotInvestigate: string[];
  escalation: string[];
  contacts: { name: string; detail: string }[];
}

export function complaintGuidance(organisationName: string, councils: string[] = []): ComplaintGuidance {
  return {
    title: `How ${organisationName} handles complaints and concerns`,
    intro: [
      "Every complaint and concern is treated seriously, sensitively and in confidence. It tells us about the quality of our care, and it can be the first sign that someone is at risk.",
      "We aim to put things right with the person who raised it, and to learn from it so it does not happen again. We follow the Care Quality Commission's guidance and that of the Local Government and Social Care Ombudsman.",
      "A formal or serious complaint is looked into by someone not involved in what it is about.",
    ],
    timescales: [
      { label: "Acknowledge", value: "Within 3 working days, telling you who is looking into it" },
      { label: "Our full response", value: "Within 28 days. If we need longer, we will tell you in writing why, and when to expect it" },
      { label: "Updates", value: "If the council or you need to know where we have got to before then, we send an interim update" },
      { label: "Time limit", value: "A complaint should normally be made within 12 months of what happened, or of you finding out about it" },
    ],
    steps: [
      {
        title: "1. We record it",
        points: [
          "Every concern is recorded, however it reaches us — by phone, letter, email, in person or through our online form.",
          "We decide what it is: a complaint, a safeguarding concern, an issue to put right, an accident or a near miss. Each has its own process.",
        ],
      },
      {
        title: "2. We acknowledge it",
        points: ["Within 3 working days, in writing, with our reference and the name of who is looking into it."],
      },
      {
        title: "3. We look into it",
        points: [
          "We speak to the staff involved and take their account in writing.",
          "We look at the care records, our own checks on the carers who support you, their training, and any earlier concerns.",
          "We keep you updated while we do.",
        ],
      },
      {
        title: "4. We decide what we found",
        points: [
          "On each thing you raised, we say whether we found it to be true, partly true or not — and why.",
          "We agree what will change, and who is responsible, by when.",
        ],
      },
      {
        title: "5. Duty of candour",
        points: [
          "Where someone has come to serious or lasting harm, we tell them (or their family) as soon as we can, apologise, explain what happened and what we will do, and confirm it in writing (Regulation 20).",
        ],
      },
      {
        title: "6. Our response",
        points: [
          "A letter setting out how we looked into it, what we found, what we have done or will do, and your right to go to the Ombudsman if you are not satisfied.",
        ],
      },
      {
        title: "7. We follow it up",
        points: [
          "We check that what we agreed has been done and is working, and record what we learned.",
          "Complaints are reviewed together regularly, so patterns are spotted and acted on.",
        ],
      },
    ],
    safeguarding: [
      "If a concern suggests someone may be being abused or neglected, we act first to keep them safe.",
      "We refer it to the council's safeguarding team the same day, and notify the Care Quality Commission.",
      "If a crime may have happened, we tell the police. If anyone is in immediate danger, call 999.",
      "The council decides whether to make an enquiry under Section 42 of the Care Act 2014, and we work with them.",
      "If someone is removed from working with people because they caused harm, we refer them to the Disclosure and Barring Service.",
    ],
    doNotInvestigate: [
      "A member of staff's complaint about their own employment, which goes through our grievance procedure.",
      "A complaint made in person or by phone and put right to your satisfaction by the next working day. It is still recorded.",
      "A complaint already looked into and resolved.",
    ],
    escalation: [
      "If you are not happy with our response, you can take your complaint to the Local Government and Social Care Ombudsman — a free, independent service. They usually ask that we have had the chance to put things right first.",
      "The Care Quality Commission regulates us. It cannot look into individual complaints, but it welcomes information about any service at any time.",
      "If you would like help to make or pursue a complaint, we can put you in touch with an independent advocate.",
    ],
    contacts: [
      ...councils.map((c) => ({ name: c, detail: "Adult social care and safeguarding" })),
      { name: "Care Quality Commission", detail: "03000 616161 · www.cqc.org.uk" },
      { name: "Local Government and Social Care Ombudsman", detail: "0300 061 0614 · www.lgo.org.uk" },
    ],
  };
}
