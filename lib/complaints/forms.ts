/**
 * The questions on each stage of a complaint.
 *
 * The forms, each tied to a stage kind:
 *
 *   complaint_form     what was raised, by whom, and about what.
 *   meeting_minutes    Triage, Findings or Follow-up, by the stage's number.
 *   action_plan        an issue's plan — findings and actions, no meeting.
 *   monitoring_review  did the plan work, and is it resolved.
 *   acknowledgement    not a form: the letter, and the date it went.
 *   accident_report    an accident: what happened, who was hurt, first aid.
 *   near_miss_report   a near miss: what happened, and what would have.
 *   incident_actions   after either: why, and what will stop it again.
 *   sg_*               safeguarding's six: safe, council, CQC, police,
 *                      the council's enquiry, lessons learned.
 *
 * Question ids are prefixed by their stage (cf_, mm1_, mm2_, mm3_, mr_) and
 * are the keys answers are stored under, so they are never renamed — a tidier
 * id would orphan every answer already saved.
 *
 * Where a question is required is the whole argument of the file. Safeguarding
 * and duty of candour are asked at Findings and are required there, not at
 * Triage, because whether either applies is a judgement on the facts and the
 * facts are not in at Triage. Asking early gets a guess recorded as a
 * decision; not asking at all is how a provider finds it never decided.
 */

import type { StageForm } from "./schema";

/** "What it is about": asked on Record one and kept on the Complaint Form. */
export const COMPLAINT_NATURES = [
  { value: "carer", label: "A member of care staff" },
  { value: "office", label: "The office or a manager" },
  { value: "service", label: "The service as a whole" },
  { value: "other", label: "Something else" },
];

export const complaintFormSchema: StageForm = {
  sections: [
    {
      id: "complaint",
      title: "What was raised",
      order: 1,
      questions: [
        { id: "cf_date", text: "Date raised", type: "date", required: true },
        { id: "cf_complainant", text: "Raised by", type: "text", required: true },
        {
          id: "cf_relationship",
          text: "Role",
          type: "select",
          options: [
            { value: "client", label: "The person receiving care" },
            { value: "family", label: "A relative or representative" },
            { value: "social_worker", label: "A social worker or commissioner" },
            { value: "staff", label: "A member of staff" },
            { value: "other", label: "Someone else" },
          ],
        },
        { id: "cf_about", text: "Service user", type: "text" },
        {
          id: "cf_nature",
          text: "What it is about",
          type: "select",
          required: true,
          options: COMPLAINT_NATURES,
        },
        { id: "cf_details", text: "Detailed description", type: "long_text", required: true },
        {
          id: "cf_source",
          text: "How it reached us",
          type: "select",
          options: [
            { value: "phone", label: "Phone call" },
            { value: "email", label: "Email" },
            { value: "letter", label: "Letter" },
            { value: "in_person", label: "In person" },
            { value: "survey", label: "Survey or review" },
            { value: "other", label: "Other" },
          ],
        },
        { id: "cf_desired", text: "Desired outcome", type: "long_text" },
        { id: "cf_recorded_by", text: "Recorded by", type: "text" },
      ],
    },
  ],
};

export const triageSchema: StageForm = {
  sections: [
    {
      id: "concern",
      title: "Triage — what has been raised",
      order: 1,
      description:
        "The first look: what this is, and who looks into it. Fact-finding only — whether it needs a safeguarding referral or the duty of candour is decided at Findings, once the facts are in.",
      questions: [
        { id: "mm1_date", text: "Date of triage", type: "date", required: true },
        { id: "mm1_attendees", text: "Who took part", type: "multiselect", optionsSource: "staff", required: true },
        { id: "mm1_issue", text: "The concern, in a few lines", type: "long_text", required: true },
        { id: "mm1_involved", text: "Staff involved", type: "multiselect", optionsSource: "staff" },
        { id: "mm1_when_received", text: "Date raised", type: "date" },
      ],
    },
    {
      id: "decide",
      title: "Decisions",
      order: 2,
      questions: [
        {
          id: "tri_type",
          text: "Type",
          type: "select",
          required: true,
          options: [
            { value: "issue", label: "An issue — put right and recorded" },
            { value: "complaint", label: "A complaint — investigated, with a written response" },
            { value: "safeguarding", label: "A safeguarding concern" },
          ],
        },
        {
          id: "tri_immediate",
          text: "Anything done straight away to keep the person safe or put it right",
          type: "long_text",
        },
      ],
    },
  ],
};

