import { Footer } from "@/components/layout/Footer";
import {
  Categories,
  FAQ,
  FinalCTA,
  Guarantees,
  Hero,
  HowItWorks,
  LandingHeader,
  Premise,
  PullQuote,
} from "@/components/landing";
import { Reveal } from "@/components/primitives";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        {/* Hero plays its own mount choreography immediately. */}
        <Hero />
        {/* Downstream sections fade up the first time they enter the viewport. */}
        <Reveal>
          <Premise />
        </Reveal>
        <Reveal>
          <HowItWorks />
        </Reveal>
        <Reveal>
          <Categories />
        </Reveal>
        <Reveal>
          <Guarantees />
        </Reveal>
        <Reveal>
          <PullQuote />
        </Reveal>
        <Reveal>
          <FAQ />
        </Reveal>
        <Reveal>
          <FinalCTA />
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
