import type { PolicyBlock } from "@/lib/policy-library";

/**
 * A policy's text, as read by a customer, a carer, or a platform admin
 * previewing it. One renderer for all three, so guidance looks like guidance
 * everywhere — a bracketed note styled as policy text on one screen and as a
 * highlight on another would be two different documents.
 */
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
              {block.text}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
