import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

const DESTINATIONS = [
  ["/advisor", "Card advisor", "Evaluate the cards you are offered, with reasons."],
  ["/odds", "Probability observatory", "Exact reward, potion, ? room, draw and shop odds."],
  ["/methods", "Evidence & methods", "Every rule, its evidence, and what has not been measured."],
] as const;

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
      <p className="eyebrow mb-3">Error 404</p>
      <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
        This path is not on the map
      </h1>
      <p className="mt-4 text-lg text-muted">
        The page you asked for does not exist or has moved. Nothing was lost: your saved run lives
        in this browser and is untouched.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Where to go instead">
        {DESTINATIONS.map(([href, title, blurb]) => (
          <li key={href}>
            <Link
              href={href}
              className="panel block h-full p-4 transition-colors hover:border-teal-deep focus-visible:border-teal-deep"
            >
              <span className="block font-display text-parchment">{title}</span>
              <span className="mt-1 block text-sm text-muted">{blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted">
        <Link href="/" className="text-teal underline decoration-dotted underline-offset-4">
          Back to the start
        </Link>
      </p>
    </div>
  );
}
