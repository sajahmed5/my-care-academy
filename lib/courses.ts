/**
 * The live course catalogue. Shared by every marketing page that lists or
 * counts courses, so a new course is added in one place and the count can
 * never drift from the list (it used to say 26 beside a list of 59).
 *
 * Titles, topics, minutes and renewal periods are the `courses` table's as of
 * 30 Oct 2026; each summary is that course's description with the learner-
 * facing "awareness only" caveats left off — /training/courses says it once
 * for the clinical courses instead. Kept here rather than read from the
 * database so the public pages stay static.
 */

export type CourseTopic =
  | "Care Fundamentals"
  | "Safeguarding"
  | "Health & Safety"
  | "Infection & Clinical"
  | "Governance & Records"
  | "Person & Service Quality";

export interface CatalogueCourse {
  title: string;
  slug: string;
  topic: CourseTopic;
  minutes: number;
  /** Months until a refresher is due. */
  renewMonths: number;
  summary: string;
  /** The Care Certificate standard this course covers the knowledge of. */
  careCertificate?: number;
}

/** In the order the learner app shows the topics. */
export const COURSE_TOPICS: CourseTopic[] = [
  "Care Fundamentals",
  "Safeguarding",
  "Health & Safety",
  "Infection & Clinical",
  "Governance & Records",
  "Person & Service Quality",
];

