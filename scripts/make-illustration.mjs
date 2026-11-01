// Generate original, lightly animated illustrations for course pages.
//
//   node scripts/make-illustration.mjs <scenes.json>
//
// Everything is drawn from primitives here — nothing is traced or copied from
// stock art, so the output is ours to license with the courses.
//
// Animation is declared in a <style> block INSIDE each SVG. That matters:
// H5P renders images with <img src>, and an external stylesheet would not
// apply, but styles and @keyframes inside the file still run. Motion is kept
// gentle and is disabled under prefers-reduced-motion.
//
// H5P stretches the image to the full width of the page column (about 740px on
// a desktop, 340px on a phone), so the canvas is a narrow 520 units with large
// text: the key points stay readable on a phone.
//
// Scene spec (everything but title is optional; planScene() fills the gaps):
// {
//   "outDir": "public/h5p/content/lone-working/p10/content/images",
//   "scenes": [{
//     "file": "travel-safety.svg",
//     "title": "Plan the journey, not just the visit",
//     "accent": "#d97706",
//     "points": ["Check the route before you go", "Park where you can drive out", "Keep a charged phone"],
//     "scene": "solo" | "person" | "team",
//     "mood": "smile" | "concern",
//     "icon": "phone",
//     "seed": "lone-working/p10"
//   }]
// }
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// A deliberately broad range so the cast across a course looks like a real team.
const SKINS = ["#8d5524", "#c68642", "#e0ac69", "#f1c27d", "#5c3317", "#ffdbac"];
const HAIRS = ["#2d1f16", "#4a3728", "#1c1917", "#6b4423", "#8d6748", "#3b3b3b"];
const GREYS = ["#d1d5db", "#e5e7eb", "#b6bcc6"];
const SCARVES = ["#1e3a5f", "#7c2d12", "#5b21b6", "#0f766e", "#9d174d"];
const CARDIGANS = ["#7c8ea3", "#b07d62", "#8b7fb8", "#6f9c8a", "#c2847a"];
const CARER_HAIR = ["bob", "afro", "hijab", "short", "bun"];
const CLIENT_HAIR = ["curls", "bun", "balding"];

// A handful of HTML named entities that authored labels sometimes carry. We
// decode them to real Unicode BEFORE XML-escaping, otherwise "&ndash;" would be
// double-escaped to "&amp;ndash;" and show as literal "&ndash;" text in the SVG.
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", hellip: "…", nbsp: " ",
  eacute: "é", egrave: "è", agrave: "à", acirc: "â",
  ccedil: "ç", deg: "°", pound: "£", times: "×",
  rarr: "→", larr: "←", harr: "↔", bull: "•", middot: "·",
};
const decodeEntities = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m);

const esc = (s) =>
  decodeEntities(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mix(hex, target, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (target - c) * amount);
  return `#${((m(r) << 16) | (m(g) << 8) | m(b)).toString(16).padStart(6, "0")}`;
}
/** Mix a hex colour towards white — used for tinted backgrounds and fills. */
const tint = (hex, amount) => mix(hex, 255, amount);
const shade = (hex, amount) => mix(hex, 0, amount);

/** Stable small number from a string, so a page always gets the same cast. */
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** Greedy word wrap by an average character width; long tails get an ellipsis. */
function wrap(text, maxChars, maxLines) {
  const words = decodeEntities(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s,;:.–—-]*$/, "") + "…";
    return kept;
  }
  return lines;
}

// ─── Icons: 24×24, drawn in the topic colour, shown in a badge over the scene ──

