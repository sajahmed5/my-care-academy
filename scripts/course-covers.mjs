// Draws a cover illustration for every course into public/course-covers/<slug>.svg.
//
//   node scripts/course-covers.mjs            # every course
//   node scripts/course-covers.mjs fire-safety sepsis
//
// Our own flat style (29 Oct 2026), in place of stock photos: a soft wash of
// the topic's colour, a large circle behind the scene, and simple people and
// objects drawn from the kit below. 960×420 (16:7), the shape of the card's
// picture; the top-left corner is left quiet for the card's topic icon.
// A new course needs a scene in SCENES, then a run of this script and its
// slug added to lib/course-covers.ts.
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "public/course-covers";

// ── Palette ─────────────────────────────────────────────────────────────────
// One per topic, built from the topic colours in lib/topic-theme.ts.
const TOPIC = {
  care: { bg: "#e4f3ef", blob: "#cfe9e2", soft: "#d9efe9", accent: "#0f8178", light: "#5fb3a6" },
  safe: { bg: "#eceefd", blob: "#dadcfb", soft: "#e3e5fc", accent: "#4f46e5", light: "#8f8af0" },
  hs: { bg: "#fdf2e2", blob: "#f8dfba", soft: "#fbe8cc", accent: "#d97706", light: "#f2b25c" },
  clin: { bg: "#f1ebfb", blob: "#e3d7f7", soft: "#ebe2f9", accent: "#7c3aed", light: "#a78bfa" },
  gov: { bg: "#e5f1fa", blob: "#cfe4f5", soft: "#dcecf8", accent: "#0284c7", light: "#5eb4e6" },
  psq: { bg: "#e6f5ea", blob: "#cdebd5", soft: "#dbf0e1", accent: "#16a34a", light: "#6cc58b" },
};

const INK = "#0f2a2e";
const WHITE = "#ffffff";
const CORAL = "#f07167";
const ORANGE = "#f4a261";
const YELLOW = "#fcbf49";
const RED = "#e63946";
const SKY = "#4cc9f0";
const GREY = "#8d99ae";
const DARK = "#2b2d42";
const SKIN = { a: "#f6d2b6", b: "#f1c7a5", c: "#d9a074", d: "#c68642", e: "#8d5524", f: "#5c3a21" };
const SHADE = { a: "#e7b896", b: "#e3ad87", c: "#c48a5f", d: "#a8672f", e: "#73441b", f: "#4a2e1a" };
const HAIR = { black: "#2b1d14", brown: "#6b4226", blonde: "#d9b26f", red: "#b5562b", grey: "#e9e5df", silver: "#c9c6c0" };

// ── Kit ─────────────────────────────────────────────────────────────────────
const n = (v) => Math.round(v * 10) / 10;

function frame(p, body, { blobX = 600, blobY = 240, blobR = 232 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420" aria-hidden="true">
  <rect width="960" height="420" fill="${p.bg}"/>
  <circle cx="${blobX}" cy="${blobY}" r="${blobR}" fill="${p.blob}"/>
  <circle cx="140" cy="360" r="92" fill="${p.soft}"/>
  <circle cx="880" cy="78" r="42" fill="${p.soft}"/>
  <g fill="${p.accent}" opacity=".22"><circle cx="262" cy="96" r="7"/><circle cx="292" cy="126" r="4"/><circle cx="852" cy="318" r="6"/><circle cx="884" cy="292" r="4"/></g>
${body}
</svg>
`;
}

/**
 * A person from the chest up, standing on the bottom edge. x is the middle;
 * s scales them (1 = the adults in the samples; ~0.75 a child).
 */
function person({
  x, s = 1, base = 420, skin = "b", hair = "short", hairColor = "brown", top = "#0f8178",
  glasses = false, mood = "smile", beard = false, collar = true, uniform = false, extra = "",
  arm = null, plaster = false,
}) {
  const B = base;
  const hx = x;
  const hy = B - 192 * s;
  const S = (v) => n(v * s);
  const sk = SKIN[skin];
  const sh = SHADE[skin];
  const hc = HAIR[hairColor] ?? hairColor;
  const parts = [];

  // Behind the head
  if (hair === "long") {
    parts.push(`<path d="M${n(hx - 58 * s)} ${n(hy + 78 * s)} L${n(hx - 58 * s)} ${n(hy - 6 * s)} A${S(58)} ${S(58)} 0 0 1 ${n(hx + 58 * s)} ${n(hy - 6 * s)} L${n(hx + 58 * s)} ${n(hy + 78 * s)} Z" fill="${hc}"/>`);
  }
  if (hair === "bun") parts.push(`<circle cx="${hx}" cy="${n(hy - 70 * s)}" r="${S(24)}" fill="${hc}"/>`);
  if (hair === "ponytail") parts.push(`<ellipse cx="${n(hx + 50 * s)}" cy="${n(hy + 12 * s)}" rx="${S(16)}" ry="${S(34)}" fill="${hc}"/>`);
  if (hair === "headscarf") {
    parts.push(`<path d="M${n(hx - 62 * s)} ${n(hy)} L${n(hx - 74 * s)} ${n(hy + 104 * s)} L${n(hx + 74 * s)} ${n(hy + 104 * s)} L${n(hx + 62 * s)} ${n(hy)} Z" fill="${hc}"/>`);
    parts.push(`<circle cx="${hx}" cy="${n(hy - 2 * s)}" r="${S(62)}" fill="${hc}"/>`);
  }

  // Body, neck, head
  parts.push(`<path d="M${n(x - 105 * s)} ${B} C${n(x - 105 * s)} ${n(B - 90 * s)} ${n(x - 65 * s)} ${n(B - 124 * s)} ${x} ${n(B - 124 * s)} C${n(x + 65 * s)} ${n(B - 124 * s)} ${n(x + 105 * s)} ${n(B - 90 * s)} ${n(x + 105 * s)} ${B} Z" fill="${top}"/>`);
  if (hair !== "headscarf") {
    parts.push(`<rect x="${n(x - 14 * s)}" y="${n(B - 158 * s)}" width="${S(28)}" height="${S(42)}" rx="${S(10)}" fill="${sh}"/>`);
    if (collar) parts.push(`<path d="M${n(x - 23 * s)} ${n(B - 123 * s)} L${x} ${n(B - 90 * s)} L${n(x + 23 * s)} ${n(B - 123 * s)} Z" fill="${sh}"/>`);
  }
  if (uniform) {
    parts.push(`<rect x="${n(x + 30 * s)}" y="${n(B - 80 * s)}" width="${S(34)}" height="${S(20)}" rx="${S(4)}" fill="${WHITE}" opacity=".9"/>`);
  }
  parts.push(extra);
  if (hair === "headscarf") {
    parts.push(`<ellipse cx="${hx}" cy="${n(hy + 6 * s)}" rx="${S(40)}" ry="${S(46)}" fill="${sk}"/>`);
  } else {
    parts.push(`<circle cx="${hx}" cy="${n(hy)}" r="${S(50)}" fill="${sk}"/>`);
  }

  // Hair on top
  const cap = `M${n(hx - 51 * s)} ${n(hy + 2 * s)} A${S(51)} ${S(51)} 0 0 1 ${n(hx + 51 * s)} ${n(hy + 2 * s)} C${n(hx + 44 * s)} ${n(hy - 22 * s)} ${n(hx + 12 * s)} ${n(hy - 30 * s)} ${n(hx - 18 * s)} ${n(hy - 27 * s)} C${n(hx - 38 * s)} ${n(hy - 24 * s)} ${n(hx - 48 * s)} ${n(hy - 12 * s)} ${n(hx - 51 * s)} ${n(hy + 2 * s)} Z`;
  if (hair === "curly") {
    const c = [[-37, -23, 22], [-19, -44, 25], [11, -50, 26], [38, -35, 22], [49, -12, 15], [-47, 0, 14]];
    parts.push(`<g fill="${hc}">${c.map(([dx, dy, r]) => `<circle cx="${n(hx + dx * s)}" cy="${n(hy + dy * s)}" r="${S(r)}"/>`).join("")}</g>`);
  } else if (["short", "long", "ponytail"].includes(hair)) {
    parts.push(`<path d="${cap}" fill="${hc}"/>`);
  } else if (hair === "bun" || hair === "grey") {
    parts.push(`<path d="M${n(hx - 53 * s)} ${n(hy + 4 * s)} C${n(hx - 60 * s)} ${n(hy - 54 * s)} ${n(hx - 22 * s)} ${n(hy - 66 * s)} ${hx} ${n(hy - 66 * s)} C${n(hx + 35 * s)} ${n(hy - 66 * s)} ${n(hx + 62 * s)} ${n(hy - 50 * s)} ${n(hx + 53 * s)} ${n(hy + 4 * s)} C${n(hx + 44 * s)} ${n(hy - 26 * s)} ${n(hx + 22 * s)} ${n(hy - 37 * s)} ${hx} ${n(hy - 37 * s)} C${n(hx - 22 * s)} ${n(hy - 37 * s)} ${n(hx - 44 * s)} ${n(hy - 26 * s)} ${n(hx - 53 * s)} ${n(hy + 4 * s)} Z" fill="${hc}"/>`);
  } else if (hair === "bald") {
    parts.push(`<ellipse cx="${n(hx - 46 * s)}" cy="${n(hy - 4 * s)}" rx="${S(9)}" ry="${S(18)}" fill="${hc}"/><ellipse cx="${n(hx + 46 * s)}" cy="${n(hy - 4 * s)}" rx="${S(9)}" ry="${S(18)}" fill="${hc}"/>`);
  } else if (hair === "spiky") {
    parts.push(`<path d="M${n(hx - 50 * s)} ${n(hy - 2 * s)} L${n(hx - 46 * s)} ${n(hy - 40 * s)} L${n(hx - 30 * s)} ${n(hy - 34 * s)} L${n(hx - 22 * s)} ${n(hy - 58 * s)} L${n(hx - 4 * s)} ${n(hy - 42 * s)} L${n(hx + 10 * s)} ${n(hy - 62 * s)} L${n(hx + 22 * s)} ${n(hy - 42 * s)} L${n(hx + 40 * s)} ${n(hy - 50 * s)} L${n(hx + 40 * s)} ${n(hy - 28 * s)} L${n(hx + 52 * s)} ${n(hy - 6 * s)} C${n(hx + 30 * s)} ${n(hy - 22 * s)} ${n(hx - 30 * s)} ${n(hy - 22 * s)} ${n(hx - 50 * s)} ${n(hy - 2 * s)} Z" fill="${hc}"/>`);
  }
  if (beard) {
    parts.push(`<path d="M${n(hx - 44 * s)} ${n(hy + 12 * s)} C${n(hx - 40 * s)} ${n(hy + 58 * s)} ${n(hx + 40 * s)} ${n(hy + 58 * s)} ${n(hx + 44 * s)} ${n(hy + 12 * s)} C${n(hx + 30 * s)} ${n(hy + 30 * s)} ${n(hx - 30 * s)} ${n(hy + 30 * s)} ${n(hx - 44 * s)} ${n(hy + 12 * s)} Z" fill="${hc}"/>`);
  }

  // Face
  const ey = n(hy + 8 * s);
  parts.push(`<circle cx="${n(hx - 17 * s)}" cy="${ey}" r="${S(4.5)}" fill="${INK}"/><circle cx="${n(hx + 17 * s)}" cy="${ey}" r="${S(4.5)}" fill="${INK}"/>`);
  if (glasses) {
    parts.push(`<g stroke="${INK}" stroke-width="${S(3.5)}" fill="none"><circle cx="${n(hx - 17 * s)}" cy="${ey}" r="${S(13)}"/><circle cx="${n(hx + 17 * s)}" cy="${ey}" r="${S(13)}"/><path d="M${n(hx - 4 * s)} ${ey} H${n(hx + 4 * s)}"/></g>`);
  }
  parts.push(`<circle cx="${n(hx - 28 * s)}" cy="${n(hy + 24 * s)}" r="${S(8)}" fill="#e07a5f" opacity=".32"/><circle cx="${n(hx + 28 * s)}" cy="${n(hy + 24 * s)}" r="${S(8)}" fill="#e07a5f" opacity=".32"/>`);
  const my = hy + 25 * s;
  const mouth = {
    smile: `M${n(hx - 14 * s)} ${n(my)} Q${hx} ${n(my + 12 * s)} ${n(hx + 14 * s)} ${n(my)}`,
    grin: `M${n(hx - 16 * s)} ${n(my - 2 * s)} Q${hx} ${n(my + 18 * s)} ${n(hx + 16 * s)} ${n(my - 2 * s)} Z`,
    neutral: `M${n(hx - 10 * s)} ${n(my + 4 * s)} H${n(hx + 10 * s)}`,
    sad: `M${n(hx - 12 * s)} ${n(my + 8 * s)} Q${hx} ${n(my - 2 * s)} ${n(hx + 12 * s)} ${n(my + 8 * s)}`,
    worried: `M${n(hx - 12 * s)} ${n(my + 6 * s)} Q${n(hx - 6 * s)} ${n(my)} ${hx} ${n(my + 5 * s)} Q${n(hx + 6 * s)} ${n(my + 10 * s)} ${n(hx + 12 * s)} ${n(my + 4 * s)}`,
    open: `M${n(hx - 9 * s)} ${n(my + 2 * s)} Q${hx} ${n(my + 16 * s)} ${n(hx + 9 * s)} ${n(my + 2 * s)} Z`,
  }[mood];
  const filled = mood === "grin" || mood === "open";
  parts.push(`<path d="${mouth}" ${filled ? `fill="${INK}"` : `stroke="${INK}" stroke-width="${S(4)}" fill="none" stroke-linecap="round"`}/>`);
  if (mood === "worried" || mood === "sad") {
    parts.push(`<path d="M${n(hx - 26 * s)} ${n(hy - 10 * s)} L${n(hx - 10 * s)} ${n(hy - 6 * s)} M${n(hx + 26 * s)} ${n(hy - 10 * s)} L${n(hx + 10 * s)} ${n(hy - 6 * s)}" stroke="${INK}" stroke-width="${S(3.5)}" stroke-linecap="round"/>`);
  }
  if (plaster) {
    parts.push(`<g transform="rotate(-28 ${n(hx + 22 * s)} ${n(hy - 22 * s)})"><rect x="${n(hx + 4 * s)}" y="${n(hy - 30 * s)}" width="${S(36)}" height="${S(15)}" rx="${S(6)}" fill="#f3d9b1"/><rect x="${n(hx + 15 * s)}" y="${n(hy - 30 * s)}" width="${S(14)}" height="${S(15)}" fill="#e8c592"/></g>`);
  }

  // An arm reaching out from a shoulder to a point, with a hand.
  if (arm) {
    const side = arm.side ?? 1;
    const sx = n(x + side * 70 * s);
    const sy = n(B - 92 * s);
    const mx = n((sx + arm.x) / 2);
    const my2 = n(Math.min(sy, arm.y) - (arm.lift ?? 10));
    parts.push(`<path d="M${sx} ${sy} Q${mx} ${my2} ${arm.x} ${arm.y}" stroke="${arm.sleeve ?? top}" stroke-width="${S(30)}" fill="none" stroke-linecap="round"/>`);
    parts.push(`<ellipse cx="${arm.x}" cy="${arm.y}" rx="${S(arm.open ? 16 : 18)}" ry="${S(arm.open ? 20 : 14)}" fill="${sk}"/>`);
  }
  return parts.join("\n  ");
}

const heart = (x, y, size = 1, fill = CORAL, op = 1) =>
  `<path transform="translate(${x} ${y}) scale(${size})" d="M0 35 C-40 5 -45 -25 -22 -35 C-8 -41 0 -31 0 -23 C0 -31 8 -41 22 -35 C45 -25 40 5 0 35 Z" fill="${fill}" opacity="${op}"/>`;

const star = (x, y, r = 20, fill = YELLOW) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${n(x + Math.cos(a) * rr)},${n(y + Math.sin(a) * rr)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="${n(r * 0.18)}" stroke-linejoin="round"/>`;
};

const tick = (x, y, size = 1, color = "#16a34a", w = 12) =>
  `<path transform="translate(${x} ${y}) scale(${size})" d="M-22 0 L-6 16 L24 -16" stroke="${color}" stroke-width="${n(w / size)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A speech bubble; tail points left (-1) or right (1). */
function bubble(x, y, w, h, { fill = WHITE, tail = -1, content = "dots", color = "#c9d6d3" } = {}) {
  const tx = tail < 0 ? x + 26 : x + w - 26;
  const out = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(22, h / 2)}" fill="${fill}"/>`,
    `<path d="M${tx - 12} ${y + h - 2} L${tx + tail * -4} ${y + h + 24} L${tx + 14} ${y + h - 2} Z" fill="${fill}"/>`,
  ];
  if (content === "dots") {
    const cy = y + h / 2;
    out.push(`<g fill="${color}"><circle cx="${x + w / 2 - 22}" cy="${cy}" r="7"/><circle cx="${x + w / 2}" cy="${cy}" r="7"/><circle cx="${x + w / 2 + 22}" cy="${cy}" r="7"/></g>`);
  } else if (content === "lines") {
    out.push(`<rect x="${x + 20}" y="${y + h / 2 - 14}" width="${w - 40}" height="9" rx="4.5" fill="${color}"/><rect x="${x + 20}" y="${y + h / 2 + 5}" width="${(w - 40) * 0.65}" height="9" rx="4.5" fill="${color}"/>`);
  } else if (content) {
    out.push(content);
  }
  return out.join("");
}

