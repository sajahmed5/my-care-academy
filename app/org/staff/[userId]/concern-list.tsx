import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { kindLabel, statusLabel } from "@/lib/complaints/stages";
import { categoryLabel, type Suggestion } from "@/lib/complaints/categories";
import type { PersonConcern } from "@/lib/complaints/person";
import type { Compliment } from "@/lib/complaints/compliments";
import { ComplimentCard } from "@/app/org/complaints/compliments/compliment-form";
import { SuggestedTraining } from "@/app/org/complaints/suggested-training";
import { formatDate } from "@/lib/dates";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The concerns this member of staff is named in — complaints, safeguarding,
 * issues, accidents and near misses — and, under each, the training it
 * suggests.
 *
 * Nothing here assigns anything on its own. The suggestion is the clever part;
 * the decision is the manager's, and it is recorded with their reason so the
 * file reads "reviewed and assigned on the 3rd" rather than "the system did
 * something to this carer on receipt of a complaint".
 */
export function ConcernList({
  userId,
  concerns,
  compliments,
  suggestions,
}: {
  userId: string;
  concerns: PersonConcern[];
  /** The thanks as well as the complaints: a file is read as a whole. */
  compliments: Compliment[];
  suggestions: Record<string, Suggestion[]>;
}) {
  return (
    <div className="space-y-3">
      {compliments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {compliments.length} compliment{compliments.length === 1 ? "" : "s"}
          </p>
          {compliments.map((c) => (
            <ComplimentCard key={c.id} compliment={c} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {concerns.length === 0
            ? "Nothing raised naming this person."
            : `${concerns.length} concern${concerns.length === 1 ? "" : "s"} naming this person.`}
        </p>
        <Link href={`/org/complaints/new?person=${userId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Plus className="size-4" />
          Raise a concern
        </Link>
      </div>

      {concerns.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/org/complaints/${c.id}`} className="font-medium hover:underline">
                <span className="font-mono text-xs text-muted-foreground">{c.reference}</span> · {kindLabel(c.kind)}
                {c.category ? ` · ${categoryLabel(c.category)}` : ""} · {fmtDate(c.occurredOn)}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? "bg-muted text-muted-foreground"}`}>
                {statusLabel(c.status)}
              </span>
            </div>

            <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>
            {/* A concern can lead to a disciplinary case, linked to it (HR-PACK.md). */}
            <Link
              href={`/org/hr/cases/new?user=${userId}&from=concern&fromId=${c.id}&label=${encodeURIComponent(`${c.reference} · ${kindLabel(c.kind)}`)}`}
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              Open a disciplinary case from this →
            </Link>

            {c.outcome && (
              <p className="rounded-lg bg-muted/40 p-3 text-sm">
                <span className="font-medium">Outcome:</span> {c.outcome}
                {c.closedOn && <span className="text-muted-foreground"> · closed {fmtDate(c.closedOn)}</span>}
              </p>
            )}

            {c.people.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Also named:{" "}
                {c.people
                  .filter((p) => p.user_id !== userId)
                  .map((p) => p.name ?? "someone no longer on the system")
                  .join(", ")}
              </p>
            )}

            <SuggestedTraining complaintId={c.id} userId={userId} suggestions={suggestions[c.id] ?? []} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
