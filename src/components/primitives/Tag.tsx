import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const tag = cva(
  "inline-flex items-center gap-1.5 px-2.5 py-[3px] border border-ink text-[11px] font-semibold uppercase tracking-[0.05em]",
  {
    variants: {
      tone: {
        paper: "bg-paper text-ink",
        ink: "bg-ink text-paper",
        accent: "bg-accent text-paper",
        yes: "bg-yes text-paper",
        no: "bg-no text-paper",
      },
    },
    defaultVariants: { tone: "paper" },
  }
);

interface Props extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof tag> {
  children: React.ReactNode;
}

export function Tag({ tone, className, children, ...rest }: Props) {
  return (
    <span className={cn(tag({ tone }), className)} {...rest}>
      {children}
    </span>
  );
}
