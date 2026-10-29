import {
  sanitiseWith,
  validateSection,
  type Answers,
  type FieldError,
  type FormField,
  type FormSection,
} from "@/lib/recruitment-application";

/**
 * The interview record (RECRUITMENT.md, release 4) — filled in by the office
 * as the interview runs; the candidate never sees it. Brought across from
 * MyRoster's src/lib/recruitment/interviewForm.ts (its second set of values
 * questions, 3 Oct 2026) with one change Saj made on 29 Oct 2026: notes on
 * every question, then ONE overall score at the end, not a score per answer.
 *
 * We recruit on values: each values question asks for a real example, and
 * the notes are the evidence the offer letter is written from — so "good
 * answer" is no use; what they actually did and said is.
 */

export interface InterviewQuestion {
  id: string;
  text: string;
  lookFor?: string;
  /** The value a values question is evidence for. */
  value?: string;
  /** Things the interviewer can say to help a candidate who is stuck. */
  prompts?: string[];
}

export const INTERVIEW_OUTCOMES = ["Successful", "Unsuccessful", "On hold"] as const;
export const OVERALL_SCORES = ["1 · Poor", "2 · Below what we need", "3 · Acceptable", "4 · Good", "5 · Excellent"];

export const VALUES_QUESTIONS: InterviewQuestion[] = [
  {
    id: "w1", value: "Compassion", text: "What made you decide that caring was the right job for you?",
    lookFor: "A real reason and a real person or moment behind it, not “I like helping people”. Their application answer is shown above.",
    prompts: ["Was there a person or a moment that made you think of care work?", "Have you looked after someone in your family, or a neighbour?", "What do you enjoy about helping people?"],
  },
  {
    id: "w2", value: "Compassion", text: "Tell me about a time you noticed someone needed help, even though they did not ask you. What did you do?",
    lookFor: "Noticed without being asked; thought about how the other person felt; acted, and did not just feel sorry.",
    prompts: ["It can be family, a neighbour, someone at work or a stranger.", "How did you know they needed help?", "What did you do first?", "How were they afterwards?"],
  },
  {
    id: "w3", value: "Integrity", text: "Tell me about a time you had to speak up about something that was not right. What did you do?",
    lookFor: "Spoke to the right person rather than staying quiet or gossiping; honest even when it was awkward.",
    prompts: ["It can be at work, at school or at home: something unsafe, unfair or dishonest.", "Who did you tell?", "Was it hard to say?", "What happened next?"],
  },
  {
    id: "w4", value: "Reliability and commitment", text: "Tell me about a time someone depended on you. How did you make sure you were there for them?",
    lookFor: "Turned up; planned ahead; put someone else's need before their own convenience.",
    prompts: ["It can be a child, a parent, a friend or the people you worked with.", "What did you have to change or give up to be there?", "What would have happened if you had not been?"],
  },
  {
    id: "w5", value: "Learning and working together", text: "Tell me about something you found difficult at first. How did you learn to do it better?",
    lookFor: "Asked for help or practised; takes feedback without defensiveness; can name what they do differently now.",
    prompts: ["It can be a job, a skill, a language, driving or cooking.", "Who helped you?", "What did you do differently the next time?"],
  },
  {
    id: "w6", value: "Learning and working together", text: "Tell me about a time something did not go as planned. What did you do?",
    lookFor: "Stayed calm; dealt with the most important thing first; told someone who needed to know; did not hide it.",
    prompts: ["For example running late, something breaking, or someone not turning up.", "What did you do first?", "Who did you tell?", "What would you do next time?"],
  },
];

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { id: "q1", text: "Tell me about yourself." },
  { id: "q2", text: "Why do you want to work in care?" },
  { id: "q3", text: "What do you think it takes to be a good carer?" },
  { id: "q4", text: "What are your biggest strengths?" },
  { id: "q5", text: "Are you a team player?" },
  { id: "q6", text: "How do you handle confidentiality?", lookFor: "Does not discuss service users outside work; need-to-know; records kept safe." },
  { id: "q7", text: "Describe a time when you were under pressure, and how you coped." },
  { id: "q8", text: "What would you do if you thought another carer was taking money from a service user?", lookFor: "Reports to the office straight away; does not confront or investigate; records facts." },
  { id: "q9", text: "What action would you take if you suspected abuse was taking place?", lookFor: "Safeguarding: make the person safe, report to the office immediately, record, do not promise to keep secrets." },
  { id: "q10", text: "What would you do if you thought you were going to be late for a visit?", lookFor: "Rings the office before the visit time so the service user can be told." },
  { id: "q11", text: "If you could not get into a service user's home, what would you do?", lookFor: "Knocks, rings, looks through windows, rings the office; never just leaves." },
  { id: "q12", text: "If a service user asked you to do extra tasks that are not in the care plan (for example to take them shopping privately), what would you do?", lookFor: "Politely declines, explains it must go through the office, reports the request." },
  { id: "q13", text: "If someone offered you a gift, what would you do?", lookFor: "Declines politely; reports to the office; knows the gifts policy." },
  { id: "q14", text: "If you found that medication had not been given or taken, what would you do?", lookFor: "Does not double-dose; rings the office; records on the MAR chart." },
  { id: "q15", text: "If you went into a service user's home and found them on the floor, what would you do?", lookFor: "Does not move them; checks for response and injury; calls 999 if needed; rings the office; stays with them." },
];

