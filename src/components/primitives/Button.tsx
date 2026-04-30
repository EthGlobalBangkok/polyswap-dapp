import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2.5",
    "border border-ink",
    "font-medium",
    "transition-[transform,box-shadow] duration-100 ease-out",
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none",
    "active:translate-x-0.5 active:translate-y-0.5",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink",
    "select-none",
  ],
  {
    variants: {
      variant: {
        ink: "bg-ink text-paper shadow-[4px_4px_0_0_var(--color-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-ink)] active:shadow-none disabled:shadow-[4px_4px_0_0_var(--color-ink)] disabled:translate-x-0 disabled:translate-y-0",
        accent:
          "bg-accent text-paper shadow-[4px_4px_0_0_var(--color-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-ink)] active:shadow-none disabled:shadow-[4px_4px_0_0_var(--color-ink)] disabled:translate-x-0 disabled:translate-y-0",
        paper: "bg-paper text-ink hover:bg-paper-3 active:translate-x-0 active:translate-y-0",
        ghost:
          "bg-transparent border-transparent text-ink hover:underline underline-offset-4 active:translate-x-0 active:translate-y-0",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-5 py-3 text-sm",
        lg: "px-6 py-3.5 text-base",
      },
    },
    defaultVariants: { variant: "ink", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(button({ variant, size }), className)}
        {...rest}
      />
    );
  }
);
Button.displayName = "Button";
