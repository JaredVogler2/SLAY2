import Link from "next/link";

import { Wordmark } from "../brand/Logo";
import { Badge } from "../ui/Badge";
import { ResumeChip } from "./ResumeChip";

const NAV = [
  { href: "/advisor", label: "Advisor" },
  { href: "/odds", label: "Odds" },
  { href: "/routes", label: "Routes" },
  { href: "/codex", label: "Codex" },
  { href: "/methods", label: "Methods" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  return (
    <header className="z-40 border-b border-line bg-charcoal/85 backdrop-blur sm:sticky sm:top-0">
      <a
        href="#main"
        className="sr-only-focusable absolute left-3 top-3 z-50 rounded-lg bg-copper px-4 py-2 font-medium text-charcoal"
      >
        Skip to content
      </a>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 sm:h-16 sm:flex-nowrap sm:px-6">
        <Link href="/" aria-label="SLAY2 home" className="rounded-lg py-3 sm:py-0">
          <Wordmark />
        </Link>
        <nav
          aria-label="Primary"
          className="order-last -mx-2 grid w-full grid-cols-3 border-t border-line pb-1 pt-1 sm:order-none sm:mx-0 sm:flex sm:w-auto sm:items-center sm:justify-start sm:gap-2 sm:border-0 sm:p-0"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-2.5 text-sm text-muted hover:bg-ink-2 hover:text-parchment sm:flex-none sm:px-3.5"
            >
              {item.label}
            </Link>
          ))}
          <span className="ml-1 hidden md:block">
            <Badge tone="build" title="The only game build whose rules SLAY2 has verified">
              main 0.107.1
            </Badge>
          </span>
          <ResumeChip />
        </nav>
      </div>
    </header>
  );
}
