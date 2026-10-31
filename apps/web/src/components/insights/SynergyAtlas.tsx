"use client";

import Link from "next/link";
import { useState } from "react";

import { Segmented } from "@/components/ui/Segmented";
import { SelectField } from "@/components/ui/SelectField";
import type { AtlasCard, AtlasMechanic } from "@/lib/insights-server";

const CLASSES = [
  { value: "ironclad", label: "Ironclad" },
  { value: "silent", label: "Silent" },
  { value: "regent", label: "Regent" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "defect", label: "Defect" },
] as const;
type ClassId = (typeof CLASSES)[number]["value"];

const dots = (n: number): string => "●".repeat(n) + "○".repeat(3 - n);
const WORD = ["", "a little", "clearly", "a great deal"];

function CardList({
  title,
  hint,
  cards,
  label,
}: {
  title: string;
  hint: string;
  cards: readonly AtlasCard[];
  label: string;
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-medium text-parchment">
        {title} <span className="num text-xs font-normal text-dim">({cards.length})</span>
      </h4>
      <p className="text-xs text-dim">{hint}</p>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line bg-charcoal/40"
      >
        {cards.length === 0 ? (
          <p className="p-3 text-sm text-dim">No card of this class.</p>
        ) : (
          <ul className="divide-y divide-line">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate text-parchment">
                  {c.name}
                  {c.cls === "colorless" ? (
                    <span className="ml-1.5 text-xs text-dim">colorless</span>
                  ) : null}
                </span>
                <span
                  aria-label={`${c.level} of 3, ${WORD[c.level] ?? ""}`}
                  className="shrink-0 font-mono text-xs tracking-widest text-copper"
                >
                  {dots(c.level)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Pick a class and a mechanic: which of the class's cards supply it, and which cards need it. Card names and our own tags only. */
export function SynergyAtlas({ mechanics }: { mechanics: readonly AtlasMechanic[] }) {
  const [cls, setCls] = useState<ClassId>("ironclad");
  const [mechanic, setMechanic] = useState<string>(mechanics[0]?.id ?? "");
  const current = mechanics.find((m) => m.id === mechanic) ?? mechanics[0];
  const mine = (cards: readonly AtlasCard[]): AtlasCard[] =>
    cards.filter((c) => c.cls === cls || c.cls === "colorless");
  const options = mechanics.map((m) => ({
    value: m.id,
    label: `${m.label} (${String(mine(m.suppliers).length)} supply, ${String(mine(m.payoffs).length)} need)`,
  }));
  if (!current) return null;
  const ratio = current.measured;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Segmented<ClassId>
          legend="Class"
          value={cls}
          onChange={setCls}
          options={CLASSES}
          size="sm"
        />
        <SelectField label="Mechanic" value={mechanic} onChange={setMechanic} options={options} />
      </div>
      <div className="rounded-xl border border-line bg-ink-2 p-4">
        <h3 className="text-lg text-parchment">{current.label}</h3>
        <p className="mt-1 text-sm text-muted">{current.about}</p>
        <p className="mt-2 text-xs text-dim">
          {ratio
            ? `Exploratory reading of ${ratio.decks.toLocaleString("en-US")} randomly drafted simulated decks, in the simulator as it was when they were played (it dropped the relics a run gains): a point of unmet need here was worth about ${ratio.ratio.toFixed(2)} points of average card quality (95 % interval ${ratio.ci95[0]?.toFixed(2)} to ${ratio.ci95[1]?.toFixed(2)}); ${String(ratio.of)} such intervals were read together and are not corrected for each other, and an interval that holds zero means the runs cannot tell.`
            : "The simulated runs say nothing about this mechanic on its own: too few decks left its need unmet."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CardList
          title="Cards that supply it"
          hint="How much each gives the deck, from ● (a little) to ●●● (a great deal)."
          cards={mine(current.suppliers)}
          label={`Cards that supply ${current.label}`}
        />
        <CardList
          title="Cards that need it"
          hint="How much each card's worth depends on it."
          cards={mine(current.payoffs)}
          label={`Cards that need ${current.label}`}
        />
      </div>
      <p className="text-xs text-dim">
        The tags are SLAY2&rsquo;s own judgement, written from reading each card and checked against
        simulated runs only as far as the synergy section of{" "}
        <Link
          href="/methods#synergy"
          className="text-teal underline decoration-dotted underline-offset-4"
        >
          Evidence &amp; methods
        </Link>{" "}
        say.
      </p>
    </div>
  );
}