/** A sheet of paper with lines, optional title bar colour and ticks. */
function paper(x, y, w, h, { rot = 0, bar = "#c9d6d3", lines = 4, ticks = 0, tickColor = "#16a34a" } = {}) {
  const out = [`<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">`, `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${WHITE}"/>`];
  out.push(`<rect x="${x + 20}" y="${y + 22}" width="${w * 0.5}" height="11" rx="5.5" fill="${bar}"/>`);
  for (let i = 0; i < lines; i++) {
    const ly = y + 52 + i * 26;
    if (ly > y + h - 18) break;
    if (i < ticks) {
      out.push(`<rect x="${x + 20}" y="${ly - 9}" width="18" height="18" rx="4" fill="none" stroke="${tickColor}" stroke-width="3"/>`);
      out.push(`<path d="M${x + 23} ${ly} L${x + 28} ${ly + 5} L${x + 36} ${ly - 5}" stroke="${tickColor}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
      out.push(`<rect x="${x + 48}" y="${ly - 4}" width="${w - 76}" height="8" rx="4" fill="#e3ebe9"/>`);
    } else {
      out.push(`<rect x="${x + 20}" y="${ly - 4}" width="${(w - 40) * (i % 2 ? 0.7 : 1)}" height="8" rx="4" fill="#e3ebe9"/>`);
    }
  }
  out.push(`</g>`);
  return out.join("");
}

function clipboard(x, y, w, h, { board = "#b07d4f", ...rest } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${board}"/>
  ${paper(x + 14, y + 22, w - 28, h - 36, rest)}
  <rect x="${x + w / 2 - 34}" y="${y - 10}" width="68" height="28" rx="9" fill="${GREY}"/>`;
}

const pill = (x, y, rot = 0, a = ORANGE, b = WHITE, len = 100, th = 46) =>
  `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - len / 2}" y="${y - th / 2}" width="${len / 2 + th / 2}" height="${th}" rx="${th / 2}" fill="${a}"/><rect x="${x}" y="${y - th / 2}" width="${len / 2}" height="${th}" rx="${th / 2}" fill="${b}"/><rect x="${x}" y="${y - th / 2}" width="${th / 2}" height="${th}" fill="${b}"/></g>`;

const glass = (x, y, w = 80, h = 168, water = "#9fd3f2") =>
  `<path d="M${x} ${y} L${x + w} ${y} L${x + w - 10} ${y + h} L${x + 10} ${y + h} Z" fill="${WHITE}" opacity=".85"/>
  <path d="M${x + 4} ${y + h * 0.38} L${x + w - 4} ${y + h * 0.38} L${x + w - 10} ${y + h} L${x + 10} ${y + h} Z" fill="${water}"/>
  <path d="M${x + 20} ${y + 18} L${x + 26} ${y + h - 16}" stroke="${WHITE}" stroke-width="8" stroke-linecap="round" opacity=".8"/>`;

const drop = (x, y, s = 1, fill = SKY) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -40 C14 -18 30 0 30 18 C30 36 16 48 0 48 C-16 48 -30 36 -30 18 C-30 0 -14 -18 0 -40 Z" fill="${fill}"/>`;

function shield(x, y, s = 1, fill = WHITE, stroke = null, inner = "") {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -80 L64 -54 V2 C64 50 34 80 0 96 C-34 80 -64 50 -64 2 V-54 Z" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="7"` : ""}/>${inner}</g>`;
}

function padlock(x, y, s = 1, body = INK, key = YELLOW) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 2 V-36 A40 40 0 0 1 40 -36 V2" stroke="${body}" stroke-width="18" fill="none"/><rect x="-65" y="0" width="130" height="110" rx="18" fill="${body}"/><circle cx="0" cy="45" r="12" fill="${key}"/><rect x="-6" y="50" width="12" height="28" rx="4" fill="${key}"/></g>`;
}

function house(x, y, s = 1, wall = WHITE, roof = CORAL, door = "#0f8178", lit = false) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-90" y="-60" width="180" height="140" rx="8" fill="${wall}"/><path d="M-112 -52 L0 -140 L112 -52 Z" fill="${roof}" stroke="${roof}" stroke-width="12" stroke-linejoin="round"/><rect x="-24" y="14" width="48" height="66" rx="6" fill="${door}"/><circle cx="14" cy="50" r="4" fill="${YELLOW}"/><rect x="-72" y="-30" width="40" height="36" rx="5" fill="${lit ? YELLOW : "#cfe8f7"}"/><rect x="32" y="-30" width="40" height="36" rx="5" fill="${lit ? YELLOW : "#cfe8f7"}"/></g>`;
}

function phone(x, y, s = 1, screen = "#e9f4f2", content = "") {
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-46" y="-86" width="92" height="172" rx="16" fill="${DARK}"/><rect x="-38" y="-72" width="76" height="140" rx="8" fill="${screen}"/><rect x="-14" y="-80" width="28" height="5" rx="2.5" fill="#4a4e69"/>${content}</g>`;
}

function clock(x, y, r = 46, rim = DARK, hand = INK, face = WHITE) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${face}" stroke="${rim}" stroke-width="${n(r * 0.16)}"/><path d="M${x} ${y} V${n(y - r * 0.6)} M${x} ${y} L${n(x + r * 0.45)} ${n(y + r * 0.2)}" stroke="${hand}" stroke-width="${n(r * 0.12)}" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${n(r * 0.1)}" fill="${hand}"/>`;
}

function warning(x, y, s = 1, fill = YELLOW, mark = INK) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -60 L56 40 H-56 Z" fill="${fill}" stroke="${fill}" stroke-width="16" stroke-linejoin="round"/><rect x="-6" y="-26" width="12" height="40" rx="6" fill="${mark}"/><circle cx="0" cy="28" r="7" fill="${mark}"/></g>`;
}

