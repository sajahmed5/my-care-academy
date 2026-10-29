/**
 * Answer lists for personal questions, UK/ONS-aligned. Brought across from
 * MyRoster (src/lib/demographics.ts, 29 Oct 2026) with the recruitment forms
 * that ask them, so both products offer the same choices.
 */

export const MARITAL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Civil Partnership",
  "Separated",
  "Divorced",
  "Widowed",
  "Other",
];

// ONS-aligned ethnic groups (UK). Free entry still possible via "Other".
export const ETHNICITY_OPTIONS = [
  "White British",
  "White Irish",
  "White Gypsy or Irish Traveller",
  "White Other",
  "Mixed White & Black Caribbean",
  "Mixed White & Black African",
  "Mixed White & Asian",
  "Mixed Other",
  "Indian",
  "Pakistani",
  "Bangladeshi",
  "Chinese",
  "Asian Other",
  "Black African",
  "Black Caribbean",
  "Black Other",
  "Arab",
  "Other ethnic group",
  "Prefer not to say",
];

export const RELIGION_OPTIONS = [
  "Christian",
  "Church of England",
  "Roman Catholic",
  "Buddhist",
  "Hindu",
  "Jewish",
  "Muslim",
  "Sikh",
  "Other religion",
  "No religion",
  "Prefer not to say",
];

/**
 * Languages offered as tick-boxes. The most common among care staff first;
 * anything else is added through "Other" and kept as typed (Saj, 22 Sept
 * 2026: "multiple choice with most popular ones and other where they can add
 * more").
 */
export const LANGUAGE_OPTIONS = [
  "English", "Urdu", "Punjabi", "Bengali", "Hindi", "Gujarati", "Arabic", "Somali", "Pashto", "Farsi", "Kurdish",
  "Polish", "Romanian", "Portuguese", "Spanish", "French", "Italian",
  "Swahili", "Yoruba", "Igbo", "Twi", "Amharic", "Tigrinya", "Shona",
  "Tagalog", "Malayalam", "Tamil", "Nepali", "Mandarin", "Cantonese",
  "British Sign Language",
];

export const SEXUAL_ORIENTATION_OPTIONS = [
  "Heterosexual / Straight",
  "Gay or Lesbian",
  "Bisexual",
  "Other",
  "Prefer not to say",
];

export const GENDER_OPTIONS = ["Male", "Female", "Other"];
export const PREFER_NOT_TO_SAY = "Prefer not to say";

/** Tidy a typed language: "engligh"/"bengoli" are left to the person, but case and spacing are made regular, and a known language takes its list spelling. */
export function tidyLanguage(raw: string, known: string[] = LANGUAGE_OPTIONS): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const hit = known.find((k) => k.toLowerCase() === t.toLowerCase());
  return hit ?? t.charAt(0).toUpperCase() + t.slice(1);
}

