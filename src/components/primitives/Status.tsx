import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type { SwapStatus } from "@/types/design";

const status = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.1em] border border-ink",
  {
    variants: {
      kind: {
        waiting: "bg-paper text-ink",
        ready: "bg-accent text-paper",
        done: "bg-yes text-paper",
        cancelled: "bg-paper-3 text-ink-3",
      },
    },
    defaultVariants: { kind: "waiting" },
  }
);

const dotColor: Record<SwapStatus, string | null> = {
  waiting: "bg-warn",
  ready: "bg-paper",
  done: null,
  cancelled: null,
};

const label: Record<SwapStatus, string> = {
  waiting: "WAITING",
  ready: "READY",
  done: "FILLED",
  cancelled: "CANCELLED",
};

interface Props extends VariantProps<typeof status> {
  kind: SwapStatus;
  className?: string;
}

export function Status({ kind, className }: Props) {
  const dot = dotColor[kind];
  return (
    <span className={cn(status({ kind }), className)}>
      {dot && <span className={cn("inline-block h-1.5 w-1.5 pulse-dot", dot)} aria-hidden />}
      {label[kind]}
    </span>
  );
}
