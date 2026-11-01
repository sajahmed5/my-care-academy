/** Initials for an avatar: "QA Office Worker" → "QO", an email → "QA". Pure. */
export function initials(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0] ?? email ?? "?").slice(0, 2).toUpperCase();
}
