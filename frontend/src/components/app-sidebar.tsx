import { CircleHelp, MessageSquare, MoreHorizontal, SquarePen, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

function group(created: number) {
  const day = 86_400_000;
  const age = Date.now() - created;
  if (age < day) return "Today";
  if (age < 7 * day) return "Previous 7 days";
  return "Older";
}

export function AppSidebar({
  history,
  id,
  healthy,
  onOpen,
  onRemove,
  onHelp,
}: {
  history: Project[];
  id: string | null;
  healthy: boolean | null;
  onOpen: (id: string | null) => void;
  onRemove: (id: string) => void;
  onHelp: () => void;
}) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const backendStatus = healthy === null ? "Connecting…" : healthy ? "Backend connected" : "Backend offline";
  const go = (pid: string | null) => {
    onOpen(pid);
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };
  const groups = history.reduce<Record<string, Project[]>>((acc, p) => {
    (acc[group(p.created)] ||= []).push(p);
    return acc;
  }, {});

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="gap-3 border-b border-sidebar-border pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => go(null)}
              className="gap-2.5"
              tooltip="FinAI"
            >
              <Logo className="size-8" />
              <span className="text-base font-semibold tracking-tight">FinAI</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => go(null)}
              tooltip="New project"
              className="bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
            >
              <SquarePen />
              <span>New project</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onHelp} tooltip="How it works">
              <CircleHelp />
              <span>How it works</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {Object.entries(groups).map(([label, items]) => (
          <SidebarGroup key={label} className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      isActive={p.id === id}
                      onClick={() => go(p.id)}
                      title={p.title}
                    >
                      <MessageSquare className="text-muted-foreground" />
                      <span>{p.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal />
                          <span className="sr-only">More</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onRemove(p.id)}
                        >
                          <Trash2 />
                          Remove from list
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div
          role="status"
          title={backendStatus}
          className="flex min-h-8 items-center gap-2 px-2 text-xs text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              healthy === null ? "bg-muted-foreground" : healthy ? "bg-success" : "bg-destructive",
            )}
          />
          <span className="group-data-[collapsible=icon]:sr-only">{backendStatus}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
