"use client";

import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SelectField, selectClass } from "@/components/ui/SelectField";
import { CLASS_STYLE } from "@/lib/card-style";
import { cn } from "@/lib/cn";
import {
  DEFAULT_RELIC_QUERY,
  RELIC_POOL_FILTERS,
  RELIC_POOL_LABEL,
  RELIC_RARITY_STYLE,
  filterRelics,
  relicCounts,
  type RelicPoolFilter,
  type RelicQuery,
  type RelicSort,
} from "@/lib/relic-codex";
import { RELIC_CATALOG, RELIC_RARITIES, type RelicRarity } from "@slay2/game-data";

const PAGE = 48;

const POOL_FILTER_LABEL: Record<RelicPoolFilter, string> = {
  all: "All",
  ironclad: CLASS_STYLE.ironclad.label,
  silent: CLASS_STYLE.silent.label,
  regent: CLASS_STYLE.regent.label,
  necrobinder: CLASS_STYLE.necrobinder.label,
  defect: CLASS_STYLE.defect.label,
  shared: "Shared",
  event: "Event",
};

const SORT_LABEL: Record<RelicSort, string> = { name: "Name", rarity: "Rarity" };

/** The hue of a relic's frame: its class when it belongs to one pool of a class, otherwise neutral. */
function hueOf(pools: readonly string[]): string {
  const cls = pools.find((p) => p in CLASS_STYLE && p !== "colorless");
  return cls ? CLASS_STYLE[cls as keyof typeof CLASS_STYLE].hue : "#9ea8b8";
}

/** Facts-only reference: the relics of the build with their tier and pools. No relic text is reproduced anywhere. */
export function RelicBrowser() {
  const [query, setQuery] = useState<RelicQuery>(DEFAULT_RELIC_QUERY);
  const [shown, setShown] = useState(PAGE);
  const searchId = useId();
  const counts = useMemo(() => relicCounts(), []);
  const results = useMemo(() => filterRelics(query), [query]);
  const update = (patch: Partial<RelicQuery>): void => {
    setQuery((q) => ({ ...q, ...patch }));
    setShown(PAGE);
  };
  const filtered = query.text.trim() !== "" || query.rarity !== "any";
  const visible = results.slice(0, shown);
  const poolOptions = RELIC_POOL_FILTERS.map((p) => ({
    value: p,
    label: (
      <>
        {POOL_FILTER_LABEL[p]} <span className="num ml-1.5 text-muted">{counts[p]}</span>
      </>
    ),
  }));

  return (
    <div className="space-y-5">
      <div className="panel space-y-5 p-5 sm:p-6">
        <Segmented
          legend="Relic pool"
          value={query.pool}
          onChange={(pool) => {
            update({ pool });
          }}
          options={poolOptions}
          size="sm"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5 lg:col-span-2">
            <label htmlFor={searchId} className="text-sm font-medium text-parchment">
              Search relics
            </label>
            <input
              id={searchId}
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Name, or part of it"
              value={query.text}
              onChange={(e) => {
                update({ text: e.target.value });
              }}
              className={selectClass}
            />
          </div>
          <SelectField<RelicRarity | "any">
            label="Relic rarity"
            value={query.rarity}
            onChange={(rarity) => {
              update({ rarity });
            }}
            options={[
              { value: "any", label: "Any rarity" },
              ...RELIC_RARITIES.map((r) => ({ value: r, label: RELIC_RARITY_STYLE[r].label })),
            ]}
          />
          <SelectField<RelicSort>
            label="Sort relics by"
            value={query.sort}
            onChange={(sort) => {
              update({ sort });
            }}
            options={(Object.keys(SORT_LABEL) as RelicSort[]).map((s) => ({
              value: s,
              label: SORT_LABEL[s],
            }))}
          />
        </div>
      </div>

      <p role="status" className="num text-sm text-muted">
        {results.length === 0
          ? "No relic matches."
          : `${String(results.length)} ${results.length === 1 ? "relic" : "relics"}${
              filtered ? " match" : ""
            } in ${POOL_FILTER_LABEL[query.pool]}${
              results.length > visible.length ? `, showing the first ${String(visible.length)}` : ""
            }.`}
      </p>

      {results.length === 0 ? (
        <div className="panel p-6 text-muted">
          <p>
            Nothing in {POOL_FILTER_LABEL[query.pool]} fits those filters. The list only holds
            relics that exist in the supported build, so a name that is not here is not a relic we
            know.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              update({ text: "", rarity: "any" });
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Relics">
          {visible.map((relic) => {
            const rar = RELIC_RARITY_STYLE[relic.rarity];
            return (
              <li key={relic.id} className="min-w-0">
                <div className="relative flex h-full min-w-0 overflow-hidden rounded-xl border border-line-strong bg-ink-2">
                  <span
                    aria-hidden="true"
                    className="w-1.5 shrink-0"
                    style={{ background: hueOf(relic.pools) }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <p
                        className="min-w-0 flex-1 truncate font-display text-base leading-tight text-parchment"
                        title={relic.name}
                      >
                        {relic.name}
                      </p>
                      <span className={cn("shrink-0 text-xs", rar.className)} title={rar.label}>
                        <span aria-hidden="true">{rar.glyph}</span>{" "}
                        <span className="sr-only sm:not-sr-only">{rar.label}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {relic.pools.map((p) => RELIC_POOL_LABEL[p]).join(" · ")}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > visible.length ? (
        <div className="flex justify-center">
          <Button
            onClick={() => {
              setShown((n) => n + PAGE);
            }}
          >
            Show {String(Math.min(PAGE, results.length - visible.length))} more
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        {String(RELIC_CATALOG.relics.length)} relics in the build, listed as facts: name, rarity
        tier and the pools that offer it. What a relic does is the game&apos;s own text and is not
        reproduced here.
      </p>
    </div>
  );
}
