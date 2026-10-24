/**
 * The questions on each stage of a complaint.
 *
 * Five forms, each tied to a stage kind:
 *
 *   complaint_form     what was raised, by whom, and about what.
 *   meeting_minutes    Triage, Findings or Follow-up, by the stage's number.
 *   action_plan        an issue's plan — findings and actions, no meeting.
 *   monitoring_review  did the plan work, and is it resolved.
 *   acknowledgement    not a form: the letter, and the date it went.
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

export const complaintFormSchema: StageForm = {
  sections: [
    {
      id: "complaint",
      title: "What was raised",
      order: 1,
      questions: [
        { id: "cf_date", text: "Date of the complaint or concern", type: "date", required: true },
        { id: "cf_complainant", text: "Who raised it", type: "text", required: true },
        {
          id: "cf_relationship",
          text: "What they are to the service",
          type: "select",
          options: [
            { value: "client", label: "The person receiving care" },
            { value: "family", label: "A relative or representative" },
            { value: "social_worker", label: "A social worker or commissioner" },
            { value: "staff", label: "A member of staff" },
            { value: "other", label: "Someone else" },
          ],
        },
        { id: "cf_about", text: "Who the care was for", type: "text" },
        {
          id: "cf_nature",
          text: "What it is about",
          type: "select",
          required: true,
          options: [
            { value: "carer", label: "A member of care staff" },
            { value: "office", label: "The office or a manager" },
            { value: "service", label: "The service as a whole" },
            { value: "other", label: "Something else" },
          ],
        },
        { id: "cf_details", text: "What was said, in their own words as far as possible", type: "long_text", required: true },
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
        { id: "cf_staff", text: "Staff it is about", type: "multiselect", optionsSource: "staff" },
        { id: "cf_desired", text: "What they would like to see happen", type: "long_text" },
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
        { id: "mm1_when_received", text: "When it reached us", type: "date" },
      ],
    },
    {
      id: "decide",
      title: "Decisions",
      order: 2,
      questions: [
        {
          id: "tri_type",
          text: "This is",
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
    default:
      return null;
  }
}