export const COURSE_CATALOGUE: CatalogueCourse[] = [
  { title: "Accident & Incident Reporting", slug: "accident-and-incident-reporting", topic: "Health & Safety", minutes: 19, renewMonths: 12, summary: "Recording and reporting accidents, incidents and near misses accurately and promptly, including RIDDOR." },
  { title: "Allergen Awareness", slug: "allergen-awareness", topic: "Infection & Clinical", minutes: 21, renewMonths: 12, summary: "The 14 allergens, Natasha's Law, safe practice, and recognising and responding to an allergic reaction." },
  { title: "Anxiety Awareness", slug: "anxiety-awareness", topic: "Care Fundamentals", minutes: 21, renewMonths: 12, summary: "Anxiety and anxiety disorders: the signs, supporting someone through a panic attack, and encouraging them to get help." },
  { title: "Awareness of Learning Disability and Autism", slug: "learning-disability-and-autism", topic: "Care Fundamentals", minutes: 24, renewMonths: 12, careCertificate: 16, summary: "Learning disability and autism, reasonable adjustments and the law. Not a substitute for the Oliver McGowan Mandatory Training." },
  { title: "Awareness of Mental Health and Dementia", slug: "mental-health-and-dementia", topic: "Care Fundamentals", minutes: 24, renewMonths: 12, careCertificate: 9, summary: "Mental health conditions and dementia, supporting people well, and recognising delirium." },
  { title: "Basic Life Support (BLS)", slug: "basic-life-support-bls", topic: "Infection & Clinical", minutes: 20, renewMonths: 12, summary: "Recognising an emergency and performing CPR and the recovery position while help is on the way." },
  { title: "Behaviour that Challenges", slug: "behaviours-that-challenge", topic: "Person & Service Quality", minutes: 22, renewMonths: 12, summary: "Distress and unmet need, de-escalation, and keeping everyone safe when behaviour challenges." },
  { title: "Care Planning", slug: "care-planning", topic: "Person & Service Quality", minutes: 24, renewMonths: 12, summary: "Contributing to, following and reviewing person-centred care plans: assessment, outcomes, involvement, capacity and accurate records." },
  { title: "Catheter Care", slug: "catheter-care", topic: "Infection & Clinical", minutes: 23, renewMonths: 12, summary: "Urinary catheter care and preventing infection." },
  { title: "Communication Skills", slug: "communication-skills", topic: "Care Fundamentals", minutes: 24, renewMonths: 12, summary: "Communicating effectively and sensitively with the people you support, their families and the care team." },
  { title: "Complaints Handling", slug: "complaints-handling", topic: "Person & Service Quality", minutes: 22, renewMonths: 12, summary: "Receiving and responding to complaints positively, and using them to improve the service." },
  { title: "Concussion Awareness", slug: "concussion-awareness", topic: "Health & Safety", minutes: 23, renewMonths: 12, summary: "Recognising the signs of concussion and head injury, the emergency red flags, and the basic response." },
  { title: "Conflict Resolution", slug: "conflict-resolution", topic: "Person & Service Quality", minutes: 18, renewMonths: 12, summary: "Preventing and safely de-escalating conflict and challenging behaviour in care settings." },
  { title: "Continence Care", slug: "continence-care", topic: "Infection & Clinical", minutes: 22, renewMonths: 12, summary: "Promoting continence and delivering dignified, person-centred continence care." },
  { title: "COSHH", slug: "coshh", topic: "Health & Safety", minutes: 20, renewMonths: 12, summary: "Working safely with hazardous substances under the Control of Substances Hazardous to Health regulations." },
  { title: "Depression Awareness", slug: "depression-awareness", topic: "Care Fundamentals", minutes: 22, renewMonths: 12, summary: "Recognising the signs of depression, supporting someone, and responding to risk." },
  { title: "Diabetes Awareness", slug: "diabetes-awareness", topic: "Infection & Clinical", minutes: 22, renewMonths: 12, summary: "Supporting people living with diabetes, and recognising and responding to hypo and hyper emergencies." },
  { title: "Drugs and Alcohol Awareness", slug: "drugs-and-alcohol-awareness", topic: "Health & Safety", minutes: 21, renewMonths: 12, summary: "The effects of drugs and alcohol, supporting people without judgement, recognising emergencies and following workplace policy." },
  { title: "Duty of Candour", slug: "duty-of-candour", topic: "Governance & Records", minutes: 22, renewMonths: 12, summary: "Being open and honest when things go wrong: CQC Regulation 20 and the professional duty." },
  { title: "Duty of Care", slug: "duty-of-care", topic: "Care Fundamentals", minutes: 22, renewMonths: 12, summary: "What duty of care means in practice, balancing it with a person's rights, and handling dilemmas and complaints." },
  { title: "Dyslexia Awareness", slug: "dyslexia-awareness", topic: "Care Fundamentals", minutes: 22, renewMonths: 12, summary: "How dyslexia affects people, recognising the signs, and practical adjustments for the people you support and colleagues." },
  { title: "Eating Disorders Awareness", slug: "eating-disorders", topic: "Care Fundamentals", minutes: 21, renewMonths: 12, summary: "Types of eating disorder, warning signs, common myths, and supporting someone with dignity." },
  { title: "End of Life Care", slug: "end-of-life-care", topic: "Person & Service Quality", minutes: 21, renewMonths: 12, summary: "Palliative and end of life care: comfort, dignity and the person's wishes in their last months and days." },
  { title: "Epilepsy Awareness", slug: "epilepsy-awareness", topic: "Infection & Clinical", minutes: 24, renewMonths: 12, summary: "Understanding epilepsy, giving safe seizure first aid, and recognising emergencies." },
  { title: "Equality, Diversity & Inclusion", slug: "equality-diversity-and-inclusion", topic: "Care Fundamentals", minutes: 20, renewMonths: 12, summary: "Promoting equality, valuing diversity and working inclusively, in line with the Equality Act 2010." },
  { title: "Fire Safety", slug: "fire-safety", topic: "Health & Safety", minutes: 23, renewMonths: 12, summary: "Preventing fire, understanding the fire triangle, and knowing what to do if a fire breaks out." },
  { title: "First Aid Awareness", slug: "first-aid-awareness", topic: "Infection & Clinical", minutes: 23, renewMonths: 12, summary: "Responding to common first-aid situations safely while waiting for help, within your role." },
  { title: "Fluids and Nutrition", slug: "fluids-and-nutrition", topic: "Care Fundamentals", minutes: 21, renewMonths: 12, careCertificate: 8, summary: "Helping people eat and drink enough: hydration, malnutrition, swallowing difficulties and person-centred mealtimes." },
  { title: "Food Hygiene & Nutrition", slug: "food-hygiene-and-nutrition", topic: "Infection & Clinical", minutes: 22, renewMonths: 12, summary: "Preparing food safely and supporting good nutrition and hydration for the people you support." },
  { title: "Health & Safety", slug: "health-and-safety", topic: "Health & Safety", minutes: 20, renewMonths: 12, summary: "Your responsibilities under the Health and Safety at Work Act, risk assessment and safe working." },
  { title: "Infection Prevention & Control", slug: "infection-prevention-and-control", topic: "Infection & Clinical", minutes: 23, renewMonths: 12, summary: "Breaking the chain of infection through hand hygiene, PPE and safe handling of waste." },
  { title: "Information Governance & GDPR", slug: "information-governance-and-gdpr", topic: "Governance & Records", minutes: 21, renewMonths: 12, summary: "Handling personal data lawfully and securely under UK GDPR and the Data Protection Act 2018." },
  { title: "Introduction to Care", slug: "introduction-to-care", topic: "Care Fundamentals", minutes: 20, renewMonths: 36, summary: "The role of a carer in adult social care, the tasks involved, and the CQC standards you work to." },
  { title: "Legionella Awareness", slug: "legionnaires-disease", topic: "Health & Safety", minutes: 20, renewMonths: 12, summary: "What Legionnaires' disease is, where the risk comes from, and how it is controlled." },
  { title: "LGBTQ+ Awareness in Care", slug: "lgbtq-awareness", topic: "Care Fundamentals", minutes: 21, renewMonths: 12, summary: "Inclusive, respectful, person-centred support, understanding identity, and challenging discrimination." },
  { title: "Lone Working", slug: "lone-working", topic: "Health & Safety", minutes: 26, renewMonths: 12, summary: "Staying safe working alone in the community: the law, risk assessment, travelling between calls, and what happens after an incident." },
  { title: "Medication Awareness", slug: "medication-awareness", topic: "Infection & Clinical", minutes: 26, renewMonths: 12, summary: "Supporting people with medicines safely within your role: levels of support, time-critical doses, aids, records and safeguarding." },
  { title: "Mental Capacity Act & DoLS", slug: "mental-capacity-act-and-dols", topic: "Safeguarding", minutes: 25, renewMonths: 12, summary: "Applying the Mental Capacity Act 2005 and the Deprivation of Liberty Safeguards to support decision-making." },
  { title: "Modern Slavery Awareness", slug: "modern-slavery", topic: "Safeguarding", minutes: 22, renewMonths: 12, summary: "The types of modern slavery, recognising the signs, and how to report safely." },
  { title: "Moving & Handling", slug: "moving-and-handling", topic: "Health & Safety", minutes: 24, renewMonths: 12, summary: "Moving and handling people and objects safely to prevent injury, using the right techniques and equipment." },
  { title: "Oral Care", slug: "oral-care", topic: "Infection & Clinical", minutes: 27, renewMonths: 12, summary: "Daily mouth care: why it matters for health and dignity, good technique, denture care and recognising problems." },
  { title: "PEG Feeding", slug: "peg-feeding", topic: "Infection & Clinical", minutes: 24, renewMonths: 12, summary: "PEG (enteral) feeding: safe practice, positioning, tube and stoma-site care, and recognising complications." },
  { title: "Person-Centred Care", slug: "person-centred-care", topic: "Care Fundamentals", minutes: 19, renewMonths: 12, summary: "Putting the individual at the centre of their care through preferences, care plans, choice and involvement." },
  { title: "Personal Care", slug: "personal-care", topic: "Person & Service Quality", minutes: 24, renewMonths: 12, summary: "Personal care with dignity, privacy and consent: washing, oral care, grooming, dressing and skin care." },
  { title: "Positive Behaviour Support", slug: "positive-behaviour-support", topic: "Person & Service Quality", minutes: 24, renewMonths: 12, summary: "Behaviour as communication of unmet need, proactive person-centred strategies, and least-restrictive practice." },
  { title: "Privacy & Dignity", slug: "privacy-and-dignity", topic: "Care Fundamentals", minutes: 19, renewMonths: 12, summary: "Protecting people's privacy and dignity in every part of care, from personal care to communication and confidentiality." },
  { title: "Record Keeping & Documentation", slug: "record-keeping-and-documentation", topic: "Governance & Records", minutes: 19, renewMonths: 12, summary: "Keeping accurate, timely and confidential records that support safe care and meet CQC requirements." },
  { title: "Risk Assessment", slug: "risk-assessment", topic: "Health & Safety", minutes: 22, renewMonths: 12, summary: "Hazard and risk, the HSE five steps, control measures, and dynamic and positive risk-taking." },
  { title: "Safeguarding Adults Level 2", slug: "safeguarding-adults-level-2", topic: "Safeguarding", minutes: 20, renewMonths: 12, summary: "Recognising, responding to and reporting abuse and neglect of adults at risk, under the Care Act 2014." },
  { title: "Safeguarding Children", slug: "safeguarding-children", topic: "Safeguarding", minutes: 23, renewMonths: 12, summary: "Recognising and reporting concerns about children and young people you may meet in a client's home." },
  { title: "Sepsis Awareness", slug: "sepsis", topic: "Infection & Clinical", minutes: 22, renewMonths: 12, summary: "Spotting the signs of sepsis early and escalating fast to get urgent help." },
  { title: "Sexual Harassment Awareness", slug: "sexual-harassment-awareness", topic: "Safeguarding", minutes: 21, renewMonths: 12, summary: "What sexual harassment is, the employer's duty to prevent it under the Worker Protection Act 2023, and how to respond and report." },
  { title: "Slips, Trips & Falls", slug: "slips-trips-and-falls", topic: "Health & Safety", minutes: 21, renewMonths: 12, summary: "Preventing slips, trips and falls, a leading cause of injury, for staff and the people you support." },
  { title: "Stoma Care", slug: "stoma-care", topic: "Infection & Clinical", minutes: 24, renewMonths: 12, summary: "Types of stoma, appliances and daily care, skin health, and recognising complications." },
  { title: "Stroke Awareness", slug: "stroke-awareness", topic: "Infection & Clinical", minutes: 22, renewMonths: 12, summary: "Recognising a stroke with the FAST test, acting immediately, and supporting recovery." },
  { title: "Supporting Communication Needs", slug: "communication-support", topic: "Care Fundamentals", minutes: 21, renewMonths: 12, summary: "Supporting people with additional communication needs: barriers, total communication, tools and aids." },
  { title: "Tracheostomy Awareness", slug: "tracheostomy-awareness", topic: "Infection & Clinical", minutes: 24, renewMonths: 12, summary: "How a tracheostomy changes breathing, keeping the person safe, and responding to emergencies." },
  { title: "Whistleblowing", slug: "whistleblowing", topic: "Safeguarding", minutes: 18, renewMonths: 12, summary: "Raising concerns about wrongdoing or unsafe practice safely, and your legal protection when you do." },
  { title: "Your Personal Development", slug: "personal-development", topic: "Care Fundamentals", minutes: 24, renewMonths: 12, careCertificate: 2, summary: "Reflective practice, supervision, appraisal, and building your own development plan." },
];

export const CARE_COURSES = COURSE_CATALOGUE.map((c) => c.title);

export const COURSE_COUNT = COURSE_CATALOGUE.length;
