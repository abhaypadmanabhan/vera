import type { ComponentProps, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The one card shape in the app: 1px hairline, surface background, p-6,
 * radius-lg (DESIGN.md "Shape & spacing"). Everything that looks like a panel
 * goes through here so shadcn's own defaults never leak a second look in.
 */
export function Panel({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn("gap-5 rounded-lg ring-border [--card-spacing:1.5rem]", className)}
      {...props}
    />
  );
}

/** Small caps eyebrow. Labels a region; never does double duty as a sentence. */
export function SectionLabel({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-xs font-medium tracking-[0.09em] text-muted-foreground uppercase",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
