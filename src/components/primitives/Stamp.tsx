import { cn } from "@/lib/cn";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function Stamp({ children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-block px-2.5 py-1 border-2 border-accent text-accent",
        "text-[10px] font-bold uppercase tracking-[0.14em]",
        "-rotate-3",
        className
      )}
      style={{ background: "rgba(217,74,31,0.06)" }}
    >
      {children}
    </span>
  );
}