export const findingsSchema: StageForm = {
  sections: [
    {
      id: "review",
      title: "Findings — review the evidence",
      order: 1,
      questions: [
        { id: "mm2_date", text: "Date of meeting", type: "date", required: true },
        { id: "mm2_attendees", text: "Who took part", type: "multiselect", optionsSource: "staff", required: true },
        { id: "mm2_staff_attended", text: "Did any of the staff named attend?", type: "yes_no" },
        {
          id: "mm2_staff",
          text: "Which of them",
          type: "multiselect",
          optionsSource: "staff",
          showWhen: { questionId: "mm2_staff_attended", equals: true },
        },
        { id: "mm2_statement", text: "What the staff member said — summary", type: "long_text" },
        { id: "mm2_records_review", text: "Care records and daily notes — findings", type: "long_text" },
        { id: "mm2_spotcheck_review", text: "Spot checks and competency — findings", type: "long_text" },
        { id: "mm2_training_review", text: "Training records — gaps identified", type: "long_text" },
        { id: "mm2_findings", text: "Overall findings", type: "long_text", required: true },
      ],
    },
    {
      id: "duties",
      title: "Safeguarding and duty of candour",
      order: 2,
      description:
        "Asked here, not at Triage: by Findings the facts are in. Regulation 16 expects both to be decided and recorded, each with its reason.",
      questions: [
        {
          id: "tri_safeguarding",
          text: "Does this need a safeguarding referral to the local authority?",
          type: "yes_no",
          required: true,
        },
        { id: "tri_safeguarding_reason", text: "Why, or why not", type: "long_text", required: true },
        {
          id: "tri_candour",
          text: "Does the duty of candour apply? (someone came to serious or lasting harm)",
          type: "yes_no",
          required: true,
        },
        { id: "tri_candour_reason", text: "Why, or why not", type: "long_text", required: true },
      ],
    },
  ],
};

export const followUpSchema: StageForm = {
  sections: [
    {
      id: "close",
      title: "Follow-up — confirm and close",
      order: 1,
      questions: [
        { id: "mm3_date", text: "Date of meeting", type: "date", required: true },
        { id: "mm3_attendees", text: "Who took part", type: "multiselect", optionsSource: "staff", required: true },
        { id: "mm3_actions_complete", text: "Are all the agreed actions complete?", type: "yes_no", required: true },
        { id: "mm3_actions_detail", text: "Where the actions stand", type: "long_text" },
        {
          id: "mm3_prevention",
          text: "What we will do going forward to stop this happening again",
          type: "long_text",
          required: true,
        },
        { id: "mm3_satisfied", text: "Is the team satisfied the matter is resolved?", type: "yes_no", required: true },
        {
          id: "mm3_outstanding",
          text: "What remains outstanding",
          type: "long_text",
          showWhen: { questionId: "mm3_satisfied", equals: false },
        },
        { id: "mm3_summary", text: "Summary and conclusion", type: "long_text", required: true },
      ],
    },
  ],
};

export const actionPlanSchema: StageForm = {
  sections: [
    {
      id: "plan",
      title: "Action plan",
      order: 1,
      description:
        "An issue has no Findings meeting, so its findings sit here, above the actions they lead to.",
      questions: [
        { id: "ap_date", text: "Date the plan was agreed", type: "date", required: true },
        { id: "ap_agreed_by", text: "Agreed by", type: "multiselect", optionsSource: "staff", required: true },
        { id: "ap_summary", text: "What was found, and what is being put in place", type: "long_text", required: true },
      ],
    },
  ],
};

export const monitoringReviewSchema: StageForm = {
  sections: [
    {
      id: "review",
      title: "Monitoring review",
      order: 1,
      questions: [
        { id: "mr_date", text: "Date of review", type: "date", required: true },
        { id: "mr_reviewed_by", text: "Reviewed by", type: "text", required: true },
        { id: "mr_actions_done", text: "Have the agreed actions been completed?", type: "yes_no", required: true },
        {
          id: "mr_what_changed",
          text: "What has changed since the plan was put in place",
          type: "long_text",
          required: true,
        },
        { id: "mr_evidence", text: "Evidence looked at (spot checks, records, feedback)", type: "long_text" },
        { id: "mr_resolved", text: "Is the issue resolved?", type: "yes_no", required: true },
        {
          id: "mr_next_steps",
          text: "If not resolved: what happens next",
          type: "long_text",
          showWhen: { questionId: "mr_resolved", equals: false },
        },
        {
          id: "mr_next_review",
          text: "Next review date",
          type: "date",
          showWhen: { questionId: "mr_resolved", equals: false },
        },
      ],
    },
  ],
};

