import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display text-lg tracking-[0.14em] text-parchment">
            SLAY<span className="text-copper">2</span>
          </p>
          <p className="mt-3 max-w-md">
            An independent, unofficial, non-commercial strategy observatory for Slay the Spire 2.
            Not affiliated with or endorsed by Mega Crit. Game names and content are the property of
            their owners; this site contains no game art, text or audio.
          </p>
        </div>
        <nav aria-label="Site" className="flex flex-col gap-1">
          <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-copper">
            Explore
          </p>
          <Link href="/advisor" className="min-h-8 hover:text-parchment">
            Advisor
          </Link>
          <Link href="/odds" className="min-h-8 hover:text-parchment">
            Probability observatory
          </Link>
          <Link href="/routes" className="min-h-8 hover:text-parchment">
            Route Lab
          </Link>
          <Link href="/codex" className="min-h-8 hover:text-parchment">
            Codex
          </Link>
          <Link href="/methods" className="min-h-8 hover:text-parchment">
            Evidence &amp; methods
          </Link>
          <Link href="/about" className="min-h-8 hover:text-parchment">
            About &amp; rights
          </Link>
        </nav>
        <div>
          <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-copper">
            Coverage
          </p>
          <ul className="space-y-1">
            <li>Game build: main v0.107.1 (Steam 23811903)</li>
            <li>Beta v0.111.0: not supported yet</li>
            <li>Solo only · Ascension 0–10 · five characters</li>
            <li>Your run data never leaves your browser</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
