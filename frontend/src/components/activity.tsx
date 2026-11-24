import { ArrowRight, Bot, ChevronDown, ChevronRight, Database, Workflow } from "lucide-react";
import type { Item, Span } from "@/lib/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function SpanRow({ span }: { span: Span }) {
  return (
    <Collapsible className="group/span rounded-xl border bg-background">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        {span.kind === "llm" ? (
          <Bot className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{span.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {(span.end - span.start).toFixed(1)}s
          {span.tokens > 0 && <> · {span.tokens.toLocaleString()} tok</>}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/span:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t px-3 py-2.5">
        {(["input", "output"] as const).map((k) => (
          <div key={k}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed">
              {span[k] || "—"}
            </pre>
          </div>
        ))}
        {span.error && <p className="text-xs text-destructive">{span.error}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

function displayName(who: string) {
  if (who === "pico" || who === "bearbots") return "FinAI";
  return who.charAt(0).toUpperCase() + who.slice(1);
}

export function Delegation({ item }: { item: Item }) {
  const steps = item.steps || [];
  const messages = item.messages || [];

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-2 rounded-md py-1 text-sm font-medium text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <Workflow aria-hidden="true" className="size-4 text-primary" />
        Agent activity
        <ChevronDown aria-hidden="true" className="size-3.5 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 ml-2">
        <ol className="space-y-4 border-l border-sky-200 py-1 pl-4">
          {messages.map((m, i) => (
            <li key={i} className="relative before:absolute before:top-1.5 before:-left-5 before:size-2 before:rounded-full before:border before:border-primary before:bg-background">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
                {displayName(m.from)}
                <ArrowRight aria-label="to" className="size-3" />
                {displayName(m.to)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.text}</p>
            </li>
          ))}
          {steps.length > 0 && (
            <li className="relative space-y-2 before:absolute before:top-1.5 before:-left-5 before:size-2 before:rounded-full before:border before:border-primary before:bg-background">
              <p className="text-xs font-semibold text-accent-foreground">Model calls and retrievals</p>
              <div className="space-y-1.5">
                {steps.map((s, i) => <SpanRow key={i} span={s} />)}
              </div>
            </li>
          )}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