/**
 * An accident: what happened, who was hurt and how, and the first aid given.
 * Ids are prefixed ar_ and never renamed, as above.
 */
export const accidentReportSchema: StageForm = {
  sections: [
    {
      id: "accident",
      title: "What happened",
      order: 1,
      questions: [
        { id: "ar_date", text: "Date it happened", type: "date", required: true },
        { id: "ar_time", text: "About what time", type: "text" },
        { id: "ar_where", text: "Where it happened", type: "text", required: true, help: "The client's home and which room, the street, the office…" },
        { id: "ar_what", text: "What happened", type: "long_text", required: true },
        { id: "ar_witnesses", text: "Who saw it", type: "text" },
      ],
    },
    {
      id: "hurt",
      title: "Who was hurt, and how",
      order: 2,
      questions: [
        {
          id: "ar_who",
          text: "Who was hurt",
          type: "select",
          required: true,
          options: [
            { value: "client", label: "The person receiving care" },
            { value: "staff", label: "A member of staff" },
            { value: "visitor", label: "A relative or visitor" },
            { value: "other", label: "Someone else" },
          ],
        },
        { id: "ar_who_name", text: "Their name", type: "text" },
        { id: "ar_injuries", text: "Their injuries", type: "long_text", required: true, help: "Where on the body, and how bad. \"None seen\" is an answer." },
        { id: "ar_first_aid", text: "Was first aid given?", type: "yes_no", required: true },
        {
          id: "ar_first_aid_detail",
          text: "What first aid, and by whom",
          type: "long_text",
          showWhen: { questionId: "ar_first_aid", equals: true },
        },
        {
          id: "ar_treatment",
          text: "Further treatment",
          type: "select",
          required: true,
          options: [
            { value: "none", label: "None needed" },
            { value: "gp", label: "GP or 111" },
            { value: "ambulance", label: "Ambulance called, treated at home" },
            { value: "hospital", label: "Taken to hospital" },
          ],
        },
        { id: "ar_family_told", text: "Were the family or next of kin told?", type: "yes_no" },
      ],
    },
    {
      id: "riddor",
      title: "RIDDOR",
      order: 3,
      description:
        "Some injuries must be reported to the Health and Safety Executive. The questions below are the ones that decide it; the reminder at the top of the record says what applies.",
      questions: [
        {
          id: "ar_specified",
          text: "Was it a specified injury?",
          type: "yes_no",
          required: true,
          help: "A fracture other than to fingers, thumbs or toes; an amputation; loss of sight; a crush injury to the head or body; a serious burn; scalping; or loss of consciousness from a head injury or lack of air.",
        },
        {
          id: "ar_off_work",
          text: "Is the member of staff off work, or unable to do their normal job?",
          type: "select",
          showWhen: { questionId: "ar_who", equals: "staff" },
          options: [
            { value: "no", label: "No" },
            { value: "up_to_7", label: "Yes, for up to 7 days so far" },
            { value: "over_7", label: "Yes, for more than 7 days" },
          ],
        },
        {
          id: "ar_work_related",
          text: "Did it arise from the work — how care was given, the equipment, or the place?",
          type: "yes_no",
          help: "For a client or visitor, RIDDOR applies only when the accident came from the work, not from, say, a fall that nothing about the care caused.",
        },
        { id: "ar_riddor", text: "Is it reportable to the HSE under RIDDOR?", type: "yes_no", required: true },
        { id: "ar_riddor_why", text: "Why, or why not", type: "long_text", required: true },
        {
          id: "ar_riddor_date",
          text: "Date reported to the HSE",
          type: "date",
          required: true,
          showWhen: { questionId: "ar_riddor", equals: true },
        },
        {
          id: "ar_riddor_ref",
          text: "HSE reference",
          type: "text",
          showWhen: { questionId: "ar_riddor", equals: true },
        },
      ],
    },
  ],
};

/** A near miss: what happened, and what would have. Ids prefixed nm_. */
export const nearMissReportSchema: StageForm = {
  sections: [
    {
      id: "near_miss",
      title: "What happened",
      order: 1,
      questions: [
        { id: "nm_date", text: "Date it happened", type: "date", required: true },
        { id: "nm_where", text: "Where it happened", type: "text", required: true },
        { id: "nm_what", text: "What happened", type: "long_text", required: true },
        { id: "nm_would_have", text: "What would have happened if it had not been caught", type: "long_text", required: true },
        { id: "nm_caught", text: "What stopped it", type: "long_text" },
      ],
    },
  ],
};

