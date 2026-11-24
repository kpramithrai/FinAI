import { useEffect, useId, useState } from "react";
import { Check, Loader2, PenLine } from "lucide-react";
import type { Item } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

/** One clarifying question at a time, then a single submission to the backend. */
export function Questions({
  item,
  pending,
  onReply,
}: {
  item: Item;
  pending: boolean;
  onReply: (body: unknown) => Promise<boolean>;
}) {
  const groupName = useId();
  const questions = item.questions || [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(false);
  const answered = Boolean(item.answers) || sent;

  useEffect(() => {
    if (!item.answers) return;
    setValues(Object.fromEntries(item.answers.map((a) => [a.questionId, a.value || ""])));
  }, [item.answers]);

  if (answered) {
    return (
      <div className="ml-auto flex w-full max-w-[85%] flex-col gap-2 rounded-3xl bg-secondary px-5 py-4 text-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Check className="size-3.5" />
          Answered {questions.length} questions
        </div>
        <dl className="grid gap-2.5">
          {questions.map((q) => (
            <div key={q.id}>
              <dt className="text-muted-foreground">{q.text}</dt>
              <dd className="font-medium">
                {values[q.id]?.trim() || (
                  <span className="font-normal italic text-muted-foreground">Skipped. Added to open issues.</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const q = questions[index];
  if (!q) return null;
  const last = index === questions.length - 1;
  const pick = (label: string) => {
    setCustom((c) => ({ ...c, [q.id]: false }));
    setValues((v) => ({ ...v, [q.id]: label }));
  };

  async function submit() {
    const ok = await onReply({
      itemId: item.id,
      answers: questions.map((x) => ({ questionId: x.id, value: values[x.id]?.trim() || null })),
    });
    if (ok) setSent(true);
  }

  return (
    <section className="w-full space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
          <span>Question {index + 1} of {questions.length}</span>
          <Progress
            value={((index + 1) / questions.length) * 100}
            aria-label="Question progress"
            className="h-1 w-12 bg-accent"
          />
        </div>
        {questions.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {questions.map((question, i) => (
              <Button
                key={question.id}
                variant="ghost"
                size="icon-xs"
                aria-label={`Go to question ${i + 1}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => setIndex(i)}
                className="text-xs text-muted-foreground aria-[current=step]:bg-accent aria-[current=step]:text-accent-foreground"
              >
                {i + 1}
              </Button>
            ))}
          </div>
        )}
      </div>

      <fieldset className="min-w-0">
        <legend className="text-[17px] font-semibold leading-snug">{q.text}</legend>
        {q.why && <p className="mt-1 text-sm text-muted-foreground">{q.why}</p>}
        <div className="mt-3 grid gap-1">
          {q.options.map((o) => {
            const chosen = !custom[q.id] && values[q.id] === o.label;
            return (
              <label
                key={o.label}
                className="group flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm hover:bg-muted has-checked:border-primary/25 has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-default"
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={groupName}
                  checked={chosen}
                  disabled={pending}
                  onChange={() => pick(o.label)}
                />
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background group-has-checked:border-primary group-has-checked:bg-primary group-has-checked:text-primary-foreground"
                >
                  {chosen && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 break-words">{o.label}</span>
                {o.recommended && (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    Suggested
                  </Badge>
                )}
              </label>
            );
          })}
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground hover:bg-muted has-checked:border-primary/25 has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-default">
            <input
              type="radio"
              className="sr-only"
              name={groupName}
              checked={Boolean(custom[q.id])}
              disabled={pending}
              onChange={() => {
                setCustom((c) => ({ ...c, [q.id]: true }));
                setValues((v) => ({ ...v, [q.id]: "" }));
              }}
            />
            <PenLine aria-hidden="true" className="size-4 shrink-0" />
            Write my own answer
          </label>
          {custom[q.id] && (
            <Input
              autoFocus
              aria-label={`Your answer to question ${index + 1}`}
              maxLength={500}
              value={values[q.id] || ""}
              placeholder="Type your answer…"
              className="h-10 rounded-lg px-3"
              onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !last) setIndex(index + 1);
              }}
            />
          )}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          {!last && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                pick("");
                setIndex(index + 1);
              }}
            >
              Skip
            </Button>
          )}
          {last ? (
            <Button disabled={pending} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />}
              Create requirements
            </Button>
          ) : (
            <Button onClick={() => setIndex(index + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Skipped questions become open issues in the requirements.
      </p>
    </section>
  );
}
