"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { QuestionType } from "@/lib/quiz";
import {
  addQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
} from "@/app/platform/course-actions";

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  answerIndex: number;
  /** The correct answer as text, for the read-only (non-MCQ) rows. */
  correct: string;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  multi: "Select all that apply",
  true_false: "True / false",
  fill_blank: "Fill the gap",
  hotspot: "Click the image",
};

function pad(options: string[]): string[] {
  const o = [...options];
  while (o.length < 4) o.push("");
  return o.slice(0, 4);
}

function QuestionRow({
  courseId,
  q,
  onDeleted,
}: {
  courseId: string;
  q: Question;
  onDeleted: (id: string) => void;
}) {
  const [question, setQuestion] = useState(q.question);
  const [options, setOptions] = useState(pad(q.options));
  const [answerIndex, setAnswerIndex] = useState(q.answerIndex);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateQuestionAction(q.id, courseId, {
      question,
      options,
      answerIndex,
    });
    setBusy(false);
    setMsg(res.ok ? "Saved" : (res.error ?? "Error"));
  }

  async function remove() {
    setBusy(true);
    const res = await deleteQuestionAction(q.id, courseId);
    setBusy(false);
    if (res.ok) onDeleted(q.id);
    else setMsg(res.error ?? "Error");
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="font-medium"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt, i) => (
          <label key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${q.id}`}
              checked={answerIndex === i}
              onChange={() => setAnswerIndex(i)}
              title="Mark correct"
            />
            <Input
              value={opt}
              onChange={(e) =>
                setOptions((prev) =>
                  prev.map((o, idx) => (idx === i ? e.target.value : o)),
                )
              }
              placeholder={`Option ${i + 1}`}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}>
          Save
        </Button>
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          Delete
        </Button>
        <span className="text-xs text-muted-foreground">
          Select the radio next to the correct option. {msg}
        </span>
      </div>
    </div>
  );
}

/**
 * Non-MCQ questions keep their answer in `payload`, which this MCQ form can't
 * represent — saving one here would overwrite it — so they are display-only.
 */
function ReadOnlyQuestionRow({ q }: { q: Question }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{q.question}</p>
        <Badge variant="secondary" className="shrink-0">
          {TYPE_LABEL[q.type]}
        </Badge>
      </div>
      {q.options.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {q.options.map((opt, i) => (
            <li key={i}>{opt}</li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        <span className="text-muted-foreground">Correct answer: </span>
        {q.correct || "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        Read-only — only multiple-choice questions can be edited here.
      </p>
    </div>
  );
}

export function QuestionEditor({
  courseId,
  initialQuestions,
}: {
  courseId: string;
  initialQuestions: Question[];
}) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [nq, setNq] = useState("");
  const [nopts, setNopts] = useState(["", "", "", ""]);
  const [ncorrect, setNcorrect] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setMsg(null);
    const res = await addQuestionAction(courseId, {
      question: nq,
      options: nopts,
      answerIndex: ncorrect,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? "Error");
      return;
    }
    setQuestions((prev) => [
      {
        id: res.id!,
        type: "mcq",
        question: nq,
        options: nopts,
        answerIndex: ncorrect,
        correct: nopts[ncorrect],
      },
      ...prev,
    ]);
    setNq("");
    setNopts(["", "", "", ""]);
    setNcorrect(0);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-dashed p-4">
        <Label>New question</Label>
        <Input
          value={nq}
          onChange={(e) => setNq(e.target.value)}
          placeholder="Question text"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {nopts.map((opt, i) => (
            <label key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="new-correct"
                checked={ncorrect === i}
                onChange={() => setNcorrect(i)}
              />
              <Input
                value={opt}
                onChange={(e) =>
                  setNopts((prev) =>
                    prev.map((o, idx) => (idx === i ? e.target.value : o)),
                  )
                }
                placeholder={`Option ${i + 1}`}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={add} disabled={busy}>
            Add question
          </Button>
          {msg && <span className="text-xs text-destructive">{msg}</span>}
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {questions.length} question(s) in this bank.
        </p>
        {questions.map((q) =>
          q.type === "mcq" ? (
            <QuestionRow
              key={q.id}
              courseId={courseId}
              q={q}
              onDeleted={(id) =>
                setQuestions((prev) => prev.filter((x) => x.id !== id))
              }
            />
          ) : (
            <ReadOnlyQuestionRow key={q.id} q={q} />
          ),
        )}
      </div>
    </div>
  );
}