/**
 * After an accident or a near miss: why it happened and what will stop it
 * happening again. The actions themselves, and any training, sit under the
 * form, each with an owner and a date. Ids prefixed ia_.
 */
export const incidentActionsSchema: StageForm = {
  sections: [
    {
      id: "actions",
      title: "Actions and training",
      order: 1,
      questions: [
        { id: "ia_cause", text: "Why it happened", type: "long_text", required: true },
        { id: "ia_prevent", text: "What will stop it happening again", type: "long_text", required: true },
        { id: "ia_plans", text: "Does a risk assessment or care plan need updating?", type: "yes_no", required: true },
        {
          id: "ia_plans_detail",
          text: "Which, and who is updating it",
          type: "long_text",
          showWhen: { questionId: "ia_plans", equals: true },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Safeguarding (20261029213200). Six stages, each a decision someone made and
// can be asked about: whether to refer, notify, or call the police is a
// yes/no with a reason either way, and "yes" asks for the date and the
// reference that prove it happened. The site files nothing itself.
// ---------------------------------------------------------------------------

/** "Why not", asked when the answer to a needed? question is No. */
const whyNot = (id: string, on: string) =>
  ({ id, text: "Why not", type: "long_text", required: true, showWhen: { questionId: on, equals: false } }) as const;

export const sgImmediateSchema: StageForm = {
  sections: [
    {
      id: "safe",
      title: "Keeping them safe",
      order: 1,
      description: "First, and before anything else is written down: is the person safe now?",
      questions: [
        { id: "sgi_date", text: "Date", type: "date", required: true },
        { id: "sgi_risk", text: "What the risk is, and to whom", type: "long_text", required: true },
        { id: "sgi_actions", text: "What was done straight away to keep them safe", type: "long_text", required: true },
        { id: "sgi_wishes", text: "What the person wants to happen", type: "long_text", help: "Making safeguarding personal: their views, in their words where possible." },
        { id: "sgi_staff", text: "Was a member of staff stopped from working with them, or suspended?", type: "yes_no", required: true },
        {
          id: "sgi_staff_detail",
          text: "Who, and what was put in place",
          type: "long_text",
          showWhen: { questionId: "sgi_staff", equals: true },
        },
        { id: "sgi_family_told", text: "Were the family or representative told?", type: "yes_no" },
      ],
    },
  ],
};

export const sgReferralSchema: StageForm = {
  sections: [
    {
      id: "referral",
      title: "Referral to the council's safeguarding team",
      order: 1,
      questions: [
        { id: "sgr_needed", text: "Does this need a referral to the council's safeguarding team?", type: "yes_no", required: true },
        whyNot("sgr_why_not", "sgr_needed"),
        { id: "sgr_council", text: "Which council", type: "text", required: true, showWhen: { questionId: "sgr_needed", equals: true } },
        { id: "sgr_date", text: "Date referred", type: "date", required: true, showWhen: { questionId: "sgr_needed", equals: true } },
        { id: "sgr_reference", text: "The council's reference", type: "text", showWhen: { questionId: "sgr_needed", equals: true } },
        {
          id: "sgr_how",
          text: "How it was made",
          type: "select",
          showWhen: { questionId: "sgr_needed", equals: true },
          options: [
            { value: "phone", label: "Phone" },
            { value: "online", label: "Online form" },
            { value: "email", label: "Email" },
          ],
        },
        { id: "sgr_contact", text: "Who we spoke to", type: "text", showWhen: { questionId: "sgr_needed", equals: true } },
      ],
    },
  ],
};

export const sgCqcSchema: StageForm = {
  sections: [
    {
      id: "cqc",
      title: "CQC notification",
      order: 1,
      description:
        "Regulation 18 of the CQC (Registration) Regulations 2009: abuse, or an allegation of abuse, is notified to CQC without delay.",
      questions: [
        { id: "sgc_needed", text: "Does CQC need to be notified?", type: "yes_no", required: true },
        whyNot("sgc_why_not", "sgc_needed"),
        { id: "sgc_date", text: "Date notified", type: "date", required: true, showWhen: { questionId: "sgc_needed", equals: true } },
        { id: "sgc_reference", text: "CQC's reference", type: "text", showWhen: { questionId: "sgc_needed", equals: true } },
      ],
    },
  ],
};

export const sgPoliceSchema: StageForm = {
  sections: [
    {
      id: "police",
      title: "Police",
      order: 1,
      description: "If someone is in immediate danger, call 999 first.",
      questions: [
        { id: "sgp_needed", text: "Might a crime have happened?", type: "yes_no", required: true },
        whyNot("sgp_why_not", "sgp_needed"),
        { id: "sgp_date", text: "Date reported to the police", type: "date", required: true, showWhen: { questionId: "sgp_needed", equals: true } },
        { id: "sgp_reference", text: "Crime reference", type: "text", showWhen: { questionId: "sgp_needed", equals: true } },
        { id: "sgp_officer", text: "Officer or station", type: "text", showWhen: { questionId: "sgp_needed", equals: true } },
      ],
    },
  ],
};

export const sgEnquirySchema: StageForm = {
  sections: [
    {
      id: "enquiry",
      title: "The council's enquiry",
      order: 1,
      description:
        "Under Section 42 of the Care Act 2014 the council decides whether to make an enquiry. This stays open until they say how it ended.",
      questions: [
        {
          id: "sge_route",
          text: "What the council did",
          type: "select",
          required: true,
          options: [
            { value: "s42", label: "A Section 42 enquiry" },
            { value: "other", label: "Another enquiry or action" },
            { value: "none", label: "No further action at referral" },
            { value: "not_referred", label: "Not referred (see Council Referral)" },
          ],
        },
        { id: "sge_date", text: "Date of the outcome", type: "date", required: true },
        {
          id: "sge_finding",
          text: "Was the concern found to be true?",
          type: "select",
          options: [
            { value: "substantiated", label: "Substantiated" },
            { value: "partly", label: "Partly substantiated" },
            { value: "not", label: "Not substantiated" },
            { value: "inconclusive", label: "Inconclusive" },
          ],
        },
        { id: "sge_outcome", text: "What the council concluded, and asked of us", type: "long_text", required: true },
      ],
    },
  ],
};

export const sgLessonsSchema: StageForm = {
  sections: [
    {
      id: "lessons",
      title: "Lessons learned",
      order: 1,
      questions: [
        { id: "sgl_lessons", text: "What we learned", type: "long_text", required: true },
        { id: "sgl_shared", text: "How it was shared with the team", type: "long_text" },
        {
          id: "sgl_removed",
          text: "Was anyone dismissed, or removed from working with people, because they harmed or put someone at risk?",
          type: "yes_no",
          required: true,
          help: "If so, the Safeguarding Vulnerable Groups Act 2006 says a referral must be made to the DBS — including when they resigned first.",
        },
        {
          id: "sgl_dbs_date",
          text: "Date of the DBS barring referral",
          type: "date",
          required: true,
          showWhen: { questionId: "sgl_removed", equals: true },
        },
      ],
    },
  ],
};

/**
 * Which of the three meetings a stage is, read from its name.
 *
 * The stages were "Meeting Minutes 1/2/3" and are now Triage, Findings and
 * Follow-up. A company that renamed one, or kept the old name, must land in
 * the same place, so both spellings are read — and the number is checked
 * before the word, because "Meeting Minutes 3" contains no word at all.
 */
export function meetingNumber(stageName: string): 1 | 2 | 3 {
  if (/\b3\b|follow/i.test(stageName)) return 3;
  if (/\b2\b|finding/i.test(stageName)) return 2;
  return 1;
}

/** What the office calls a meeting stage, whichever name the row carries. */
export function meetingLabel(stageName: string): string {
  if (!/^meeting minutes \d$/i.test(stageName.trim())) return stageName;
  return ["Triage", "Findings", "Follow-up"][meetingNumber(stageName) - 1];
}

/** The schema for a meeting stage, by its name. */
export function meetingSchema(stageName: string): StageForm {
  const n = meetingNumber(stageName);
  return n === 3 ? followUpSchema : n === 2 ? findingsSchema : triageSchema;
}

/** The form a stage opens, or null when it is not a form stage. */
export function formForStage(stage: { name: string; kind: string }): StageForm | null {
  switch (stage.kind) {
    case "complaint_form":
      return complaintFormSchema;
    case "meeting_minutes":
      return meetingSchema(stage.name);
    case "action_plan":
      return actionPlanSchema;
    case "monitoring_review":
      return monitoringReviewSchema;
    case "accident_report":
      return accidentReportSchema;
    case "near_miss_report":
      return nearMissReportSchema;
    case "incident_actions":
      return incidentActionsSchema;
    case "sg_immediate":
      return sgImmediateSchema;
    case "sg_referral":
      return sgReferralSchema;
    case "sg_cqc":
      return sgCqcSchema;
    case "sg_police":
      return sgPoliceSchema;
    case "sg_enquiry":
      return sgEnquirySchema;
    case "sg_lessons":
      return sgLessonsSchema;
    default:
      return null;
  }
}
