import {
  Heart,
  Shield,
  HardHat,
  Droplets,
  FileText,
  Sparkles,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface TopicTheme {
  /** Base hex — used inline for chips, rings, charts (Tailwind can't do dynamic classes). */
  color: string;
  icon: LucideIcon;
}

const THEMES: Record<string, TopicTheme> = {
  "Care Fundamentals": { color: "#0d9488", icon: Heart },
  Safeguarding: { color: "#e11d48", icon: Shield },
  "Health & Safety": { color: "#d97706", icon: HardHat },
  "Infection & Clinical": { color: "#7c3aed", icon: Droplets },
  "Governance & Records": { color: "#0284c7", icon: FileText },
  "Person & Service Quality": { color: "#16a34a", icon: Sparkles },
};

const DEFAULT: TopicTheme = { color: "#64748b", icon: BookOpen };

export function topicTheme(title?: string | null): TopicTheme {
  return (title && THEMES[title]) || DEFAULT;
}

/** Semi-transparent tint of a hex colour, for soft backgrounds. */
export function tint(color: string, alpha = "1a"): string {
  // color-mix rather than appending the alpha to a hex, so a theme token such
  // as var(--primary) can be tinted too.
  const pct = Math.round((parseInt(alpha, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
