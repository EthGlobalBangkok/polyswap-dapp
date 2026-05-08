import Image from "next/image";
import { Icon } from "@/components/icons";

interface Creator {
  name: string;
  role: string;
  bio?: string;
  github: { handle: string; url: string };
  twitter?: { handle: string; url: string };
  linkedin?: { handle: string; url: string };
}

const CREATORS: Creator[] = [
  {
    name: "Lucas Leclerc",
    role: "Co-founder & builder",
    github: { handle: "Intermarch3", url: "https://github.com/Intermarch3" },
    twitter: { handle: "@intermarch3", url: "https://x.com/intermarch3" },
    linkedin: { handle: "leclerclucas", url: "https://www.linkedin.com/in/leclerclucas" },
  },
  {
    name: "Baptiste Florentin",
    role: "Co-founder & builder",
    github: { handle: "Pybast", url: "https://github.com/Pybast" },
    twitter: { handle: "@Pybast", url: "https://x.com/Pybast" },
    linkedin: { handle: "pybast", url: "https://www.linkedin.com/in/pybast/" },
  },
];

export function CreatorsPage() {
  return (
    <div className="space-y-12 py-10 lg:py-16">
      <header className="border-b border-ink pb-10">
        <p className="eyebrow">The team</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl lg:text-[64px]">
          Two builders.
          <br />
          One conviction.
        </h1>
        <p className="mt-6 max-w-xl font-serif text-lg leading-snug text-ink-2 sm:text-xl">
          Polyswap started as a hackathon project at ETHGlobal Bangkok. We built every part
          end-to-end &mdash; contracts, listener, dapp, design.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
        {CREATORS.map((c) => (
          <CreatorCard key={c.github.handle} creator={c} />
        ))}
      </div>
    </div>
  );
}

function CreatorCard({ creator }: { creator: Creator }) {
  const avatar = `https://github.com/${creator.github.handle}.png?size=240`;
  return (
    <article className="flex flex-col border border-ink bg-paper">
      <div className="flex items-start gap-5 border-b border-rule-soft p-6 sm:p-8">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden border border-ink bg-paper-2 sm:h-24 sm:w-24">
          <Image
            src={avatar}
            alt={`${creator.name} avatar`}
            fill
            sizes="(min-width: 640px) 96px, 80px"
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0">
          <p className="eyebrow">{creator.role}</p>
          <h2 className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">{creator.name}</h2>
          {creator.bio && (
            <p className="mt-3 font-serif text-base leading-snug text-ink-2 sm:text-lg">
              {creator.bio}
            </p>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-1 divide-y divide-rule-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SocialRow
          icon="github"
          label="GitHub"
          handle={creator.github.handle}
          url={creator.github.url}
        />
        {creator.twitter && (
          <SocialRow
            icon="twitter"
            label="X"
            handle={creator.twitter.handle}
            url={creator.twitter.url}
          />
        )}
        {creator.linkedin && (
          <SocialRow
            icon="linkedin"
            label="LinkedIn"
            handle={creator.linkedin.handle}
            url={creator.linkedin.url}
          />
        )}
      </ul>
    </article>
  );
}

function SocialRow({
  icon,
  label,
  handle,
  url,
}: {
  icon: "github" | "twitter" | "linkedin";
  label: string;
  handle: string;
  url: string;
}) {
  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-paper-2"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SocialIcon kind={icon} />
          <span className="flex min-w-0 flex-col">
            <span className="eyebrow">{label}</span>
            <span className="num truncate text-xs text-ink-2">{handle}</span>
          </span>
        </span>
        <Icon.arrowUpRight
          size={14}
          className="shrink-0 text-ink-3 transition-colors group-hover:text-ink"
          aria-hidden
        />
      </a>
    </li>
  );
}

function SocialIcon({ kind }: { kind: "github" | "twitter" | "linkedin" }) {
  if (kind === "github") {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.05c-3.2.7-3.87-1.37-3.87-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 015.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
      </svg>
    );
  }
  if (kind === "twitter") {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
      </svg>
    );
  }
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
