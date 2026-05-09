"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
  };

/**
 * Drop-in replacement for `<Link>` that wraps soft navigations in
 * `document.startViewTransition` when supported. Pair with matching CSS
 * `view-transition-name` properties on shared elements across the two routes
 * to get a smooth morph between them. Falls back to standard navigation in
 * browsers that don't support the View Transitions API (Firefox today).
 */
export function TransitionLink({ href, onClick, children, ...rest }: Props) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;

    // Skip when the user wants a new tab / different button.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    const start = (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition;
    if (typeof start !== "function") return;

    e.preventDefault();
    const url = typeof href === "string" ? href : (href.pathname ?? href.href ?? "");
    if (!url) return;

    start.call(document, () => router.push(url.toString()));
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