const notesFor = (questions: InterviewQuestion[], prefix: string): FormField[] =>
  questions.map((q, i) => ({
    id: `${q.id}Notes`,
    label: `${prefix}${i + 1}. ${q.text}`,
    type: "longtext" as const,
    required: true,
    help: q.lookFor ? `Listen for: ${q.lookFor}` : undefined,
  }));

export const INTERVIEW_SECTIONS: FormSection[] = [
  {
    id: "ivDetails",
    title: "The interview",
    fields: [
      { id: "interviewDate", label: "Date of interview", type: "date", required: true },
      { id: "interviewers", label: "Interviewed by", type: "text", required: true, help: "Everyone who was in the room." },
      { id: "heldHow", label: "Held", type: "select", options: ["In the office", "By video", "By phone"], required: true },
      { id: "idSeen", label: "I saw the candidate's original ID and right-to-work documents at interview.", type: "checkbox" },
    ],
  },
  {
    id: "ivValues",
    title: "Values",
    intro: "Ask for a REAL example each time and write down what they actually did and said: these notes are what the offer letter is written from.",
    fields: notesFor(VALUES_QUESTIONS, "V"),
  },
  {
    id: "ivQuestions",
    title: "Questions",
    intro: "Write down what the candidate said, in their words where you can.",
    fields: notesFor(INTERVIEW_QUESTIONS, ""),
  },
  {
    id: "ivHistory",
    title: "Employment history",
    fields: [
      { id: "gapsDiscussed", label: "Breaks in employment, and reasons for leaving earlier care jobs: what was discussed?", type: "longtext", required: true, help: "Write \u201cnone\u201d if there were no breaks and no earlier care jobs." },
    ],
  },
  {
    id: "ivOutcome",
    title: "Score and outcome",
    fields: [
      { id: "overallScore", label: "Overall score", type: "select", options: OVERALL_SCORES, required: true },
      { id: "outcome", label: "Outcome", type: "select", options: [...INTERVIEW_OUTCOMES], required: true },
      { id: "outcomeNotes", label: "Reasons for the decision", type: "longtext", required: true },
    ],
  },
];

export function validateInterview(answers: Answers, todayIso: string): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of INTERVIEW_SECTIONS) {
    const errors = validateSection(s, answers, todayIso);
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

export const sanitiseInterview = (raw: unknown): Answers => sanitiseWith(INTERVIEW_SECTIONS, raw);

/** "4 · Good" → 4. */
export function overallScore(answers: Answers): number | null {
  const n = Number(String(answers.overallScore ?? "").slice(0, 1));
  return n >= 1 && n <= 5 ? n : null;
}
