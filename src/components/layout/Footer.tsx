import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "./Logo";

const TRUST_BULLETS: { icon: keyof typeof Icon; label: string }[] = [
  { icon: "lock", label: "Funds stay in your wallet" },
  { icon: "shield", label: "Cancel any time, no fee" },
  { icon: "zap", label: "Powered by Polymarket odds" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink bg-paper">
      <div className="mx-auto max-w-[1280px] px-6 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <Logo size={28} />
              <span className="font-serif text-2xl">Polyswap</span>
            </div>
            <p className="mt-4 max-w-md font-serif text-lg leading-snug text-ink-2">
              Pin a token swap to a real-world question. We watch the odds. When they cross your
              line — and only then — the swap fires.
            </p>
          </div>

          <div className="lg:col-span-4">
            <p className="eyebrow mb-4">Why Polyswap</p>
            <ul className="space-y-3">
              {TRUST_BULLETS.map((b) => {
                const I = Icon[b.icon];
                return (
                  <li key={b.label} className="flex items-start gap-3 text-sm">
                    <I size={16} className="mt-0.5 shrink-0 text-accent" />
                    <span>{b.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <p className="eyebrow mb-4">Read on</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/markets" className="hover:underline">
                  Browse markets
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:underline">
                  My swaps
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="hover:underline">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:underline">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-rule-soft pt-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Polyswap. Runs on Polygon. Non-custodial.</p>
          <p className="num">v0.1 · build paper</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