const ICONS = {
  clipboard: (c) => `<rect x="5" y="4" width="14" height="17" rx="2.5" fill="none" stroke="${c}" stroke-width="2"/><rect x="9" y="2.5" width="6" height="4" rx="1.2" fill="${c}"/><path d="M8.5 11h7M8.5 15h5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  heart: (c) => `<path d="M12 20.5 L4.6 13.2 a4.6 4.6 0 0 1 7.4 -5.4 a4.6 4.6 0 0 1 7.4 5.4 Z" fill="${c}"/>`,
  alert: (c) => `<path d="M12 3 L22 20.5 H2 Z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5 V14" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="${c}"/>`,
  pills: (c) => `<g transform="rotate(-40 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M12 8.5 h5.5 a3.5 3.5 0 0 1 0 7 H12 Z" fill="${c}"/></g>`,
  phone: (c) => `<rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M10.5 18.5 h3" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  gloves: (c) => `<path d="M7 21 V13 L4.6 10.4 a1.5 1.5 0 0 1 2.2 -2 L8.5 10 V5 a1.5 1.5 0 0 1 3 0 V4 a1.5 1.5 0 0 1 3 0 V5 a1.5 1.5 0 0 1 3 0 V14 C17.5 18 15.5 21 13 21 Z" fill="${c}"/>`,
  drop: (c) => `<path d="M12 2.8 C12 2.8 5.5 10.5 5.5 14.6 a6.5 6.5 0 0 0 13 0 C18.5 10.5 12 2.8 12 2.8 Z" fill="${c}"/><path d="M9 15 a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  cup: (c) => `<path d="M4.5 9 h11 v5.5 a5 5 0 0 1 -5 5 h-1 a5 5 0 0 1 -5 -5 Z" fill="${c}"/><path d="M15.5 10.5 h1.8 a2.6 2.6 0 0 1 0 5.2 h-1.8" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 3.5 q1.4 1.5 0 3 M11.5 3.5 q1.4 1.5 0 3" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  plate: (c) => `<circle cx="13" cy="12" r="7.5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="13" cy="12" r="3.8" fill="${c}" opacity=".35"/><path d="M3 4 V20 M1.6 4 V9 a1.4 1.4 0 0 0 2.8 0 V4" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M22.2 4 C20.6 6 20.6 10 22.2 11 V20" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  shield: (c) => `<path d="M12 2.5 L20 5.5 V11 C20 16 16.6 19.6 12 21.2 C7.4 19.6 4 16 4 11 V5.5 Z" fill="${c}"/><path d="M8.5 12 l2.4 2.4 l4.6 -5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock: (c) => `<path d="M8 10.5 V7.5 a4 4 0 0 1 8 0 v3" fill="none" stroke="${c}" stroke-width="2"/><rect x="5" y="10.5" width="14" height="10.5" rx="2.2" fill="${c}"/><circle cx="12" cy="15.2" r="1.6" fill="#fff"/>`,
  speech: (c) => `<path d="M5 4.5 h14 a2.5 2.5 0 0 1 2.5 2.5 v8 a2.5 2.5 0 0 1 -2.5 2.5 h-8 l-4.5 3.5 v-3.5 h-1.5 a2.5 2.5 0 0 1 -2.5 -2.5 v-8 a2.5 2.5 0 0 1 2.5 -2.5 Z" fill="${c}"/><circle cx="8.5" cy="11" r="1.3" fill="#fff"/><circle cx="12" cy="11" r="1.3" fill="#fff"/><circle cx="15.5" cy="11" r="1.3" fill="#fff"/>`,
  clock: (c) => `<circle cx="12" cy="12" r="9" fill="none" stroke="${c}" stroke-width="2"/><path d="M12 7 V12 L15.5 14.2" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  firstaid: (c) => `<path d="M9 6.5 V4.5 h6 v2" fill="none" stroke="${c}" stroke-width="2"/><rect x="3" y="6.5" width="18" height="14" rx="2.5" fill="${c}"/><path d="M12 10 v7 M8.5 13.5 h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  flame: (c) => `<path d="M12 2.5 C13 7 18.5 9.5 18.5 15 a6.5 6.5 0 0 1 -13 0 C5.5 11.5 8 9.8 8.6 7 C10 9 11 9.2 12 2.5 Z" fill="${c}"/><path d="M12 13 C12.6 15 14.6 15.6 14.6 17.6 a2.6 2.6 0 0 1 -5.2 0 C9.4 16.2 11 15.4 12 13 Z" fill="#fff" opacity=".85"/>`,
  scales: (c) => `<path d="M12 4 V20 M7.5 20.5 h9 M4.5 7 h15" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M4.5 7 L2 13 h5 Z M19.5 7 L17 13 h5 Z" fill="${c}"/><circle cx="12" cy="4" r="1.6" fill="${c}"/>`,
  bulb: (c) => `<path d="M9 16.5 C7 15 6 13 6 10.5 a6 6 0 0 1 12 0 C18 13 17 15 15 16.5 Z" fill="${c}"/><path d="M9.5 19 h5 M10.5 21.5 h3" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  people: (c) => `<circle cx="8.5" cy="8" r="3.2" fill="${c}"/><circle cx="16" cy="8.5" r="2.8" fill="${c}" opacity=".6"/><path d="M2.5 20 a6 6 0 0 1 12 0 Z" fill="${c}"/><path d="M14.5 20 h7 a5 5 0 0 0 -8 -4.2" fill="${c}" opacity=".6"/>`,
  home: (c) => `<path d="M3.5 11 L12 3.8 L20.5 11 V20.5 H3.5 Z" fill="${c}"/><rect x="10" y="14" width="4" height="6.5" rx="1" fill="#fff"/>`,
  eye: (c) => `<path d="M2 12 C5 6.5 19 6.5 22 12 C19 17.5 5 17.5 2 12 Z" fill="none" stroke="${c}" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="${c}"/>`,
  tooth: (c) => `<path d="M7 3.5 C4.5 3.5 3.5 5.8 3.5 8 C3.5 11 5 12.5 5.6 15 C6.3 18 6.6 21 8.3 21 C10 21 10.2 16.5 12 16.5 C13.8 16.5 14 21 15.7 21 C17.4 21 17.7 18 18.4 15 C19 12.5 20.5 11 20.5 8 C20.5 5.8 19.5 3.5 17 3.5 C15 3.5 14 4.6 12 4.6 C10 4.6 9 3.5 7 3.5 Z" fill="${c}"/>`,
  check: (c) => `<circle cx="12" cy="12" r="9.5" fill="${c}"/><path d="M7.8 12.3 l2.8 2.8 l5.6 -6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

// ─── People ───────────────────────────────────────────────────────────────────

/** Brows, eyes, nose, mouth and cheeks — the mood lives here. */
function face(mood, skin, { glasses = false, older = false } = {}) {
  const nose = shade(skin, 0.18);
  const brows =
    mood === "concern"
      ? `<path d="M-10.5 -18.4 L-3.6 -21 M3.6 -21 L10.5 -18.4" stroke="#2d1f16" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
      : `<path d="M-10.5 -19.5 q3.8 -2.2 7 -0.6 M3.5 -20.1 q3.2 -1.6 7 0.6" stroke="#2d1f16" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  const mouth =
    mood === "concern"
      ? `<path d="M-3.8 -2.6 q3.8 -1.8 7.6 0" stroke="#7c2d12" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
      : mood === "happy"
        ? `<path d="M-5 -4 q5 4.6 10 0 z" fill="#7c2d12"/>`
        : `<path d="M-4.2 -3.6 q4.2 3 8.4 0" stroke="#7c2d12" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  const blush = mood === "concern" ? 0.1 : 0.22;
  return `
      ${brows}
      <g class="blink">
        <ellipse cx="-6.5" cy="-14" rx="1.9" ry="2.3" fill="#1f2937"/>
        <ellipse cx="6.5" cy="-14" rx="1.9" ry="2.3" fill="#1f2937"/>
        <circle cx="-5.8" cy="-14.8" r=".7" fill="#fff"/>
        <circle cx="7.2" cy="-14.8" r=".7" fill="#fff"/>
      </g>
      ${older ? `<path d="M-12 -12.2 l-1.8 1.1 M12 -12.2 l1.8 1.1" stroke="${nose}" stroke-width=".9" stroke-linecap="round"/>` : ""}
      ${glasses ? `<g fill="#fff" fill-opacity=".18" stroke="#374151" stroke-width="1.3"><circle cx="-6.5" cy="-14" r="4.6"/><circle cx="6.5" cy="-14" r="4.6"/></g><path d="M-1.9 -14.6 q1.9 -1.4 3.8 0 M-11.1 -14.6 L-14.6 -15.6 M11.1 -14.6 L14.6 -15.6" stroke="#374151" stroke-width="1.3" fill="none" stroke-linecap="round"/>` : ""}
      <path d="M0.5 -12 q1.8 3.8 -1.2 4.6" stroke="${nose}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${mouth}
      <circle cx="-10" cy="-6.5" r="3" fill="#f87171" opacity="${blush}"/>
      <circle cx="10" cy="-6.5" r="3" fill="#f87171" opacity="${blush}"/>`;
}

/** Hair drawn behind the head, and in front of it (fringe/hairline). */
function hairParts(style, colour) {
  switch (style) {
    case "bob":
      return {
        back: `<path d="M-17 -14 C-19 -36 19 -36 17 -14 L18 3 C11 7 -11 7 -18 3 Z" fill="${colour}"/>`,
        front: `<path d="M-16 -15 C-17.5 -32 -5 -36.5 4 -33.5 C12.5 -32 17.5 -25 16 -15 C13 -23.5 5 -26.5 -5 -24.5 C-10 -23 -13.5 -19.5 -16 -15 Z" fill="${colour}"/>`,
      };
    case "bun":
      return {
        back: `<circle cx="0" cy="-33" r="7.5" fill="${colour}"/>`,
        front: `<path d="M-15.5 -15 C-16 -31 -6 -33.5 0 -33 C6 -33.5 16 -31 15.5 -15 C13 -23 7 -26 0 -26 C-7 -26 -13 -23 -15.5 -15 Z" fill="${colour}"/>`,
      };
    case "afro":
      return {
        back: `<g fill="${colour}"><circle cx="-13" cy="-24" r="10"/><circle cx="0" cy="-30" r="12"/><circle cx="13" cy="-24" r="10"/><circle cx="-16" cy="-12" r="7.5"/><circle cx="16" cy="-12" r="7.5"/><circle cx="-8" cy="-31" r="9"/><circle cx="8" cy="-31" r="9"/></g>`,
        front: `<path d="M-14 -18 C-12 -27.5 12 -27.5 14 -18 C10 -23 -10 -23 -14 -18 Z" fill="${colour}"/>`,
      };
    case "short":
      return {
        back: "",
        front: `<path d="M-15 -15 C-16.5 -32 16.5 -32 15 -15 C14 -22 9 -26.5 0 -26.5 C-9 -26.5 -14 -22 -15 -15 Z" fill="${colour}"/>`,
      };
    case "curls": // older person: soft grey curls
      return {
        back: `<g fill="${colour}"><circle cx="-12" cy="-23" r="7.5"/><circle cx="-4" cy="-29" r="8"/><circle cx="5" cy="-29" r="8"/><circle cx="13" cy="-23" r="7.5"/><circle cx="-15" cy="-14" r="5.5"/><circle cx="15" cy="-14" r="5.5"/></g>`,
        front: `<path d="M-13.5 -19 C-11 -26.5 11 -26.5 13.5 -19 C9 -22.5 -9 -22.5 -13.5 -19 Z" fill="${colour}"/>`,
      };
    case "balding":
      return {
        back: `<path d="M-16.5 -8 C-17.5 -18 -15 -23 -12 -22 L-12.5 -7 Z M16.5 -8 C17.5 -18 15 -23 12 -22 L12.5 -7 Z" fill="${colour}"/>`,
        front: "",
      };
    default:
      return { back: "", front: "" };
  }
}

/**
 * A person, centred on x=0 with the bottom of the body at y=40 and the top of
 * the head near y=-36. `role` is "carer" (tunic, name badge) or "client"
 * (cardigan, glasses, seated in an armchair).
 */
function person(p) {
  const skin = p.skin;
  const neckShade = shade(skin, 0.15);
  const ear = shade(skin, 0.08);
  const hijab = p.hair === "hijab";
  const { back, front } = hijab ? { back: "", front: "" } : hairParts(p.hair, p.hairColour);
  const scarf = p.scarf;
  const isCarer = p.role === "carer";
  const top = p.top; // tunic or cardigan colour
  const topDark = shade(top, 0.14);

  const chair = isCarer
    ? ""
    : `<rect x="-31" y="-12" width="62" height="60" rx="15" fill="${p.chair}"/>
      <rect x="-40" y="20" width="14" height="26" rx="7" fill="${shade(p.chair, 0.08)}"/>
      <rect x="26" y="20" width="14" height="26" rx="7" fill="${shade(p.chair, 0.08)}"/>`;

  const scarfBack = hijab
    ? `<path d="M-20 -12 C-21 -40 21 -40 20 -12 L22 14 C14 20 -14 20 -22 14 Z" fill="${scarf}"/>`
    : "";
  const scarfFront = hijab
    ? `<path fill-rule="evenodd" d="M-20 -12 C-21 -40 21 -40 20 -12 L22 14 C14 20 -14 20 -22 14 Z M-12.5 -13 a12.5 15.5 0 1 0 25 0 a12.5 15.5 0 1 0 -25 0 Z" fill="${scarf}"/>`
    : "";

  const neckline = isCarer
    ? `<path d="M-7 11.5 L0 20 L7 11.5 Z" fill="${hijab ? scarf : skin}"/>
      <path d="M-9 12 L0 22.5 L9 12" stroke="${topDark}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
      <path d="M0 22.5 V40" stroke="${topDark}" stroke-width="1.2" opacity=".5"/>
      <rect x="10" y="24" width="12" height="8.5" rx="1.8" fill="#fff"/>
      <rect x="12" y="26.5" width="8" height="1.6" rx=".8" fill="${top}"/>
      <rect x="12" y="29.3" width="5.5" height="1.4" rx=".7" fill="#cbd5e1"/>`
    : `<path d="M-8 12 L0 23 L8 12 Z" fill="#fff"/>
      <path d="M-8 12 L0 23 L8 12" stroke="${topDark}" stroke-width="2" fill="none" stroke-linejoin="round"/>
      <path d="M0 23 V40" stroke="${topDark}" stroke-width="1.4"/>
      <circle cx="3" cy="28" r="1.3" fill="${topDark}"/><circle cx="3" cy="35" r="1.3" fill="${topDark}"/>`;

  // Open palm held low: calm, non-threatening body language.
  const arm =
    isCarer && p.gesture === "palm"
      ? `<path d="M-22 20 L-28 33 L-33 33" stroke="${topDark}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <g transform="translate(4 0)">
        <path d="M-35 33 H-40" stroke="${skin}" stroke-width="6.5" stroke-linecap="round"/>
        <path d="M-40 30 C-44 29.5 -49 30 -50.5 31.5 C-51 33.5 -47 36.5 -42 36.5 C-39.5 36.5 -38 35 -38.5 32.5 Z" fill="${skin}"/>
        <path d="M-41 30.2 C-41.5 27.8 -43.5 26.8 -45 27.6" stroke="${skin}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      </g>`
      : "";

  return `
    ${chair}
    <g class="bob" style="animation-delay:${p.delay ?? 0}s">
      ${back}
      ${scarfBack}
      <path d="M-6 2 h12 v11 c-3 3 -9 3 -12 0z" fill="${skin}"/>
      <path d="M-6 2 h12 v4 q-6 3.5 -12 0z" fill="${neckShade}"/>
      <path d="M-30 40 C-30 22 -21 13 -8 12 L0 21 L8 12 C21 13 30 22 30 40 Z" fill="${top}"/>
      ${neckline}
      ${arm}
      ${hijab ? "" : `<ellipse cx="-15" cy="-13" rx="3" ry="4.5" fill="${ear}"/><ellipse cx="15" cy="-13" rx="3" ry="4.5" fill="${ear}"/>`}
      <ellipse cx="0" cy="-14" rx="15" ry="17" fill="${skin}"/>
      ${front}
      ${scarfFront}
      ${face(p.mood, skin, { glasses: !isCarer, older: !isCarer })}
    </g>`;
}

// ─── Choosing a scene from the page's words ───────────────────────────────────

const ICON_RULES = [
  [/\b(death|dying|died|bereave|grief|palliat|end of life)/, "heart"],
  [/\b(oral|mouth|teeth|tooth|dentur|dental)/, "tooth"],
  [/\b(fire|smoke|flame|evacuat|burn)/, "flame"],
  [/\b(medicat|medicine|tablet|dose|pill|prescri|\bmar\b|stomp|inhaler|cream)/, "pills"],
  [/\b(hand ?wash|hand hygiene|wash(ing)? hands|soap|sanitis)/, "drop"],
  [/\b(\bppe\b|glove|apron|mask|infect|germ|bacteri|virus|spread)/, "gloves"],
  [/\b(drink|fluid|hydrat|dehydrat|water)/, "cup"],
  [/\b(food|eat|meal|nutrition|diet|swallow|allergen|menu|kitchen|cook)/, "plate"],
  [/\b(data|gdpr|confidential|password|secure|privacy|cyber|consent to share)/, "lock"],
  [/\b(safeguard|abuse|neglect|exploit|slavery|protect|harm)/, "shield"],
  [/\b(phone|call|999|111|contact|lone work|alarm|check.?in)/, "phone"],
  [/\b(first aid|wound|bleed|cpr|resus|chok|burns|injur)/, "firstaid"],
  [/\b(\blaw\b|\bact\b|legislat|legal|regulat|cqc|rights|duty|policy|standard)/, "scales"],
  [/\b(communicat|listen|talk|conversation|language|explain|question|speak|voice|word)/, "speech"],
  [/\b(time|routine|schedul|shift|rota|deadline|when)/, "clock"],
  [/\b(learn|reflect|develop|training|supervis|idea|improv|skill|goal)/, "bulb"],
  [/\b(team|colleague|manager|partner|famil|professional|together)/, "people"],
  [/\b(home|environment|room|house|space)/, "home"],
  [/\b(sign|symptom|spot|notice|observ|recognis|look for|watch)/, "eye"],
  [/\b(risk|hazard|warning|danger|emergency|urgent|escalat|crisis)/, "alert"],
  [/\b(record|note|document|report|plan|assess|form|log)/, "clipboard"],
  [/\b(person|dignity|respect|choice|compassion|wellbeing|kind|support|comfort|feel|emotion)/, "heart"],
];
const CONCERN = /\b(?:abuse|neglect|harm|danger|warning|sign|symptom|emergency|crisis|aggress|distress|pain|fall|injur|fire|chok|sepsis|stroke|seizure|infection|hazard|concern|exploit|bully|harass|discriminat|incident|error|mistake|anxi|depress|grief|dying|death|loss|worr|fear|risk|bleed|shock|burn|harm|unwell|deteriorat|danger)/;
const TEAM = /\b(?:team|colleague|manager|supervis|handover|whistle|partner|professional|employer|staff|meeting|escalat(e|ing) to|speak up|raise a concern)/;
const PERSON = /\b(?:person|people you support|client|resident|service user|individual|dignity|choice|personal care|supporting|supportive|comfort|communicat|listen|eat|drink|meal|mobil|moving|transfer|medicat|wash|bath|dress|oral|mouth|continence|catheter|stoma|dementia|end of life|wellbeing|feel|consent|home|visit|family)/;

/**
 * Fill in scene, mood, icon and cast for a page from its title and points.
 * `seed` (e.g. "course/p4") keeps the cast stable between regenerations and
 * varied across a course.
 */
export function planScene(s) {
  const title = String(s.title ?? "").toLowerCase();
  const words = `${title} ${(s.points ?? []).join(" ")}`.toLowerCase();
  const h = hash(s.seed ?? s.title);
  const noClients = s.noClients ?? false; // e.g. children's courses
  const scene =
    s.scene ??
    (TEAM.test(words) ? "team" : !noClients && (PERSON.test(words) || s.courseScene === "person") ? "person" : "solo");
  // The heading sets the tone; bullet points are too mixed to judge mood by.
  const mood = s.mood ?? (CONCERN.test(title) && !/^welcome/.test(title) ? "concern" : "smile");
  // Icon: what the heading names, else the course's own symbol, else the points.
  const match = (text) => ICON_RULES.find(([re]) => re.test(text))?.[1];
  const icon = s.icon ?? match(title) ?? s.courseIcon ?? match(words) ?? "check";
  return { ...s, scene, mood, icon, h };
}

function carerLook(h, mood, extra = {}) {
  const hair = CARER_HAIR[h % CARER_HAIR.length];
  return {
    role: "carer",
    skin: SKINS[(h >>> 3) % SKINS.length],
    hair,
    hairColour: HAIRS[(h >>> 6) % HAIRS.length],
    scarf: SCARVES[(h >>> 9) % SCARVES.length],
    mood,
    ...extra,
  };
}

/** Cast for the scene, laid out inside a 176×158 panel. */
function castFor(plan, accent) {
  const { scene, mood, h } = plan;
  const tunic = accent;
  if (scene === "person") {
    const client = {
      role: "client",
      skin: SKINS[(h >>> 12) % SKINS.length],
      hair: CLIENT_HAIR[(h >>> 15) % CLIENT_HAIR.length],
      hairColour: GREYS[(h >>> 17) % GREYS.length],
      top: CARDIGANS[(h >>> 19) % CARDIGANS.length],
      chair: tint(accent, 0.7),
      mood: mood === "concern" ? "concern" : "happy",
      delay: 0.7,
    };
    // A worried person gets a calm, reassuring carer.
    const carer = carerLook(h, "smile", { top: tunic, gesture: "none" });
    return [
      { at: [130, 118], scale: 1.32, p: client },
      { at: [50, 116], scale: 1.32, flip: true, p: carer },
    ];
  }
  if (scene === "team") {
    const a = carerLook(h, mood, { top: tunic, gesture: "none" });
    const b = carerLook(h + 2, mood === "concern" ? "concern" : "smile", { top: shade(tunic, 0.12), gesture: "none", delay: 0.7 });
    if (b.hair === a.hair) b.hair = CARER_HAIR[(CARER_HAIR.indexOf(a.hair) + 1) % CARER_HAIR.length];
    if (b.skin === a.skin) b.skin = SKINS[(SKINS.indexOf(a.skin) + 2) % SKINS.length];
    return [
      { at: [52, 118], scale: 1.3, flip: true, p: a },
      { at: [126, 120], scale: 1.3, p: b },
    ];
  }
  return [{ at: [98, 97], scale: 1.48, p: carerLook(h, mood, { top: tunic, gesture: mood === "concern" ? "none" : "palm" }) }];
}

export function describe(plan) {
  const who =
    plan.scene === "person"
      ? `A care worker sitting with an older person they support${plan.mood === "concern" ? ", who looks worried" : ""}`
      : plan.scene === "team"
        ? "Two care workers talking together"
        : `A care worker${plan.mood === "concern" ? " looking concerned" : ""}`;
  const title = decodeEntities(plan.title).replace(/[.:]$/, "");
  const pts = (plan.points ?? []).map((t) => decodeEntities(t).replace(/[.;:]$/, ""));
  return `${who}, beside the heading “${title}”${pts.length ? `. Key points: ${pts.join("; ")}` : ""}.`;
}

// ─── The illustration ─────────────────────────────────────────────────────────

const W = 520;
const PANEL_W = 176;
const PANEL_H = 158;
const OUT_W = 640; // intrinsic size; H5P stretches it to the column anyway

export function renderIllustration(spec) {
  const accent = spec.accent ?? "#0d9488";
  const plan = planScene(spec);
  const points = (plan.points ?? []).filter(Boolean).slice(0, 3).map((t) => t.charAt(0).toUpperCase() + t.slice(1));
  const alt = spec.alt ?? describe({ ...plan, points });

  const titleLines = wrap(plan.title, 44, 2);
  const top = titleLines.length === 1 ? 58 : 82;

  // Key points: chips that grow to two lines rather than cutting words off.
  const chips = points.map((t) => {
    const lines = wrap(t, 29, 2);
    return { lines, h: lines.length === 1 ? 38 : 56 };
  });
  const chipsH = chips.reduce((a, c) => a + c.h, 0) + Math.max(0, chips.length - 1) * 10;
  const bodyH = Math.max(PANEL_H, chipsH);
  const H = top + bodyH + 22;

  const panelX = chips.length ? 22 : (W - PANEL_W) / 2;
  const panelY = top + (bodyH - PANEL_H) / 2;

  const cast = castFor(plan, accent)
    .map(({ at: [x, y], scale, flip, p }) =>
      `<g transform="translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})">${person(p)}</g>`)
    .join("");

  const badge = `<g transform="translate(${plan.scene === "solo" ? 146 : 89} 30)"><g class="pulse">
      <circle r="19" fill="#fff" stroke="${tint(accent, 0.55)}" stroke-width="2"/>
      <g transform="translate(-12 -12)">${(ICONS[plan.icon] ?? ICONS.check)(accent)}</g>
    </g></g>`;

  let y = top + (bodyH - chipsH) / 2;
  const rows = chips
    .map((c, i) => {
      const cy = c.h / 2;
      const text =
        c.lines.length === 1
          ? `<text x="40" y="${cy + 5}" font-size="14.5" font-weight="600" fill="#1f2937">${esc(c.lines[0])}</text>`
          : `<text x="40" y="${cy - 3.5}" font-size="14.5" font-weight="600" fill="#1f2937">${esc(c.lines[0])}</text><text x="40" y="${cy + 14}" font-size="14.5" font-weight="600" fill="#1f2937">${esc(c.lines[1])}</text>`;
      const row = `
  <g transform="translate(212 ${y})">
    <g class="rise" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
      <rect width="286" height="${c.h}" rx="14" fill="#fff" stroke="${tint(accent, 0.6)}" stroke-width="2"/>
      <circle cx="20" cy="${cy}" r="9" fill="${accent}"/>
      <path d="M16 ${cy} l2.8 2.8 l5 -5.6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${text}
    </g>
  </g>`;
      y += c.h + 10;
      return row;
    })
    .join("");

  const titleSvg = titleLines
    .map((l, i) => `<text x="22" y="${36 + i * 25}" font-size="19.5" font-weight="700" fill="${shade(accent, 0.1)}">${esc(l)}</text>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${OUT_W}" height="${Math.round((H * OUT_W) / W)}" role="img" aria-labelledby="t d" data-generator="make-illustration" data-accent="${accent}">
  <title id="t">${esc(plan.title)}</title>
  <desc id="d">${esc(alt)}</desc>
  <style>
    text { font-family: Inter, Arial, sans-serif; }
    .bob { animation: bob 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
    .blink { animation: blink 6s step-end infinite; transform-box: fill-box; transform-origin: 50% 50%; }
    .pulse { animation: pulse 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
    .rise { animation: rise .5s ease-out both; }
    @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2.5px) } }
    @keyframes blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
    @keyframes pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
    @keyframes rise { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
    @media (prefers-reduced-motion: reduce) {
      .bob, .blink, .pulse, .rise { animation: none }
    }
  </style>
  <defs><clipPath id="panel"><rect width="${PANEL_W}" height="${PANEL_H}" rx="16"/></clipPath></defs>
  <rect width="${W}" height="${H}" rx="18" fill="${tint(accent, 0.93)}"/>
  ${titleSvg}
  <g transform="translate(${panelX} ${panelY})">
    <rect width="${PANEL_W}" height="${PANEL_H}" rx="16" fill="${tint(accent, 0.82)}"/>
    <g clip-path="url(#panel)">
      <ellipse cx="${PANEL_W / 2}" cy="${PANEL_H + 4}" rx="${PANEL_W * 0.62}" ry="34" fill="${tint(accent, 0.72)}"/>
      ${cast}
    </g>
    ${badge}
  </g>
  ${rows}
</svg>
`;
  return { svg, alt, width: OUT_W, height: Math.round((H * OUT_W) / W), plan };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("Usage: node scripts/make-illustration.mjs <scenes.json>");
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  mkdirSync(spec.outDir ?? ".", { recursive: true });
  let n = 0;
  for (const s of spec.scenes) {
    const dir = s.outDir ?? spec.outDir;
    mkdirSync(dir, { recursive: true });
    const { svg } = renderIllustration({ seed: join(dir, s.file), ...s });
    writeFileSync(join(dir, s.file), svg);
    console.log(`✓ ${join(dir, s.file)}  (${(svg.length / 1024).toFixed(1)} KB)`);
    n++;
  }
  console.log(`\nGenerated ${n} illustration(s).`);
}
