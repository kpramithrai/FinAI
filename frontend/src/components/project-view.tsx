import { useState } from "react";
import { Check, CircleCheck, Loader2, ShieldAlert } from "lucide-react";
import type { Item, SRS } from "@/lib/types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Composer } from "@/components/composer";
import { Delegation } from "@/components/activity";
import { IeeeCard, SdlcDocument, SrsDocument } from "@/components/documents";
import { cn } from "@/lib/utils";

type Echo = { id: string; after: string | null; text: string };

const STEPS = [
  { name: "Brief", stages: ["intake"] },
  { name: "Requirements", stages: ["srs"] },
  { name: "SDLC", stages: ["sdlc", "review"] },
];

function Stepper({ stage }: { stage: string }) {
  const current = stage === "done" ? STEPS.length : STEPS.findIndex((s) => s.stages.includes(stage));
  return (
    <ol className="hidden items-center gap-1 text-xs md:flex" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.name} className="flex items-center gap-1">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1",
              i < current && "text-muted-foreground",
              i === current && "bg-accent font-medium text-accent-foreground",
              i > current && "text-muted-foreground",
            )}
          >
            {i < current ? (
              <Check className="size-3" />
            ) : (
              <span className={cn("size-1.5 rounded-full", i === current ? "bg-primary" : "bg-input")} />
            )}
            {s.name}
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

export { Stepper };

function UserBubble({ text }: { text: string }) {
  return (
    <Message from="user">
      <MessageContent className="max-w-[85%] whitespace-pre-wrap rounded-2xl! rounded-tr-sm! border border-border bg-accent! text-accent-foreground! px-5! py-3! text-[15px] leading-relaxed">
        {text}
      </MessageContent>
    </Message>
  );
}

function workingText(stage: string) {
  if (stage === "intake") return "Reading your brief and retrieving references…";
  if (stage === "sdlc" || stage === "handoff") return "Evaluating lifecycle options…";
  return "Drafting requirements from your answers…";
}

export function ProjectView({
  items,
  stage,
  agents,
  pending,
  brief,
  onReply,
}: {
  items: Item[];
  stage: string;
  agents: ("analyst" | "planner" | "writer")[];
  pending: boolean;
  brief?: string;
  onReply: (body: unknown) => Promise<boolean>;
}) {
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const lastId = items.at(-1)?.id ?? null;
  const srs = [...items].reverse().find((item) => item.kind === "srs")?.srs;
  const done = stage === "done";
  const working = agents.length > 0 && !done;

  async function send(text: string) {
    const ok = await onReply({ text });
    if (ok)
      setEchoes((e) => [
        ...e,
        { id: `msg-${Date.now()}`, after: lastId, text },
      ]);
    return ok;
  }

  const echoesAfter = (id: string | null) =>
    echoes.filter((e) => e.after === id).map((e) => <UserBubble key={e.id} text={e.text} />);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-[760px] gap-6 px-4 pb-10 pt-8">
          {brief && <UserBubble text={brief} />}
          {echoesAfter(null)}
          {items.map((item) => (
            <div key={item.id} className="contents">
              <Row item={item} srs={srs} pending={pending} onReply={onReply} />
              {echoesAfter(item.id)}
            </div>
          ))}
          {working && (
            <div role="status" className="flex items-center gap-3 text-sm">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="font-medium">{agents.includes("analyst") ? "Analyst" : agents.includes("writer") ? "IEEE Writer" : "Planner"}</span>
              <Shimmer className="text-sm">{workingText(stage)}</Shimmer>
            </div>
          )}
          {items.length === 0 && (
            <div role="status" className="flex items-center gap-3 text-sm">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <Shimmer className="text-sm">Opening your project…</Shimmer>
            </div>
          )}
          {done && items.some((i) => i.kind === "sdlc") && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-success" />
              Your project plan is ready for review.
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton className="bottom-4 rounded-full shadow-md" />
      </Conversation>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-4">
        <PromptInputProvider>
          <Composer
            onSubmit={send}
            pending={pending}
            disabled={done}
            maxLength={2000}
            placeholder={
              done
                ? "This project is complete. Start a new project from the sidebar."
                : "Message FinAI…"
            }
          />
        </PromptInputProvider>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Generated documents are drafts. Regulatory interpretations need qualified human review.
        </p>
      </div>
    </div>
  );
}

function Row({
  item,
  srs,
  pending,
  onReply,
}: {
  item: Item;
  srs?: SRS;
  pending: boolean;
  onReply: (body: unknown) => Promise<boolean>;
}) {
  switch (item.kind) {
    case "bot":
      return (
        <Message from="assistant" className="max-w-full">
          <MessageContent className="text-[15px] leading-relaxed">
            <MessageResponse>{item.text || ""}</MessageResponse>
          </MessageContent>
        </Message>
      );
    case "event":
      return item.strong ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-4 items-center justify-center rounded-full bg-muted">
            <Check className="size-2.5" />
          </span>
          {item.text}
          <span className="font-medium text-foreground">{item.strong}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {item.text === "FinAI is waking up" ? "Project started" : item.text}
        </div>
      );
    case "delegation":
      return <Delegation item={item} />;
    case "srs":
      return item.srs ? <SrsDocument srs={item.srs} /> : null;
    case "sdlc":
      return item.sdlc ? <SdlcDocument sdlc={item.sdlc} /> : null;
    case "ieee": {
      return item.ieee && srs ? <IeeeCard title={item.title || "IEEE 830 SRS"} ieee={item.ieee} srs={srs} /> : null;
    }
    case "notice":
      return (
        <Alert className="rounded-xl border-warning-border bg-warning-surface text-warning">
          <ShieldAlert className="text-warning!" />
          <AlertTitle>{item.title}</AlertTitle>
          <AlertDescription className="text-warning">{item.text}</AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}
