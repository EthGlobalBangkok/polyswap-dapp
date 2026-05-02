"use client";

import Image from "next/image";
import Link from "next/link";
import { Button, Reveal, RevealItem, RevealStack } from "@/components/primitives";
import { Icon } from "@/components/icons";

export function Hero() {
  return (
    <section className="border-b border-ink">
      <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-6 py-12 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:px-12 lg:py-20">
        <RevealStack className="lg:col-span-7" stagger={0.09} delay={0.05}>
          <RevealItem>
            <h1 className="display text-5xl sm:text-6xl lg:text-[96px]">
              Swaps that
              <br />
              <span className="display-italic text-accent">wait </span>
              for the world
              <br />
              to <span className="display-italic">agree.</span>
            </h1>
          </RevealItem>
          <RevealItem>
            <p className="mt-6 max-w-[560px] font-serif text-lg leading-snug text-ink-2 sm:text-xl lg:mt-8 lg:text-[22px]">
              Pin a token swap to a real-world question. We watch the odds. When they cross your
              line — and only then — the swap fires.
            </p>
          </RevealItem>
          <RevealItem>
            <div className="mt-7 flex flex-wrap items-center gap-4 lg:mt-9">
              <Link href="/markets">
                <Button variant="accent" size="lg" style={{ cursor: "pointer" }}>
                  Open the app
                  <Icon.arrowRight size={14} aria-hidden />
                </Button>
              </Link>
              <a href="#how-it-works" className="text-sm underline underline-offset-4">
                See how it works →
              </a>
            </div>
          </RevealItem>
          <RevealItem>
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm lg:mt-8">
              <span className="flex items-center gap-2">
                <Icon.lock size={15} aria-hidden /> Funds stay in your wallet
              </span>
              <span className="flex items-center gap-2">
                <Icon.shield size={15} aria-hidden /> Cancel any time
              </span>
            </div>
          </RevealItem>
        </RevealStack>

        <Reveal
          className="hidden text-ink lg:col-span-5 lg:flex lg:justify-end"
          offset={20}
          delay={0.4}
        >
          <Image
            src="/landing/hero.png"
            alt="A pressure gauge wired to a swap lever firing tokens when the odds rise on a Polymarket question"
            width={600}
            height={400}
            priority
            className="h-auto w-full max-w-[560px]"
          />
        </Reveal>
      </div>
    </section>
  );
}
