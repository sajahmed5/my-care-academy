import type { Letter } from "@/lib/recruitment-letters";

/** The letter as the candidate will read it (the email renders the same data). */
export function LetterPreview({ letter }: { letter: Letter }) {
  return (
    <article aria-label="The letter" className="rounded-2xl border bg-white p-6 text-[15px] leading-relaxed text-slate-800 shadow-sm">
      <p className="border-b-2 border-slate-800 pb-2 text-xl font-semibold text-slate-900">{letter.company || "Your company"}</p>
      <p className="mt-4 text-sm text-slate-500">{letter.date}</p>
      <p className="mt-3">{letter.greeting}</p>
      {letter.blocks.map((b, i) => (
        <div key={i}>
          {b.heading && <h3 className="mt-5 font-semibold text-slate-900">{b.heading}</h3>}
          {b.paragraphs.map((p, j) => (
            <p key={j} className="mt-3 whitespace-pre-line">{p}</p>
          ))}
          {b.list && (
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {b.list.map((l, j) => <li key={j}>{l}</li>)}
            </ul>
          )}
        </div>
      ))}
      <p className="mt-4">Yours sincerely,</p>
      {letter.signers.map((s, i) => (
        <p key={i} className="mt-4">
          <strong>{s.name || "(who is signing?)"}</strong>
          {s.title && <><br />{s.title}</>}
          {letter.company && <><br />{letter.company}</>}
        </p>
      ))}
      <p className="mt-6 border-t pt-3 text-center text-xs text-slate-500">Sent for {letter.company || "your company"} by My Care Academy.</p>
    </article>
  );
}
