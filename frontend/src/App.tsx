import { useEffect, useState } from "react";
import { Activity, AlertCircle, LayoutGrid, X } from "lucide-react";
import { request, useProject } from "@/lib/useProject";
import { AppSidebar } from "@/components/app-sidebar";
import { Home, steps } from "@/components/home";
import { ProjectView, Stepper } from "@/components/project-view";
import { SpanRow } from "@/components/activity";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function App() {
  const project = useProject();
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false);
  const [activity, setActivity] = useState(false);

  useEffect(() => {
    let disposed = false;
    const check = () =>
      request("/health")
        .then(() => !disposed && setHealthy(true))
        .catch(() => !disposed && setHealthy(false));
    check();
    const timer = setInterval(check, 30000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const isHome = !project.id;
  const spans = project.items.flatMap((i) => i.steps || []);
  const tokens = spans.reduce((n, s) => n + s.tokens, 0);

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider defaultOpen={false} className="h-svh">
        <AppSidebar
          history={project.history}
          id={project.id}
          healthy={healthy}
          onOpen={project.open}
          onRemove={project.remove}
          onHelp={() => setHelp(true)}
        />
        <SidebarInset className={isHome ? "brief-background min-h-0 overflow-hidden" : "min-h-0 overflow-hidden"}>
          {isHome ? (
            <SidebarTrigger className="absolute top-4 left-4 z-10 h-9 w-auto gap-2 bg-white/80 px-3 text-accent-foreground hover:bg-white">
              <LayoutGrid aria-hidden="true" />
              Projects
            </SidebarTrigger>
          ) : (
            <header className="relative flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
              <SidebarTrigger className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {project.title || "Project"}
              </span>
              <Stepper stage={project.stage} />
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                aria-label="Activity"
                onClick={() => setActivity(true)}
              >
                <Activity aria-hidden="true" />
                <span className="hidden sm:inline">Activity</span>
              </Button>
            </header>
          )}

          {project.error && (
            <div className={isHome ? "relative mx-auto mt-16 w-full max-w-[760px] px-4" : "relative mx-auto w-full max-w-[760px] px-4"}>
              <Alert variant="destructive" className="rounded-xl border-danger-border bg-danger-surface pr-10">
                <AlertCircle />
                <AlertDescription>{project.error}</AlertDescription>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-2.5 right-2.5"
                  aria-label="Dismiss error"
                  onClick={project.clearError}
                >
                  <X />
                </Button>
              </Alert>
            </div>
          )}

          <div className={project.id ? "min-h-0 flex-1" : "relative min-h-0 flex-1 overflow-y-auto"}>
            {project.id ? (
              <ProjectView
                key={project.id}
                items={project.items}
                stage={project.stage}
                agents={project.agents}
                pending={project.pending}
                brief={project.brief}
                onReply={project.reply}
              />
            ) : (
              <Home onStart={project.start} pending={project.pending} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <Sheet open={activity} onOpenChange={setActivity}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Project activity</SheetTitle>
            <SheetDescription>
              {spans.length} {spans.length === 1 ? "step" : "steps"}, {tokens.toLocaleString()} {tokens === 1 ? "token" : "tokens"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
            {spans.length ? (
              spans.map((s, i) => <SpanRow key={i} span={s} />)
            ) : (
              <p className="text-sm text-muted-foreground">No completed steps yet.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">How it works</DialogTitle>
            <DialogDescription>
              Describe your project to start the requirements review.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-xs text-accent-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="space-y-2 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
            <p>
              Review the requirements before you approve them. Ask a qualified reviewer to check regulatory interpretations.
            </p>
            <p>
              This browser saves recent project titles. Restarting the backend clears project sessions.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setHelp(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
