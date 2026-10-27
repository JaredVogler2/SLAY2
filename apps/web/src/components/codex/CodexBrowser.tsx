"use client";

import { useId, useMemo, useState } from "react";

import { CardTile } from "@/components/cards/CardTile";
import { MeasuredForCard } from "@/components/codex/MeasuredValue";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SelectField as Select, selectClass } from "@/components/ui/SelectField";
import { StartHpNote } from "@/components/ui/StartHpNote";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  CODEX_CLASSES,
  CODEX_RARITY_FILTERS,
  CODEX_TYPES,
  DEFAULT_QUERY,
  codexCounts,
  codexRoles,
  filterCodex,
  type CodexClass,
  type CodexQuery,
  type CodexRarity,
  type CodexSort,
  type CodexType,
} from "@/lib/codex";
import type { Role } from "@slay2/game-data";

const PAGE = 48;

const CLASS_LABEL: Record<CodexClass | "all", string> = {
  all: "All",
  ironclad: CLASS_STYLE.ironclad.label,
  silent: CLASS_STYLE.silent.label,
  regent: CLASS_STYLE.regent.label,
  necrobinder: CLASS_STYLE.necrobinder.label,
  defect: CLASS_STYLE.defect.label,
  colorless: CLASS_STYLE.colorless.label,
  other: "Curses & more",
};

const SORT_LABEL: Record<CodexSort, string> = {
  name: "Name",
  cost: "Cost",
  rarity: "Rarity",
  value: "Simulated value",
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Facts-only reference: filter and search the canonical catalog. No card text is reproduced anywhere. */
export function CodexBrowser() {
  const [query, setQuery] = useState<CodexQuery>(DEFAULT_QUERY);
  const [shown, setShown] = useState(PAGE);
  const searchId = useId();
  const counts = useMemo(() => codexCounts(), []);
  const roles = useMemo(() => codexRoles(), []);
  const results = useMemo(() => filterCodex(query), [query]);
  const update = (patch: Partial<CodexQuery>): void => {
    setQuery((q) => ({ ...q, ...patch }));
    setShown(PAGE);
  };
  const filtered =
    query.text.trim() !== "" ||
    query.rarity !== "any" ||
    query.type !== "any" ||
    query.role !== "any" ||
    query.rewardPoolOnly;
  const visible = results.slice(0, shown);
  const classOptions = [...CODEX_CLASSES].map((c) => ({
    value: c,
    label: (
      <>
        {CLASS_LABEL[c]} <span className="num ml-1.5 text-muted">{counts[c]}</span>
      </>
    ),
  }));

  return (
    <div className="space-y-5">
      <div className="panel space-y-5 p-5 sm:p-6">
        <Segmented
          legend="Class"
          value={query.cls === "all" ? "ironclad" : query.cls}
          onChange={(cls) => {
            update({ cls });
          }}
          options={classOptions}
          size="sm"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-1.5 lg:col-span-2">
            <label htmlFor={searchId} className="text-sm font-medium text-parchment">
              Search cards
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
          <Select<CodexRarity | "any">
            label="Rarity"
            value={query.rarity}
            onChange={(rarity) => {
              update({ rarity });
            }}
            options={[
              { value: "any", label: "Any rarity" },
              ...CODEX_RARITY_FILTERS.map((r) => ({
                value: r,
                label: r === "basic" ? "Starter" : r === "other" ? "Other" : cap(r),
              })),
            ]}
          />
          <Select<CodexType | "any">
            label="Type"
            value={query.type}
            onChange={(type) => {
              update({ type });
            }}
            options={[
              { value: "any", label: "Any type" },
              ...CODEX_TYPES.map((t) => ({ value: t, label: cap(t) })),
            ]}
          />
          <Select<Role | "any">
            label="Role tag"
            value={query.role}
            onChange={(role) => {
              update({ role });
            }}
            options={[
              { value: "any", label: "Any role" },
              ...roles.map((r) => ({ value: r, label: r })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-parchment">
            <input
              type="checkbox"
              checked={query.rewardPoolOnly}
              onChange={(e) => {
                update({ rewardPoolOnly: e.target.checked });
              }}
              className="h-5 w-5 accent-[var(--color-copper)]"
            />
            Card-reward pool only
          </label>
          <div className="w-44">
            <Select<CodexSort>
              label="Sort by"
              value={query.sort}
              onChange={(sort) => {
                update({ sort });
              }}
              options={(Object.keys(SORT_LABEL) as CodexSort[]).map((s) => ({
                value: s,
                label: SORT_LABEL[s],
              }))}
            />
          </div>
        </div>
      </div>

      <p role="status" className="num text-sm text-muted">
        {results.length === 0
          ? "No card matches."
          : `${String(results.length)} ${results.length === 1 ? "card" : "cards"}${
              filtered ? ` match in ${CLASS_LABEL[query.cls]}` : ` in ${CLASS_LABEL[query.cls]}`
            }${results.length > visible.length ? `, showing the first ${String(visible.length)}` : ""}.`}
      </p>

      <StartHpNote
        character={query.cls === "all" ? "ironclad" : query.cls}
        subject="values"
        className="text-xs text-rose"
      />

      {results.length === 0 ? (
        <div className="panel p-6 text-muted">
          <p>
            Nothing in {CLASS_LABEL[query.cls]} fits those filters. The catalog only lists cards
            that exist in the supported build, so a name that is not here is not a card we know.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              update({ text: "", rarity: "any", type: "any", role: "any", rewardPoolOnly: false });
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cards">
          {visible.map((card) => (
            <li key={card.id} className="min-w-0">
              <CardTile card={card} className="h-full">
                <p className="mt-0.5 text-xs text-muted">
                  {card.rewardEligible ? "In the card-reward pool" : "Not in the card-reward pool"}
                  {card.multiplayer === "multiplayer-only"
                    ? " · co-op only"
                    : card.multiplayer === "singleplayer-only"
                      ? " · solo only"
                      : ""}
                  {card.epochGate ? " · unlocked through progression" : ""}
                </p>
                {card.keywords.length > 0 ? (
                  <p className="text-xs text-muted">Keywords: {card.keywords.join(", ")}</p>
                ) : null}
                <MeasuredForCard cardId={card.id} />
              </CardTile>
            </li>
          ))}
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
    </div>
  );
}
