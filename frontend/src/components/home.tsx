import {
  PromptInputProvider,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Composer } from "@/components/composer";
import { Logo } from "@/components/logo";

const examples = [
  {
    name: "Digital banking",
    brief:
      "Build a digital banking application for retail customers in India. Include secure login, account balances, fund transfers, transaction history and audit logs. Integrate with the core banking system and support 1,000 concurrent users.",
  },
  {
    name: "Payment platform",
    brief:
      "Build a payment platform for small businesses in India. Merchants need payment links, transaction reconciliation, refunds and reporting. Integrate with a payment gateway, use role-based access and maintain an audit trail.",
  },
  {
    name: "Customer onboarding",
    brief:
      "Build a bank customer onboarding application with KYC verification, secure document storage and audit logs. Support 10,000 customers, dual approval by onboarding and compliance staff, and integration with the existing customer management system.",
  },
];

export const steps = [
  {
    title: "Clarify",
    description: "The analyst asks about details missing from your brief.",
  },
  {
    title: "Specify",
    description: "The analyst drafts requirements with acceptance criteria and links each requirement to a test.",
  },
  {
    title: "Plan",
    description: "The planner recommends development phases and what to review before each phase ends.",
  },
];

function Examples() {
  const { textInput } = usePromptInputController();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span className="mr-1 rounded-md bg-white/85 px-2 py-1 text-xs text-muted-foreground">Examples</span>
      {examples.map((e) => (
        <Suggestion
          key={e.name}
          suggestion={e.brief}
          onClick={(brief) => {
            textInput.setInput(brief);
            document.querySelector<HTMLTextAreaElement>("textarea[name=message]")?.focus();
          }}
          variant="ghost"
          className="h-8 rounded-md bg-white/85 px-2 text-foreground hover:bg-white"
        >
          {e.name}
        </Suggestion>
      ))}
    </div>
  );
}

export function Home({
  onStart,
  pending,
}: {
  onStart: (brief: string) => Promise<unknown>;
  pending: boolean;
}) {
  return (
    <PromptInputProvider>
      <div className="flex min-h-full flex-col items-center px-4 pt-[clamp(7rem,18vh,10rem)] pb-12">
        <div className="relative flex w-full max-w-[640px] flex-col gap-4">
          <div className="mb-2 flex flex-col items-center gap-4 text-center text-white [text-shadow:0_1px_6px_#064774]">
            <div className="flex items-center gap-2.5">
              <Logo className="size-8" />
              <span className="text-base font-semibold tracking-tight">FinAI</span>
            </div>
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Start a project
            </h1>
          </div>

          <Composer
            autoFocus
            onSubmit={onStart}
            pending={pending}
            minLength={10}
            maxLength={8000}
            placeholder="Describe what you're building and who it's for."
            className="w-full [&_[data-slot=input-group]]:shadow-md [&_textarea]:min-h-20"
          />

          <Examples />
        </div>
      </div>
    </PromptInputProvider>
  );
}
