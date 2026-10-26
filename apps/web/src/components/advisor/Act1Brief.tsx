import { ACT1_BRIEFS, type Act1Variant, type Ask, type FightBrief } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";

const ASK_LABEL: Record<Ask, string> = {
  aoe: "area damage",
  "single-target": "focus one enemy",
  "multi-hit": "many small hits",
  burst: "burst damage",
  sustained: "steady damage",
  block: "block",
  setup: "time to set up",
  draw: "cards played and drawn",
};

function Fight({ fight, seen }: { fight: FightBrief; seen: boolean }) {
  return (
    <li className="min-w-0 rounded-lg border border-line bg-charcoal/50 p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong className="font-display text-parchment">{fight.name}</strong>
        <Badge tone="neutral">{fight.enemies}</Badge>
        <Badge tone="neutral">HP {fight.hp}</Badge>
        {seen ? <Badge tone="build">on your map</Badge> : null}
      </p>
      <p className="mt-1.5 text-sm text-muted">{fight.summary}</p>
      <p className="mt-1.5 text-xs text-dim">
        Rewards in a deck:{" "}
        <span className="text-parchment">{fight.asks.map((a) => ASK_LABEL[a]).join(" · ")}</span>
      </p>
    </li>
  );
}

/**
 * What a version of Act 1 can throw at a deck: its three elites, its three bosses and its ordinary groups. The notes are
 * SLAY2's own words about the game's monsters (hit points are Ascension 0 to 7); the "rewards" tags are judgement.
 */
export function Act1Brief({ variant, boss }: { variant: Act1Variant; boss: string | null }) {
  const brief = ACT1_BRIEFS[variant];
  return (
    <Disclosure
      summary={
        <>
          What {brief.name} can throw at you:{" "}
          <span className="text-muted">
            {brief.elites.map((e) => e.name).join(", ")} (elites);{" "}
            {brief.bosses.map((b) => b.name).join(", ")} (bosses)
          </span>
        </>
      }
    >
      <div className="space-y-4">
        <p>{brief.summary}</p>
        <div>
          <p className="mb-2 font-medium text-parchment">Elites (you meet several per act)</p>
          <ul className="grid gap-2 lg:grid-cols-3">
            {brief.elites.map((f) => (
              <Fight key={f.id} fight={f} seen={false} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-medium text-parchment">
            Bosses (one of these three waits at the top of your map)
          </p>
          <ul className="grid gap-2 lg:grid-cols-3">
            {brief.bosses.map((f) => (
              <Fight key={f.id} fight={f} seen={boss === f.id} />
            ))}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-parchment">First fights (easier groups)</p>
            <p>{brief.weak.join(" · ")}</p>
          </div>
          <div>
            <p className="mb-1 font-medium text-parchment">The rest of the act</p>
            <p>{brief.normal.join(" · ")}</p>
          </div>
        </div>
        <p className="text-xs text-dim">
          Hit points are the Ascension 0 to 7 figures; Ascension 8 adds hit points and Ascension 9
          adds damage. The notes are SLAY2&rsquo;s reading of the game&rsquo;s own monster data;
          &ldquo;rewards in a deck&rdquo; is judgement, not a measurement. The card values measured
          from simulated runs were played in Overgrowth only: the simulator never plays Underdocks.
        </p>
      </div>
    </Disclosure>
  );
}