function magnifier(x, y, s = 1, rim = DARK, lens = "#cfe8f7") {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M40 40 L92 92" stroke="${rim}" stroke-width="22" stroke-linecap="round"/><circle cx="0" cy="0" r="56" fill="${lens}" stroke="${rim}" stroke-width="14"/><path d="M-28 -18 A34 34 0 0 1 -6 -36" stroke="${WHITE}" stroke-width="9" fill="none" stroke-linecap="round"/></g>`;
}

function book(x, y, s = 1, cover = "#0f8178", page = WHITE) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -50 C-30 -64 -80 -64 -110 -50 V56 C-80 42 -30 42 0 56 Z" fill="${page}"/><path d="M0 -50 C30 -64 80 -64 110 -50 V56 C80 42 30 42 0 56 Z" fill="${page}"/><path d="M-118 -44 V66 C-80 52 -30 52 0 66 C30 52 80 52 118 66 V-44" stroke="${cover}" stroke-width="10" fill="none" stroke-linejoin="round"/><g fill="#e3ebe9"><rect x="-92" y="-30" width="70" height="7" rx="3.5"/><rect x="-92" y="-10" width="60" height="7" rx="3.5"/><rect x="-92" y="10" width="70" height="7" rx="3.5"/><rect x="22" y="-30" width="70" height="7" rx="3.5"/><rect x="22" y="-10" width="60" height="7" rx="3.5"/><rect x="22" y="10" width="70" height="7" rx="3.5"/></g></g>`;
}

function plant(x, y, s = 1, pot = CORAL, leaf = "#2a9d8f") {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 C-10 -40 -50 -60 -70 -50 C-60 -20 -30 -6 0 0 Z" fill="${leaf}"/><path d="M0 0 C10 -50 50 -76 72 -64 C62 -30 30 -8 0 0 Z" fill="${leaf}" opacity=".85"/><path d="M0 0 C-4 -50 4 -90 20 -110 C30 -80 18 -30 0 0 Z" fill="${leaf}"/><path d="M-44 0 H44 L34 70 H-34 Z" fill="${pot}"/></g>`;
}

const sparkle = (x, y, r = 12, fill = YELLOW) =>
  `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="${fill}"/>`;

// ── Scenes ──────────────────────────────────────────────────────────────────
// Each returns the inner drawing; the topic decides the colours.
const P = TOPIC;

