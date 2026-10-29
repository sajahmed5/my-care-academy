import { parseBody, type CompanySignature, type PartState, type SnapshotPart } from "@/lib/signing-documents";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** One part's text, as written ("## " headings, "- " bullets). */
export function DocumentBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {parseBody(body).map((b, i) =>
        b.type === "heading" ? (
          <h3 key={i} className="pt-2 font-semibold">{b.text}</h3>
        ) : b.type === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

/** A signature, or a declined part, with when. */
export function SignatureLine({ state, declineLabel }: { state: PartState | undefined; declineLabel?: string }) {
  if (!state) return <p className="text-sm text-muted-foreground">Not signed yet.</p>;
  if (state.declined) {
    return <p className="text-sm">Chose: &ldquo;{declineLabel ?? "Not signed"}&rdquo;{state.signedAt && `, ${when(state.signedAt)}`}.</p>;
  }
  return (
    <div className="text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {state.dataUrl && <img src={state.dataUrl} alt={`Signature of ${state.signedName ?? "the candidate"}`} className="h-16 rounded border bg-white" />}
      <p className="mt-1">{state.signedName}{state.signedAt && `, ${when(state.signedAt)}`}</p>
    </div>
  );
}

/** The whole signed copy: every part, each signature, and the company's. */
export function SignedDocument({
  parts,
  state,
  company,
  companyName,
}: {
  parts: SnapshotPart[];
  state: Record<string, PartState>;
  company: CompanySignature | null;
  companyName: string;
}) {
  return (
    <div className="space-y-4">
      {parts.map((p) => (
        <section key={p.id} aria-label={p.title} className="rounded-2xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {p.title}
            {p.version > 0 ? ` · your wording, version ${p.version}` : ""}
          </p>
          <div className="mt-2"><DocumentBody body={p.body} /></div>
          <div className="mt-4 border-t pt-3"><SignatureLine state={state[p.id]} declineLabel={p.declineLabel} /></div>
        </section>
      ))}
      {company && (
        <section aria-label="Signed for the company" className="rounded-2xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed for {companyName}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={company.dataUrl} alt={`Signature of ${company.signedName}`} className="mt-2 h-16 rounded border bg-white" />
          <p className="mt-1 text-sm">
            {company.signedName}{company.signedTitle && `, ${company.signedTitle}`}, {when(company.signedAt)}
          </p>
        </section>
      )}
    </div>
  );
}
