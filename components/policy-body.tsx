import type { PolicyBlock } from "@/lib/policy-library";

/**
 * A policy's text, as read by a customer, a carer, or a platform admin
 * previewing it. One renderer for all three, so guidance looks like guidance
 * everywhere — a bracketed note styled as policy text on one screen and as a
 * highlight on another would be two different documents.
 *
 * Guidance comes in two shapes. A whole paragraph in brackets is a `guidance`
 * block and gets its own panel. A bracket inside a sentence — "Version: [X.X]
 * | Date approved: [DD/MM/YYYY]" — is a fill-in, and is highlighted in place
 * so it reads as something to complete rather than as the policy saying
 * "X.X". The 24 Oct 2026 audit found 69 of those hiding in plain text.
 */

const FILL_IN = /(\[[^\]]+\])/g;

function withFillIns(text: string) {
  const parts = text.split(FILL_IN);
  if (parts.length === 1) return text;
  // Not FILL_IN.test(): a global regex keeps lastIndex between calls and
  // would miss every other bracket.
  return parts.map((part, i) =>
    part.startsWith("[") && part.endsWith("]") ? (
      <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function PolicyBody({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h3
              key={i}
              className={
                (block.level ?? 1) <= 1
                  ? "pt-2 text-base font-semibold"
                  : "pt-1 text-sm font-semibold"
              }
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === "guidance") {
          return (
            <p
              key={i}
              className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900"
            >
              {block.text}
            </p>
          );
        }
        if (block.type === "bullet") {
          return (
            <p key={i} className="pl-5 text-sm before:-ml-4 before:mr-2 before:content-['•']">
              {withFillIns(block.text)}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed">
            {withFillIns(block.text)}
          </p>
        );
      })}
    </div>
  );
}