const SCENES = {
  // Care Fundamentals
  "duty-of-care": [P.care, (p) => `
  ${person({ x: 465, skin: "d", hair: "curly", hairColor: "black", top: p.accent })}
  ${person({ x: 668, base: 420, skin: "b", hair: "bun", hairColor: "grey", top: "#b8a1dc", glasses: true, collar: false, extra: `<path d="M668 310 V420" stroke="#9d86c8" stroke-width="5"/>` })}
  <path d="M540 334 C570 322 598 318 622 318" stroke="${p.accent}" stroke-width="32" fill="none" stroke-linecap="round"/><ellipse cx="632" cy="318" rx="19" ry="14" fill="${SKIN.d}"/>
  ${heart(566, 112, 1.1)}${heart(632, 80, 0.45, CORAL, 0.55)}`],

  "introduction-to-care": [P.care, (p) => `
  ${house(720, 250, 1.05, WHITE, CORAL, p.accent)}
  ${person({ x: 470, skin: "b", hair: "ponytail", hairColor: "brown", top: p.accent, uniform: true, arm: { x: 360, y: 190, side: -1, open: true, lift: 40 } })}
  ${heart(820, 92, 0.7)}${sparkle(330, 130, 14)}`],

  "person-centred-care": [P.care, (p) => `
  ${person({ x: 600, skin: "c", hair: "grey", hairColor: "grey", top: "#e9a6a6", glasses: true })}
  <circle cx="420" cy="150" r="46" fill="${WHITE}"/><path d="M398 134 h36 v22 a18 16 0 0 1 -36 0 Z" fill="${p.accent}"/><path d="M434 140 a10 10 0 0 1 0 20" stroke="${p.accent}" stroke-width="5" fill="none"/><rect x="392" y="172" width="48" height="6" rx="3" fill="${p.accent}"/>
  <circle cx="790" cy="140" r="46" fill="${WHITE}"/><path d="M780 118 v40 a10 8 0 1 1 -6 -8 v-28 l28 -6 v34 a10 8 0 1 1 -6 -8 v-22 Z" fill="${p.accent}"/>
  <circle cx="800" cy="290" r="40" fill="${WHITE}"/><g fill="${CORAL}"><circle cx="800" cy="276" r="9"/><circle cx="813" cy="290" r="9"/><circle cx="800" cy="304" r="9"/><circle cx="787" cy="290" r="9"/></g><circle cx="800" cy="290" r="6" fill="${YELLOW}"/>
  ${heart(600, 60, 0.6)}`],

  "communication-skills": [P.care, (p) => `
  ${person({ x: 430, skin: "a", hair: "long", hairColor: "blonde", top: p.accent })}
  ${person({ x: 720, skin: "e", hair: "bald", hairColor: "silver", top: "#7aa6c2", beard: true, glasses: true })}
  ${bubble(360, 70, 150, 74, { content: "dots", color: p.light })}
  ${bubble(610, 46, 170, 74, { tail: 1, content: "lines", color: "#c9d6d3" })}`],

  "communication-support": [P.care, (p) => `
  ${person({ x: 690, skin: "b", hair: "grey", hairColor: "grey", top: "#e8b04b", glasses: true })}
  <rect x="300" y="120" width="250" height="190" rx="22" fill="${DARK}"/><rect x="314" y="134" width="222" height="162" rx="12" fill="${WHITE}"/>
  <rect x="330" y="150" width="88" height="62" rx="10" fill="${p.soft}"/><path d="M356 166 h28 v22 a14 10 0 0 1 -28 0 Z" fill="${p.accent}"/><path d="M384 172 a7 7 0 0 1 0 14" stroke="${p.accent}" stroke-width="4" fill="none"/>
  <rect x="432" y="150" width="88" height="62" rx="10" fill="#fde9e6"/><rect x="452" y="172" width="48" height="22" rx="6" fill="${CORAL}"/><rect x="452" y="166" width="18" height="12" rx="4" fill="${CORAL}"/>
  <rect x="330" y="222" width="88" height="62" rx="10" fill="#fff4d6"/><circle cx="374" cy="253" r="20" fill="${YELLOW}"/><path d="M364 256 q10 9 20 0" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <rect x="432" y="222" width="88" height="62" rx="10" fill="#e6f2fa"/><path d="M458 268 v-28 h36 v28" stroke="#0284c7" stroke-width="6" fill="none"/><rect x="452" y="262" width="48" height="8" rx="4" fill="#0284c7"/>
  <path d="M566 214 C600 214 612 230 630 250" stroke="#e8b04b" stroke-width="30" fill="none" stroke-linecap="round"/><ellipse cx="560" cy="214" rx="16" ry="20" fill="${SKIN.b}"/>`],

  "anxiety-awareness": [P.care, (p) => `
  <circle cx="600" cy="220" r="170" fill="none" stroke="${p.light}" stroke-width="6" opacity=".45"/>
  <circle cx="600" cy="220" r="130" fill="none" stroke="${p.light}" stroke-width="6" opacity=".6"/>
  ${person({ x: 600, skin: "c", hair: "long", hairColor: "black", top: "#9cc5a1", mood: "neutral" })}
  <path d="M380 140 c20 -30 50 -30 60 0 c14 -26 46 -18 44 8 c18 2 22 30 0 34 h-100 c-24 -2 -24 -40 -4 -42 z" fill="${WHITE}" opacity=".9"/>
  <path d="M398 160 q10 -16 22 0 t22 0 t22 0" stroke="${GREY}" stroke-width="4" fill="none" stroke-linecap="round"/>
  ${plant(800, 340, 0.9, CORAL, p.accent)}
  ${sparkle(470, 90, 10)}${sparkle(760, 110, 14)}`],

  "depression-awareness": [P.care, (p) => `
  <circle cx="700" cy="110" r="52" fill="${YELLOW}"/>
  <path d="M600 140 c4 -40 56 -50 74 -16 c20 -22 64 -8 60 24 c26 4 26 44 -4 46 h-120 c-34 -2 -34 -52 -10 -54 z" fill="${WHITE}"/>
  ${person({ x: 450, skin: "a", hair: "short", hairColor: "red", top: "#8aa1c1", mood: "neutral" })}
  ${person({ x: 690, skin: "e", hair: "headscarf", hairColor: p.accent, top: "#e8b04b", arm: { x: 560, y: 300, side: -1 } })}
  <rect x="530" y="282" width="40" height="40" rx="8" fill="${WHITE}"/><path d="M570 294 a10 10 0 0 1 0 20" stroke="${WHITE}" stroke-width="6" fill="none"/>`],

  "mental-health-and-dementia": [P.care, (p) => `
  ${person({ x: 680, skin: "a", hair: "grey", hairColor: "grey", top: "#c7a3d9", glasses: true })}
  ${person({ x: 450, skin: "d", hair: "short", hairColor: "black", top: p.accent })}
  <g transform="rotate(-6 560 330)"><rect x="470" y="300" width="180" height="110" rx="10" fill="${CORAL}"/><rect x="482" y="310" width="76" height="90" rx="6" fill="${WHITE}"/><rect x="564" y="310" width="76" height="90" rx="6" fill="${WHITE}"/><rect x="490" y="318" width="60" height="44" rx="4" fill="#cfe8f7"/><circle cx="520" cy="340" r="10" fill="${YELLOW}"/><rect x="572" y="318" width="60" height="44" rx="4" fill="${p.soft}"/></g>
  <circle cx="560" cy="130" r="64" fill="${WHITE}"/><circle cx="636" cy="196" r="12" fill="${WHITE}"/><circle cx="660" cy="222" r="7" fill="${WHITE}"/>
  ${house(560, 140, 0.32, p.soft, CORAL, p.accent)}`],

  "equality-diversity-and-inclusion": [P.care, (p) => `
  ${person({ x: 330, s: 0.82, skin: "a", hair: "long", hairColor: "red", top: "#e8b04b" })}
  ${person({ x: 500, s: 0.9, skin: "e", hair: "curly", hairColor: "black", top: p.accent })}
  ${person({ x: 670, s: 0.86, skin: "c", hair: "headscarf", hairColor: "#b8a1dc", top: "#7aa6c2" })}
  ${person({ x: 830, s: 0.8, skin: "b", hair: "bald", hairColor: "silver", top: CORAL, glasses: true, beard: true })}
  ${heart(580, 60, 0.6)}`],

  "fluids-and-nutrition": [P.care, () => `
  ${glass(420, 150, 90, 190)}
  <path d="M530 140 h96 l-8 200 h-80 Z" fill="${WHITE}" opacity=".9"/><path d="M534 200 h88 l-6 140 h-76 Z" fill="#9fd3f2"/><path d="M626 160 c30 0 30 60 0 60" stroke="${WHITE}" stroke-width="12" fill="none"/>
  <ellipse cx="760" cy="330" rx="110" ry="26" fill="${WHITE}"/><path d="M650 320 a110 70 0 0 0 220 0 Z" fill="${WHITE}"/>
  <circle cx="720" cy="290" r="34" fill="${RED}"/><circle cx="790" cy="292" r="30" fill="${YELLOW}"/><circle cx="756" cy="270" r="28" fill="#7cc576"/><path d="M720 256 q4 -14 14 -16" stroke="#6b4226" stroke-width="5" fill="none"/>
  ${drop(330, 150, 1, SKY)}${tick(330, 170, 0.8, WHITE, 10)}`],

  "privacy-and-dignity": [P.care, (p) => `
  <rect x="520" y="70" width="190" height="350" rx="10" fill="${WHITE}"/><rect x="540" y="90" width="150" height="330" rx="6" fill="${p.light}"/><circle cx="670" cy="260" r="9" fill="${YELLOW}"/>
  <rect x="566" y="130" width="98" height="40" rx="8" fill="${WHITE}"/><text x="615" y="157" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="${p.accent}">Knock</text>
  ${person({ x: 380, skin: "c", hair: "bun", hairColor: "black", top: p.accent, uniform: true, arm: { x: 524, y: 210, side: 1, lift: 30 } })}
  <path d="M760 420 V170 M800 420 V170 M840 420 V170" stroke="${WHITE}" stroke-width="10" opacity=".7"/>
  <path d="M740 170 h120 v250 h-120 Z" fill="${WHITE}" opacity=".55"/>
  ${heart(810, 110, 0.6)}`],

  "dyslexia-awareness": [P.care, (p) => `
  ${book(560, 300, 1.25, p.accent)}
  <rect x="440" y="300" width="250" height="30" rx="6" fill="${YELLOW}" opacity=".55"/>
  <g font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800" text-anchor="middle">
    <g transform="rotate(-10 390 120)"><rect x="356" y="86" width="68" height="68" rx="14" fill="${CORAL}"/><text x="390" y="136" fill="${WHITE}">b</text></g>
    <g transform="rotate(8 500 90)"><rect x="466" y="56" width="68" height="68" rx="14" fill="${p.accent}"/><text x="500" y="106" fill="${WHITE}">d</text></g>
    <g transform="rotate(-6 620 110)"><rect x="586" y="76" width="68" height="68" rx="14" fill="${YELLOW}"/><text x="620" y="124" fill="${INK}">p</text></g>
    <g transform="rotate(10 735 140)"><rect x="701" y="106" width="68" height="68" rx="14" fill="#7aa6c2"/><text x="735" y="154" fill="${WHITE}">q</text></g>
  </g>`],

  "eating-disorders": [P.care, () => `
  <ellipse cx="560" cy="300" rx="190" ry="60" fill="${WHITE}" opacity=".6"/>
  <circle cx="560" cy="270" r="120" fill="${WHITE}"/><circle cx="560" cy="270" r="92" fill="#f4f7f6"/>
  <ellipse cx="530" cy="300" rx="52" ry="34" fill="#f6ecd0"/><g fill="#f2dfb0"><circle cx="505" cy="290" r="8"/><circle cx="530" cy="306" r="8"/><circle cx="552" cy="288" r="8"/></g>
  <g fill="#5aa469"><circle cx="590" cy="220" r="20"/><circle cx="612" cy="232" r="18"/><circle cx="596" cy="244" r="17"/></g><path d="M600 248 v22" stroke="#3d7a4b" stroke-width="10" stroke-linecap="round"/>
  <g fill="${ORANGE}"><circle cx="530" cy="222" r="15"/><circle cx="508" cy="244" r="13"/><circle cx="550" cy="246" r="13"/></g>
  <path d="M594 300 c20 -26 60 -26 64 0 c-6 22 -46 28 -64 0 Z" fill="#f4a3a0"/><path d="M658 300 l16 -12 v24 Z" fill="#f4a3a0"/>
  <rect x="380" y="180" width="14" height="190" rx="7" fill="${GREY}"/><path d="M372 180 v50 M387 180 v50 M402 180 v50" stroke="${GREY}" stroke-width="6" stroke-linecap="round"/>
  <rect x="728" y="180" width="16" height="190" rx="8" fill="${GREY}"/><path d="M728 180 c26 10 26 70 0 80 Z" fill="${GREY}"/>
  ${bubble(760, 60, 120, 70, { tail: -1, content: heart(820, 92, 0.45) })}`],

  "learning-disability-and-autism": [P.care, (p) => `
  ${person({ x: 470, skin: "a", hair: "short", hairColor: "brown", top: "#7aa6c2", mood: "grin", extra: "" })}
  <path d="M414 238 a56 56 0 0 1 112 0" stroke="${DARK}" stroke-width="12" fill="none"/><rect x="402" y="226" width="24" height="40" rx="10" fill="${CORAL}"/><rect x="514" y="226" width="24" height="40" rx="10" fill="${CORAL}"/>
  <rect x="600" y="110" width="250" height="96" rx="18" fill="${WHITE}"/>
  <rect x="616" y="126" width="64" height="64" rx="10" fill="${p.soft}"/><circle cx="648" cy="158" r="20" fill="${YELLOW}"/>
  <path d="M688 158 h14" stroke="${GREY}" stroke-width="5" stroke-linecap="round"/>
  <rect x="708" y="126" width="64" height="64" rx="10" fill="#fde9e6"/><path d="M724 170 h32 l-4 -26 h-24 Z" fill="${CORAL}"/>
  <path d="M780 158 h14" stroke="${GREY}" stroke-width="5" stroke-linecap="round"/>
  <rect x="800" y="126" width="40" height="64" rx="10" fill="#e6f2fa"/>${tick(820, 156, 0.6, "#16a34a", 8)}
  ${person({ x: 760, skin: "d", hair: "bun", hairColor: "black", top: p.accent, s: 0.86 })}`],

  "lgbtq-awareness": [P.care, (p) => `
  <g fill="none" stroke-width="18" stroke-linecap="round">
    <path d="M330 300 A250 250 0 0 1 830 300" stroke="#e63946"/><path d="M348 300 A232 232 0 0 1 812 300" stroke="#f77f00"/><path d="M366 300 A214 214 0 0 1 794 300" stroke="${YELLOW}"/><path d="M384 300 A196 196 0 0 1 776 300" stroke="#2a9d8f"/><path d="M402 300 A178 178 0 0 1 758 300" stroke="#4361ee"/><path d="M420 300 A160 160 0 0 1 740 300" stroke="#9b5de5"/>
  </g>
  ${person({ x: 500, skin: "b", hair: "bald", hairColor: "silver", top: p.accent, glasses: true, mood: "grin" })}
  ${person({ x: 670, skin: "e", hair: "short", hairColor: "grey", top: "#e8b04b" })}`],

  "personal-development": [P.care, (p) => `
  <rect x="520" y="300" width="90" height="120" rx="8" fill="${p.light}"/><rect x="620" y="230" width="90" height="190" rx="8" fill="${p.accent}" opacity=".75"/><rect x="720" y="150" width="90" height="270" rx="8" fill="${p.accent}"/>
  <path d="M765 150 V64" stroke="${DARK}" stroke-width="6"/><path d="M765 66 L820 82 L765 98 Z" fill="${CORAL}"/>
  ${person({ x: 400, skin: "d", hair: "short", hairColor: "black", top: "#e8b04b", mood: "grin" })}
  ${star(560, 250, 22)}${star(660, 180, 22)}${sparkle(860, 140, 14)}`],

  // Safeguarding
  "safeguarding-adults-level-2": [P.safe, (p) => `
  ${shield(600, 180, 1.55, WHITE, null, heart(0, 4, 1.1, p.accent))}
  ${person({ x: 420, skin: "d", hair: "curly", hairColor: "black", top: p.accent })}
  ${person({ x: 790, skin: "a", hair: "grey", hairColor: "grey", top: "#e9a6a6", glasses: true })}`],

  "safeguarding-children": [P.safe, (p) => `
  ${shield(780, 150, 0.9, WHITE, null, star(0, 4, 34, YELLOW))}
  ${person({ x: 470, skin: "c", hair: "long", hairColor: "brown", top: p.accent })}
  ${person({ x: 620, s: 0.68, skin: "e", hair: "curly", hairColor: "black", top: "#f4a261", mood: "grin", extra: `<path d="M560 330 v90 M680 330 v90" stroke="#e63946" stroke-width="12"/>` })}
  ${house(300, 300, 0.55, WHITE, p.light, p.accent)}`],

  "mental-capacity-act-and-dols": [P.safe, (p) => `
  ${person({ x: 480, skin: "b", hair: "bald", hairColor: "silver", top: "#7aa6c2", glasses: true, beard: true })}
  <rect x="600" y="110" width="120" height="120" rx="20" fill="${WHITE}"/><path d="M638 150 h36 v32 a18 12 0 0 1 -36 0 Z" fill="${p.accent}"/><path d="M674 158 a9 9 0 0 1 0 18" stroke="${p.accent}" stroke-width="5" fill="none"/>
  <rect x="750" y="150" width="120" height="120" rx="20" fill="${WHITE}" stroke="#16a34a" stroke-width="6"/><circle cx="810" cy="214" r="30" fill="${RED}"/><path d="M810 184 q6 -14 18 -14" stroke="#6b4226" stroke-width="5" fill="none"/>
  <circle cx="860" cy="150" r="24" fill="#16a34a"/>${tick(860, 150, 0.55, WHITE, 8)}
  <circle cx="560" cy="130" r="16" fill="${WHITE}"/><circle cx="584" cy="98" r="10" fill="${WHITE}"/>`],

  "modern-slavery": [P.safe, (p) => `
  <g fill="none" stroke="${DARK}" stroke-width="22">
    <rect x="300" y="200" width="120" height="70" rx="35"/><rect x="390" y="200" width="120" height="70" rx="35" transform="rotate(-14 450 235)"/>
    <rect x="640" y="190" width="120" height="70" rx="35" transform="rotate(12 700 225)"/><rect x="730" y="200" width="120" height="70" rx="35"/>
  </g>
  ${sparkle(570, 170, 26)}${sparkle(600, 280, 16)}${sparkle(545, 250, 10)}
  ${heart(580, 80, 0.7, p.accent)}`],

  "sexual-harassment-awareness": [P.safe, (p) => `
  <path d="M760 90 l40 0 l28 28 v40 l-28 28 h-40 l-28 -28 v-40 Z" fill="${RED}"/><text x="780" y="148" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" fill="${WHITE}">STOP</text>
  ${person({ x: 540, skin: "e", hair: "long", hairColor: "black", top: p.accent, mood: "neutral", arm: { x: 650, y: 180, side: 1, open: true, lift: 60 } })}
  ${shield(330, 200, 0.75, WHITE, null, tick(0, 4, 1.3, p.accent, 14))}`],

  "whistleblowing": [P.safe, (p) => `
  <g transform="rotate(-16 520 240)">
    <path d="M420 200 h150 a60 60 0 1 1 -60 60 h-90 a30 30 0 0 1 0 -60 Z" fill="${YELLOW}"/><circle cx="510" cy="260" r="26" fill="${DARK}"/><rect x="390" y="214" width="40" height="32" rx="10" fill="#e8a33d"/>
  </g>
  <g stroke="${p.accent}" stroke-width="12" fill="none" stroke-linecap="round"><path d="M670 170 q30 30 0 60"/><path d="M710 140 q50 60 0 120"/><path d="M750 110 q70 90 0 180"/></g>
  ${shield(330, 170, 0.6, WHITE, null, tick(0, 4, 1.3, "#16a34a", 14))}`],
  // Health & Safety
  "fire-safety": [P.hs, () => `
  <rect x="0" y="384" width="960" height="36" fill="#f3d3a4"/>
  <rect x="726" y="72" width="168" height="70" rx="10" fill="#1a936f"/><rect x="736" y="82" width="58" height="50" rx="6" fill="${WHITE}"/>
  <g stroke="#1a936f" stroke-width="6" stroke-linecap="round" fill="none"><path d="M762 100 L758 118 L768 128"/><path d="M758 118 L748 126"/><path d="M760 104 L772 110 L778 104"/><path d="M760 104 L750 108"/></g>
  <circle cx="766" cy="92" r="5" fill="#1a936f"/><path d="M812 107 H866 M848 92 L866 107 L848 122" stroke="${WHITE}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M326 300 C286 300 276 250 300 216 C306 242 318 246 320 234 C316 200 334 176 352 160 C348 194 386 212 382 254 C380 286 362 300 326 300 Z" fill="#f77f00"/>
  <path d="M330 300 C306 300 300 274 314 254 C318 268 326 268 327 260 C326 240 336 228 346 220 C344 240 362 252 360 274 C358 292 348 300 330 300 Z" fill="${YELLOW}"/>
  <path d="M270 296 H390 L378 384 H282 Z" fill="${GREY}"/><path d="M270 296 H390" stroke="#6c7891" stroke-width="10" stroke-linecap="round"/>
  <path d="M606 138 C690 132 712 214 676 262" stroke="${DARK}" stroke-width="13" fill="none" stroke-linecap="round"/><rect x="664" y="256" width="24" height="44" rx="8" fill="${DARK}" transform="rotate(20 676 278)"/>
  <rect x="520" y="150" width="124" height="234" rx="42" fill="${RED}"/><rect x="538" y="178" width="16" height="176" rx="8" fill="#ff8a8f" opacity=".6"/>
  <rect x="546" y="244" width="76" height="62" rx="10" fill="${WHITE}"/><rect x="558" y="258" width="52" height="8" rx="4" fill="${RED}"/><rect x="558" y="274" width="38" height="7" rx="3.5" fill="#f2b8bd"/><rect x="558" y="288" width="44" height="7" rx="3.5" fill="#f2b8bd"/>
  <rect x="556" y="118" width="52" height="38" rx="9" fill="${DARK}"/><path d="M566 118 L528 96" stroke="${DARK}" stroke-width="12" stroke-linecap="round"/><path d="M590 118 L632 94" stroke="${DARK}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="582" cy="137" r="11" fill="${WHITE}"/><path d="M582 137 L588 131" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`],

  "health-and-safety": [P.hs, (p) => `
  <path d="M440 250 a110 100 0 0 1 220 0 Z" fill="${YELLOW}"/><rect x="410" y="244" width="280" height="28" rx="14" fill="#e8a33d"/><rect x="536" y="150" width="28" height="100" rx="10" fill="#e8a33d"/>
  ${clipboard(720, 120, 150, 200, { ticks: 3, lines: 4, bar: p.light })}
  ${warning(330, 180, 0.9)}
  <rect x="0" y="384" width="960" height="36" fill="#f3d3a4"/>`],

  "accident-and-incident-reporting": [P.hs, (p) => `
  ${clipboard(470, 90, 220, 290, { lines: 7, bar: p.accent })}
  ${warning(540, 160, 0.55)}
  <g transform="rotate(35 760 240)"><rect x="700" y="228" width="150" height="22" rx="6" fill="${DARK}"/><path d="M850 228 l30 11 l-30 11 Z" fill="#f3d9b1"/><rect x="700" y="228" width="26" height="22" rx="6" fill="${CORAL}"/></g>
  <g transform="rotate(-25 330 280)"><rect x="270" y="258" width="120" height="44" rx="18" fill="#f3d9b1"/><rect x="310" y="258" width="40" height="44" fill="#e8c592"/><g fill="#d2ab78"><circle cx="320" cy="272" r="3"/><circle cx="340" cy="272" r="3"/><circle cx="320" cy="288" r="3"/><circle cx="340" cy="288" r="3"/></g></g>`],

  "concussion-awareness": [P.hs, (p) => `
  ${person({ x: 520, skin: "a", hair: "short", hairColor: "brown", top: "#7aa6c2", mood: "worried", plaster: true })}
  ${star(430, 110, 18)}${star(600, 86, 14)}${star(640, 140, 12)}
  <path d="M410 120 C430 70 610 60 650 120" stroke="${p.light}" stroke-width="5" fill="none" stroke-dasharray="4 14" stroke-linecap="round"/>
  <g transform="rotate(-12 765 270)"><rect x="690" y="220" width="150" height="100" rx="30" fill="#9fd3f2"/><g stroke="${WHITE}" stroke-width="7" stroke-linecap="round"><path d="M765 238 v64"/><path d="M737 254 l56 32"/><path d="M737 286 l56 -32"/></g></g>`],

  "coshh": [P.hs, () => `
  <path d="M430 180 h80 v-20 h-50 l-20 -28 h-40 Z" fill="#5aa9e6"/><rect x="420" y="176" width="100" height="40" rx="8" fill="#5aa9e6"/><path d="M410 210 h120 l10 170 h-140 Z" fill="${WHITE}"/>
  <g transform="translate(470 290) rotate(45)"><rect x="-34" y="-34" width="68" height="68" rx="6" fill="${WHITE}" stroke="${RED}" stroke-width="7"/></g><path d="M470 270 v26 M470 308 v4" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
  <path d="M590 230 h170 l-16 150 h-138 Z" fill="${YELLOW}"/><path d="M590 230 c0 -70 170 -70 170 0" stroke="${GREY}" stroke-width="8" fill="none"/>
  <g transform="translate(675 300) rotate(45)"><rect x="-30" y="-30" width="60" height="60" rx="6" fill="${WHITE}" stroke="${RED}" stroke-width="6"/></g><path d="M664 300 l12 -16 l12 16 l-12 16 Z" fill="${INK}"/>
  <path d="M300 310 v-80 a18 18 0 0 1 36 0 v40 v-60 a18 18 0 0 1 36 0 v100 c0 40 -72 50 -72 0 Z" fill="${CORAL}"/>`],

  "drugs-and-alcohol-awareness": [P.hs, (p) => `
  <path d="M420 120 h90 c0 70 -20 100 -45 100 c-25 0 -45 -30 -45 -100 Z" fill="${WHITE}" opacity=".85"/><path d="M424 160 h82 c-4 40 -20 60 -41 60 c-21 0 -37 -20 -41 -60 Z" fill="#c0392b" opacity=".75"/><path d="M465 220 v120 M425 340 h80" stroke="${WHITE}" stroke-width="10" stroke-linecap="round"/>
  <rect x="560" y="170" width="70" height="210" rx="20" fill="#6b8e4e"/><rect x="578" y="110" width="34" height="70" rx="8" fill="#6b8e4e"/><rect x="566" y="240" width="58" height="60" rx="8" fill="#f2d49b"/>
  <rect x="690" y="270" width="170" height="80" rx="14" fill="${WHITE}"/><g>${[0,1,2,3].map((i)=>`<circle cx="${722 + i * 36}" cy="296" r="11" fill="${p.light}"/><circle cx="${722 + i * 36}" cy="326" r="11" fill="${p.light}"/>`).join("")}</g>
  <circle cx="780" cy="150" r="44" fill="${WHITE}"/><rect x="773" y="144" width="14" height="36" rx="7" fill="${p.accent}"/><circle cx="780" cy="126" r="8" fill="${p.accent}"/>`],

  "legionnaires-disease": [P.hs, (p) => `
  <path d="M420 60 v60 h80" stroke="${GREY}" stroke-width="18" fill="none" stroke-linejoin="round"/><path d="M460 120 h120 a20 20 0 0 1 -20 26 h-80 a20 20 0 0 1 -20 -26 Z" fill="${GREY}"/>
  <g stroke="${SKY}" stroke-width="7" stroke-linecap="round">${[0,1,2,3,4].map((i)=>`<path d="M${484 + i * 20} 168 l-${6 + i * 2} 70"/><path d="M${480 + i * 20} 262 l-${8 + i * 2} 60"/>`).join("")}</g>
  <rect x="700" y="110" width="44" height="210" rx="22" fill="${WHITE}"/><rect x="712" y="150" width="20" height="160" rx="10" fill="${RED}"/><circle cx="722" cy="320" r="38" fill="${RED}"/>
  <text x="780" y="160" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="${p.accent}">60°C</text>`],

  "lone-working": [P.hs, (p) => `
  <circle cx="300" cy="110" r="40" fill="${YELLOW}"/><circle cx="318" cy="98" r="36" fill="${p.bg}"/>
  ${house(760, 270, 0.95, WHITE, p.light, p.accent, true)}
  ${person({ x: 460, skin: "c", hair: "headscarf", hairColor: "#7aa6c2", top: p.accent, uniform: true, arm: { x: 580, y: 230, side: 1, lift: 20 } })}
  ${phone(600, 210, 0.6, "#e9f4f2", `<circle cx="0" cy="-10" r="22" fill="#16a34a"/>${tick(0, -10, 0.6, WHITE, 7)}`)}
  <g stroke="${p.accent}" stroke-width="7" fill="none" stroke-linecap="round"><path d="M640 130 q16 16 0 32"/><path d="M660 116 q28 30 0 60"/></g>`],

  "moving-and-handling": [P.hs, (p) => `
  <circle cx="560" cy="350" r="66" fill="none" stroke="${DARK}" stroke-width="12"/><circle cx="560" cy="350" r="10" fill="${DARK}"/><circle cx="700" cy="390" r="24" fill="none" stroke="${DARK}" stroke-width="10"/>
  <path d="M520 290 h170 l12 100" stroke="${DARK}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M520 290 v-60 h-30" stroke="${DARK}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${person({ x: 610, base: 300, s: 0.72, skin: "a", hair: "grey", hairColor: "grey", top: "#b8a1dc", glasses: true })}
  ${person({ x: 400, skin: "e", hair: "short", hairColor: "black", top: p.accent, uniform: true, arm: { x: 490, y: 232, side: 1, lift: 0 } })}`],

  "risk-assessment": [P.hs, (p) => `
  ${clipboard(440, 100, 200, 270, { ticks: 4, lines: 6, bar: p.accent })}
  ${magnifier(700, 170, 0.9)}
  ${warning(330, 190, 0.8)}`],

  "slips-trips-and-falls": [P.hs, () => `
  <rect x="0" y="384" width="960" height="36" fill="#f3d3a4"/>
  <path d="M470 384 L520 140 h40 L610 384 Z" fill="${YELLOW}"/><path d="M470 384 h140" stroke="#e8a33d" stroke-width="14" stroke-linecap="round"/>
  ${warning(540, 250, 0.6, "#e8a33d")}
  <path d="M700 384 v-240 c0 -40 60 -40 60 0" stroke="#8b5e3c" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M300 384 h80 v-40 h70 v-40" stroke="${WHITE}" stroke-width="0" fill="none"/><path d="M260 384 v-50 h70 v-50 h70" stroke="${GREY}" stroke-width="14" fill="none" stroke-linejoin="round"/>
  ${drop(820, 330, 0.7, SKY)}${drop(860, 350, 0.45, SKY)}`],

  // Infection & Clinical
  "medication-awareness": [P.clin, (p) => `
  <g transform="rotate(-6 210 150)"><rect x="150" y="96" width="122" height="112" rx="18" fill="${WHITE}"/><rect x="170" y="118" width="60" height="9" rx="4.5" fill="#d9cdf2"/><rect x="170" y="136" width="82" height="9" rx="4.5" fill="#ece5f9"/>${tick(208, 172, 1, "#16a34a", 12)}</g>
  ${pill(470, 125, -30)}
  <rect x="246" y="212" width="482" height="134" rx="24" fill="#6d28d9"/>
  ${[0,1,2,3,4,5,6].map((i)=>`<rect x="${262 + i * 66}" y="228" width="58" height="72" rx="12" fill="#f7f3ff"/><circle cx="${282 + i * 66}" cy="280" r="10" fill="${ORANGE}"/><circle cx="${302 + i * 66}" cy="268" r="9" fill="${SKY}"/>`).join("")}
  <g font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="${WHITE}" text-anchor="middle">${["M","T","W","T","F","S","S"].map((d,i)=>`<text x="${291 + i * 66}" y="330">${d}</text>`).join("")}</g>
  <path d="M658 228 L716 228 L728 186 L670 186 Z" fill="${p.light}"/>
  ${glass(770, 178, 80, 168)}`],

  "infection-prevention-and-control": [P.clin, (p) => `
  <path d="M430 80 v50 h90" stroke="${GREY}" stroke-width="20" fill="none" stroke-linejoin="round"/><rect x="500" y="118" width="50" height="34" rx="10" fill="${GREY}"/>
  <path d="M520 160 v60" stroke="${SKY}" stroke-width="16" stroke-linecap="round"/>
  <path d="M390 250 h280 c0 70 -50 110 -140 110 c-90 0 -140 -40 -140 -110 Z" fill="${WHITE}"/><rect x="380" y="240" width="300" height="20" rx="10" fill="#e3ebe9"/><ellipse cx="530" cy="268" rx="18" ry="7" fill="${GREY}"/>
  <g transform="rotate(-10 640 230)"><rect x="600" y="206" width="80" height="44" rx="16" fill="${p.light}"/><rect x="612" y="214" width="40" height="10" rx="5" fill="${WHITE}" opacity=".6"/></g>
  <g fill="${WHITE}" stroke="${p.light}" stroke-width="3">${[[440,210,18],[610,220,14],[470,170,10],[600,180,22],[640,260,12],[420,260,14]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>
  <rect x="740" y="160" width="80" height="150" rx="16" fill="${p.light}"/><rect x="760" y="120" width="40" height="44" rx="6" fill="${DARK}"/><path d="M800 132 h40" stroke="${DARK}" stroke-width="12" stroke-linecap="round"/><rect x="752" y="210" width="56" height="50" rx="8" fill="${WHITE}"/>${drop(780, 232, 0.4, p.accent)}`],

  "first-aid-awareness": [P.clin, () => `
  <rect x="440" y="150" width="260" height="200" rx="26" fill="#1a936f"/><path d="M520 150 v-24 a14 14 0 0 1 14 -14 h72 a14 14 0 0 1 14 14 v24" stroke="#14735a" stroke-width="16" fill="none"/>
  <rect x="546" y="200" width="48" height="110" rx="8" fill="${WHITE}"/><rect x="515" y="231" width="110" height="48" rx="8" fill="${WHITE}"/>
  <g transform="rotate(-30 790 200)"><rect x="730" y="180" width="130" height="44" rx="18" fill="#f3d9b1"/><rect x="772" y="180" width="44" height="44" fill="#e8c592"/></g>
  <circle cx="320" cy="290" r="56" fill="${WHITE}"/><circle cx="320" cy="290" r="22" fill="#e3ebe9"/><path d="M320 234 h120" stroke="${WHITE}" stroke-width="0"/><path d="M376 290 h70 v40 h-70" fill="${WHITE}"/>`],

  "basic-life-support-bls": [P.clin, () => `
  ${heart(560, 190, 3.2, CORAL)}
  <path d="M250 220 h180 l26 -60 l34 130 l30 -100 l20 30 h240" stroke="${WHITE}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="720" y="240" width="140" height="130" rx="20" fill="#1a936f"/>${heart(790, 296, 0.9, WHITE)}<path d="M796 278 l-16 28 h18 l-12 26" stroke="#1a936f" stroke-width="7" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="790" y="358" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="${WHITE}">AED</text>`],

  "food-hygiene-and-nutrition": [P.clin, (p) => `
  <rect x="380" y="220" width="320" height="150" rx="22" fill="#7cc576"/><circle cx="670" cy="250" r="12" fill="${p.bg}"/>
  <rect x="430" y="250" width="120" height="70" rx="6" fill="${WHITE}" opacity=".0"/>
  <g transform="rotate(-20 470 280)"><path d="M420 280 l100 -14 l6 20 l-100 14 Z" fill="${ORANGE}"/><path d="M520 266 l22 -12 m-20 18 l26 -4" stroke="#5aa469" stroke-width="7" stroke-linecap="round"/></g>
  <circle cx="600" cy="290" r="40" fill="${RED}"/><path d="M590 254 l10 -8 l10 8" stroke="#5aa469" stroke-width="6" fill="none"/><circle cx="586" cy="280" r="7" fill="#ff8a8f"/>
  <rect x="760" y="110" width="22" height="210" rx="11" fill="${GREY}"/><rect x="740" y="100" width="62" height="90" rx="14" fill="${WHITE}"/><text x="771" y="155" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="${p.accent}">75°</text>
  <path d="M310 140 c0 -34 70 -34 70 0 c20 -4 30 20 14 32 v40 h-98 v-40 c-16 -12 -6 -36 14 -32 Z" fill="${WHITE}"/>`],

  "allergen-awareness": [P.clin, () => `
  <path d="M380 180 L410 140 H460 L490 180 V370 H380 Z" fill="${WHITE}"/><path d="M410 140 H460 L490 180 H380 Z" fill="#cfe3f5"/><rect x="400" y="120" width="40" height="24" rx="4" fill="#5aa9e6"/><rect x="380" y="230" width="110" height="70" fill="#5aa9e6"/><path d="M405 280 c10 -30 50 -30 60 0" stroke="${WHITE}" stroke-width="6" fill="none"/>
  <path d="M560 380 V150" stroke="#d9b26f" stroke-width="8"/>${[0,1,2,3].map((i)=>`<ellipse cx="${548}" cy="${170 + i * 40}" rx="12" ry="22" fill="#e8c27a" transform="rotate(-25 548 ${170 + i * 40})"/><ellipse cx="${572}" cy="${170 + i * 40}" rx="12" ry="22" fill="#e8c27a" transform="rotate(25 572 ${170 + i * 40})"/>`).join("")}
  <ellipse cx="700" cy="280" rx="56" ry="72" fill="${WHITE}"/><ellipse cx="686" cy="260" rx="14" ry="22" fill="#fdfaf3"/>
  <g transform="rotate(12 820 160)"><rect x="770" y="120" width="110" height="64" rx="12" fill="${YELLOW}"/><circle cx="790" cy="152" r="9" fill="${INK}"/><rect x="806" y="140" width="58" height="9" rx="4.5" fill="${INK}" opacity=".6"/><rect x="806" y="156" width="40" height="9" rx="4.5" fill="${INK}" opacity=".6"/></g>`],

  "diabetes-awareness": [P.clin, (p) => `
  <rect x="440" y="120" width="160" height="240" rx="34" fill="${WHITE}"/><rect x="462" y="148" width="116" height="80" rx="12" fill="#dff3ec"/><text x="520" y="203" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="800" fill="${p.accent}">5.8</text>
  <circle cx="490" cy="282" r="18" fill="${p.light}"/><circle cx="550" cy="282" r="18" fill="${p.light}"/><rect x="500" y="320" width="40" height="44" rx="6" fill="#e3ebe9"/>
  ${drop(660, 250, 0.7, RED)}
  <circle cx="780" cy="290" r="62" fill="${RED}"/><path d="M780 228 c4 -20 16 -30 30 -30" stroke="#6b4226" stroke-width="7" fill="none"/><path d="M786 222 c30 -24 50 -10 50 -10 c-16 22 -36 22 -50 10 Z" fill="#5aa469"/><circle cx="760" cy="270" r="12" fill="#ff8a8f"/>
  <g transform="rotate(-40 330 220)"><rect x="250" y="200" width="170" height="36" rx="18" fill="${p.light}"/><rect x="380" y="200" width="40" height="36" rx="12" fill="${p.accent}"/><rect x="420" y="214" width="26" height="8" rx="4" fill="${GREY}"/></g>`],

  "epilepsy-awareness": [P.clin, (p) => `
  ${clock(560, 210, 100, DARK, p.accent)}
  <rect x="546" y="88" width="28" height="22" rx="6" fill="${DARK}"/><rect x="536" y="74" width="48" height="18" rx="8" fill="${DARK}"/>
  <path d="M560 210 L560 140 A70 70 0 0 1 626 234 Z" fill="${p.light}" opacity=".45"/>
  <ellipse cx="780" cy="300" rx="80" ry="64" fill="none" stroke="#c9c6c0" stroke-width="12"/><rect x="740" y="270" width="80" height="60" rx="14" fill="${RED}"/><path d="M780 284 v32 M764 300 h32" stroke="${WHITE}" stroke-width="8" stroke-linecap="round"/>
  ${heart(360, 260, 0.8)}`],

  "sepsis": [P.clin, (p) => `
  <rect x="420" y="80" width="56" height="250" rx="28" fill="${WHITE}"/><rect x="436" y="130" width="24" height="190" rx="12" fill="${RED}"/><circle cx="448" cy="330" r="48" fill="${RED}"/><g stroke="#e3ebe9" stroke-width="5">${[0,1,2,3,4].map((i)=>`<path d="M476 ${110 + i * 36} h18"/>`).join("")}</g>
  ${clock(640, 190, 72, DARK, p.accent)}
  <path d="M560 340 h80 l20 -40 l26 70 l22 -50 l14 20 h80" stroke="${p.accent}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="780" y="140" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="800" fill="${RED}">!</text>`],

  "stroke-awareness": [P.clin, (p) => `
  ${phone(470, 220, 1.1, "#e9f4f2", `<text x="0" y="-12" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="800" fill="${RED}">999</text><circle cx="0" cy="38" r="22" fill="#16a34a"/><path d="M-10 32 c4 10 10 16 20 18 l4 -6 l-8 -4 l-4 4 c-4 -2 -8 -6 -10 -10 l4 -4 l-4 -8 Z" fill="${WHITE}"/>`)}
  ${clock(680, 150, 60, DARK, p.accent)}
  <g font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" fill="${WHITE}" text-anchor="middle">
    ${["F","A","S","T"].map((l,i)=>`<rect x="${600 + i * 66}" y="260" width="56" height="56" rx="14" fill="${i === 3 ? RED : p.accent}"/><text x="${628 + i * 66}" y="299">${l}</text>`).join("")}
  </g>`],

  "oral-care": [P.clin, (p) => `
  <path d="M470 150 c-40 -10 -60 20 -56 60 c4 40 16 70 22 110 c4 24 30 24 34 0 l10 -50 c2 -10 18 -10 20 0 l10 50 c4 24 30 24 34 0 c6 -40 18 -70 22 -110 c4 -40 -16 -70 -56 -60 c-14 4 -26 8 -40 0 Z" fill="${WHITE}"/>
  <circle cx="474" cy="218" r="5" fill="${INK}"/><circle cx="534" cy="218" r="5" fill="${INK}"/><path d="M490 242 q14 12 28 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g transform="rotate(-35 720 220)"><rect x="620" y="210" width="230" height="26" rx="13" fill="${p.light}"/><rect x="780" y="184" width="70" height="28" rx="6" fill="${WHITE}"/><g stroke="${SKY}" stroke-width="7">${[0,1,2,3,4,5].map((i)=>`<path d="M${786 + i * 11} 184 v-26"/>`).join("")}</g><path d="M786 156 h64" stroke="${WHITE}" stroke-width="10" stroke-linecap="round"/></g>
  ${sparkle(380, 140, 16)}${sparkle(610, 120, 12)}`],

  "catheter-care": [P.clin, (p) => `
  <path d="M420 160 h150 l-12 210 h-126 Z" fill="${WHITE}" opacity=".9"/><path d="M425 250 h140 l-7 120 h-126 Z" fill="#f6e7a8"/><path d="M570 180 c40 0 40 80 0 80" stroke="${WHITE}" stroke-width="14" fill="none"/><path d="M420 160 l-20 -14" stroke="${WHITE}" stroke-width="12" stroke-linecap="round"/>
  <g stroke="${p.accent}" stroke-width="5" stroke-linecap="round">${[0,1,2,3].map((i)=>`<path d="M440 ${200 + i * 40} h${i % 2 ? 20 : 34}"/>`).join("")}</g>
  ${drop(690, 180, 1.1, SKY)}${tick(690, 200, 0.8, WHITE, 10)}
  ${clipboard(760, 200, 120, 170, { ticks: 3, lines: 4, bar: p.light })}`],

  "continence-care": [P.clin, (p) => `
  <rect x="440" y="90" width="220" height="300" rx="14" fill="${WHITE}"/><rect x="458" y="108" width="184" height="282" rx="8" fill="${p.light}"/>
  <rect x="500" y="150" width="100" height="100" rx="16" fill="${WHITE}"/><text x="550" y="216" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="800" fill="${p.accent}">WC</text><circle cx="616" cy="270" r="8" fill="${YELLOW}"/>
  <rect x="700" y="270" width="100" height="100" rx="50" fill="${WHITE}"/><circle cx="750" cy="320" r="18" fill="#e3ebe9"/><path d="M800 320 v60 h-50" fill="${WHITE}"/><rect x="750" y="320" width="50" height="60" fill="${WHITE}"/>
  ${clock(330, 170, 50, DARK, p.accent)}
  ${heart(750, 180, 0.6)}`],

  "peg-feeding": [P.clin, (p) => `
  <path d="M560 60 v330 M500 390 h120" stroke="${GREY}" stroke-width="12" stroke-linecap="round"/><path d="M520 80 h80" stroke="${GREY}" stroke-width="10" stroke-linecap="round"/>
  <rect x="490" y="90" width="90" height="130" rx="20" fill="${WHITE}"/><rect x="500" y="140" width="70" height="70" rx="14" fill="#f2e3c6"/>
  <path d="M535 220 v40 c0 40 80 30 120 60 c30 22 50 40 70 40" stroke="${p.light}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <rect x="610" y="230" width="90" height="70" rx="12" fill="${DARK}"/><rect x="622" y="242" width="66" height="26" rx="6" fill="#bfe8d6"/><circle cx="636" cy="284" r="6" fill="#16a34a"/><circle cx="674" cy="284" r="6" fill="${p.light}"/>
  ${heart(360, 200, 0.9)}`],

  "stoma-care": [P.clin, (p) => `
  <rect x="320" y="270" width="520" height="110" rx="22" fill="${WHITE}"/>
  <path d="M420 290 c-50 0 -60 -130 0 -140 c60 10 50 140 0 140 Z" fill="#efe7fb" stroke="${p.light}" stroke-width="6"/><circle cx="420" cy="190" r="22" fill="none" stroke="${p.accent}" stroke-width="6"/>
  <rect x="520" y="180" width="140" height="110" rx="14" fill="${p.light}"/><rect x="540" y="200" width="100" height="18" rx="9" fill="${WHITE}"/>
  <g transform="rotate(-20 760 240)"><circle cx="730" cy="270" r="18" fill="none" stroke="${DARK}" stroke-width="8"/><circle cx="770" cy="270" r="18" fill="none" stroke="${DARK}" stroke-width="8"/><path d="M740 256 L800 190 M760 256 L720 190" stroke="${GREY}" stroke-width="9" stroke-linecap="round"/></g>
  ${tick(800, 330, 0.9, "#16a34a", 12)}`],

  "tracheostomy-awareness": [P.clin, (p) => `
  <path d="M560 90 v90" stroke="${WHITE}" stroke-width="30" stroke-linecap="round"/>
  <path d="M545 170 c-40 0 -120 40 -130 140 c-4 40 40 50 70 30 c30 -20 50 -60 50 -110 Z" fill="${CORAL}"/>
  <path d="M575 170 c40 0 120 40 130 140 c4 40 -40 50 -70 30 c-30 -20 -50 -60 -50 -110 Z" fill="${CORAL}" opacity=".85"/>
  <g stroke="${p.light}" stroke-width="8" fill="none" stroke-linecap="round" opacity=".9"><path d="M320 140 q40 -20 80 0 t80 0"/><path d="M300 180 q40 -20 80 0"/><path d="M660 120 q40 -20 80 0 t80 0"/><path d="M700 160 q40 -20 80 0"/></g>
  <rect x="770" y="260" width="90" height="110" rx="16" fill="${WHITE}"/><path d="M790 290 h50 M790 310 h50 M790 330 h30" stroke="#e3ebe9" stroke-width="8" stroke-linecap="round"/>`],

  // Governance & Records
  "information-governance-and-gdpr": [P.gov, (p) => `
  <path d="M380 168 L380 140 Q380 128 392 128 L480 128 L500 150 Z" fill="${p.accent}"/><rect x="380" y="150" width="320" height="220" rx="18" fill="${p.accent}"/>
  ${paper(405, 110, 250, 180, { rot: -4, bar: p.light, lines: 4 })}
  <rect x="380" y="200" width="320" height="170" rx="18" fill="${p.light}"/>
  ${padlock(690, 250, 0.95)}
  ${shield(270, 190, 0.85, WHITE, p.accent, tick(0, 4, 1.2, "#16a34a", 13))}`],

  "record-keeping-and-documentation": [P.gov, (p) => `
  <rect x="400" y="100" width="300" height="280" rx="16" fill="${p.accent}"/>${paper(420, 112, 270, 258, { lines: 8, bar: p.light, ticks: 0 })}
  <g fill="${p.accent}">${[0,1,2,3,4,5].map((i)=>`<circle cx="410" cy="${136 + i * 44}" r="8"/>`).join("")}</g>
  <g transform="rotate(40 740 220)"><rect x="680" y="208" width="160" height="24" rx="8" fill="${YELLOW}"/><path d="M840 208 l34 12 l-34 12 Z" fill="#f3d9b1"/><path d="M864 216 l10 4 l-10 4 Z" fill="${INK}"/><rect x="680" y="208" width="28" height="24" rx="8" fill="${CORAL}"/></g>
  ${clock(300, 180, 52, DARK, p.accent)}`],

  "duty-of-candour": [P.gov, (p) => `
  ${person({ x: 430, skin: "b", hair: "short", hairColor: "brown", top: p.accent, uniform: true })}
  ${person({ x: 700, skin: "d", hair: "long", hairColor: "black", top: "#e8b04b", mood: "neutral" })}
  ${bubble(370, 60, 170, 80, { content: heart(455, 96, 0.5) })}
  ${bubble(640, 80, 140, 70, { tail: 1, content: "lines", color: "#cfe4f5" })}`],

  // Person & Service Quality
  "care-planning": [P.psq, (p) => `
  ${clipboard(470, 90, 230, 300, { ticks: 4, lines: 7, bar: p.accent })}
  ${person({ x: 330, s: 0.8, skin: "c", hair: "grey", hairColor: "grey", top: "#e9a6a6", glasses: true })}
  <rect x="740" y="130" width="130" height="120" rx="16" fill="${WHITE}"/><rect x="740" y="130" width="130" height="34" rx="16" fill="${CORAL}"/><rect x="740" y="150" width="130" height="14" fill="${CORAL}"/>
  <g fill="#e3ebe9">${[0,1,2,3].map((c)=>[0,1].map((r)=>`<rect x="${756 + c * 28}" y="${180 + r * 30}" width="18" height="18" rx="4"/>`).join("")).join("")}</g><rect x="812" y="210" width="18" height="18" rx="4" fill="${p.accent}"/>`],

  "complaints-handling": [P.psq, (p) => `
  ${bubble(380, 90, 200, 110, { content: `<text x="480" y="168" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="800" fill="${CORAL}">!</text>` })}
  ${bubble(580, 210, 220, 100, { tail: 1, content: tick(690, 260, 1.2, p.accent, 14) })}
  <g transform="rotate(-8 330 300)"><rect x="260" y="260" width="150" height="100" rx="12" fill="${WHITE}"/><path d="M260 272 l75 50 l75 -50" stroke="${p.light}" stroke-width="7" fill="none" stroke-linejoin="round"/></g>`],

  "conflict-resolution": [P.psq, (p) => `
  <path d="M370 110 l30 20 l20 -30 l20 34 l34 -16 l-4 36 l34 10 l-26 24 l20 28 l-36 2 l-4 34 l-28 -20 l-26 24 l-10 -34 l-34 4 l14 -32 l-30 -18 l32 -14 l-8 -34 Z" fill="${CORAL}"/>
  <path d="M500 220 h80" stroke="${p.accent}" stroke-width="12" stroke-linecap="round"/><path d="M566 200 l24 20 l-24 20" stroke="${p.accent}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${bubble(620, 140, 200, 110, { content: heart(720, 186, 0.7, p.accent) })}
  ${person({ x: 860, s: 0.62, skin: "e", hair: "short", hairColor: "black", top: "#7aa6c2" })}
  ${person({ x: 280, s: 0.62, skin: "a", hair: "bun", hairColor: "brown", top: "#e8b04b", mood: "neutral" })}`],

  "behaviours-that-challenge": [P.psq, (p) => `
  ${person({ x: 690, skin: "b", hair: "bald", hairColor: "silver", top: "#8aa1c1", mood: "worried", glasses: true })}
  <path d="M660 70 c10 -20 30 -20 40 0 c10 -20 34 -10 30 10 c18 4 18 30 0 34 h-70 c-20 -4 -20 -40 0 -44 z" fill="${WHITE}"/><path d="M670 90 l12 8 l12 -12 l12 12 l12 -8" stroke="${CORAL}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${person({ x: 440, skin: "d", hair: "curly", hairColor: "black", top: p.accent, uniform: true })}
  ${bubble(380, 70, 160, 80, { content: heart(460, 108, 0.5, p.accent) })}`],

  "positive-behaviour-support": [P.psq, (p) => `
  ${person({ x: 430, skin: "a", hair: "spiky", hairColor: "red", top: "#7aa6c2", mood: "grin", arm: { x: 560, y: 150, side: 1, open: true, lift: 50 } })}
  ${person({ x: 690, skin: "e", hair: "short", hairColor: "black", top: p.accent, mood: "grin", uniform: true, arm: { x: 590, y: 150, side: -1, open: true, lift: 50 } })}
  ${sparkle(575, 100, 18)}${star(800, 110, 20)}${star(320, 120, 16)}`],

  "personal-care": [P.psq, (p) => `
  <rect x="330" y="300" width="560" height="22" rx="11" fill="${WHITE}"/>
  <path d="M380 300 v-110 h130 v110" fill="${p.light}"/><path d="M380 230 h130" stroke="${WHITE}" stroke-width="10"/><path d="M380 260 h130" stroke="${p.accent}" stroke-width="6" opacity=".5"/>
  <rect x="560" y="180" width="70" height="120" rx="20" fill="${CORAL}"/><rect x="578" y="150" width="34" height="34" rx="6" fill="${DARK}"/>
  <rect x="660" y="160" width="60" height="140" rx="12" fill="${WHITE}"/><g stroke="${SKY}" stroke-width="6">${[0,1,2,3].map((i)=>`<path d="M${672 + i * 12} 160 v-30"/>`).join("")}</g>
  <ellipse cx="800" cy="280" rx="56" ry="22" fill="#f2e3c6"/><g fill="${WHITE}"><circle cx="780" cy="250" r="12"/><circle cx="806" cy="240" r="9"/><circle cx="826" cy="254" r="7"/></g>
  <rect x="740" y="120" width="120" height="110" rx="55" fill="#dff3ec" stroke="${WHITE}" stroke-width="10"/>`],

  "end-of-life-care": [P.psq, (p) => `
  <rect x="560" y="70" width="260" height="230" rx="16" fill="${WHITE}"/><rect x="576" y="86" width="228" height="198" rx="8" fill="#fde2c4"/>
  <circle cx="690" cy="244" r="38" fill="${ORANGE}"/><rect x="576" y="250" width="228" height="34" fill="#9cc5a1"/><path d="M690 86 v198 M576 185 h228" stroke="${WHITE}" stroke-width="10"/>
  <path d="M400 380 c-30 0 -40 -40 -30 -70 h120 c10 30 0 70 -30 70 Z" fill="${p.light}"/>
  <path d="M430 310 c-6 -50 -30 -80 -50 -100 M440 310 c4 -60 20 -100 40 -120 M436 310 c0 -70 0 -110 -4 -140" stroke="#3d7a4b" stroke-width="6" fill="none"/>
  <g fill="${CORAL}"><circle cx="380" cy="206" r="20"/><circle cx="480" cy="186" r="20"/></g><g fill="${YELLOW}"><circle cx="432" cy="166" r="20"/></g>
  ${heart(330, 120, 0.6, CORAL, 0.8)}`],

};

const want = process.argv.slice(2);
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT, { recursive: true });
  let count = 0;
  for (const [slug, [pal, draw, opts]] of Object.entries(SCENES)) {
    if (want.length && !want.includes(slug)) continue;
    writeFileSync(`${OUT}/${slug}.svg`, frame(pal, draw(pal), opts));
    count++;
  }
  console.log(`${count} covers written to ${OUT}`);
}
