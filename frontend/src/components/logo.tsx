import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/finai-logo.png"
      alt=""
      className={cn("size-7 shrink-0 rounded-lg bg-white object-contain p-1.5", className)}
    />
  );
}
