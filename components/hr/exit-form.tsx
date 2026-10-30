"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/recruit/application-fields";
import { isShown, type Answers } from "@/lib/recruitment-application";
import { EXIT_SECTIONS } from "@/lib/hr/leavers";

/** The exit interview, on their login or from the link (HR-PACK.md). */
export function ExitForm({ submit }: { submit: (answers: Answers) => Promise<{ ok: boolean; error?: string }> }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <p className="text-sm">Thank you. Your answers have been sent.</p>;
  return (
    <div className="space-y-5">
      {EXIT_SECTIONS.map((s) => (
        <section key={s.id} className="space-y-3">
          <h3 className="font-semibold">{s.title}</h3>
          {s.fields.filter((f) => isShown(f, answers)).map((f) => (
            <Field key={f.id} field={f} value={answers[f.id] as string | string[] | boolean | undefined} onChange={(v) => setAnswers({ ...answers, [f.id]: v })} errors={[]} path={f.id} />
          ))}
        </section>
      ))}
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await submit(answers);
              if (!r.ok) return setMessage(r.error ?? "It didn't send.");
              setSent(true);
            })
          }
        >
          Send my answers
        </Button>
        {message && <span role="status" className="text-sm text-destructive">{message}</span>}
      </div>
    </div>
  );
}
