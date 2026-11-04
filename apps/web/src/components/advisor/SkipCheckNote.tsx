import Link from "next/link";

import { SKIP, skipClassLine, skipSentence, type SkipData } from "@/lib/skip";

/**
 * Said beside a recommendation that the price of a slot touched (the deck is past 20 cards): the price is a judgement, and where its registered simulated
 * check stands (ADR-065). Nothing about winning: the check cannot see a benefit. A class whose own games had version 1's price ahead says so.
 */
export function SkipCheckNote({
  character,
  data = SKIP,
}: {
  character?: string | null | undefined;
  data?: SkipData;
}) {
  const sentence = skipSentence(data);
  if (!sentence) return null;
  const own = character ? skipClassLine(character, data) : null;
  return (
    <p data-skip-check="" className="text-xs text-dim">
      {sentence}
      {own ? ` ${own}` : ""}{" "}
      <Link
        className="text-teal underline decoration-dotted underline-offset-4"
        href="/methods#price-of-a-slot"
      >
        Evidence &amp; methods
      </Link>
    </p>
  );
}
