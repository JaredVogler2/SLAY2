"use client";

import { useCallback } from "react";

import { RELIC_CATALOG, searchRelics, type RelicEntry, type RelicPool } from "@slay2/game-data";

import { Combobox } from "@/components/ui/Combobox";
import { cn } from "@/lib/cn";
import { RELIC_POOL_LABEL, RELIC_RARITY_STYLE } from "@/lib/relic-codex";

/**
 * Accessible relic search (the same combobox as the card search). Results come from the relic catalog, so only real relic ids can
 * be entered. `pools` limits the search to the pools a run can find relics in.
 */
export function RelicCombobox({
  label,
  onSelect,
  pools,
  exclude,
  placeholder = "Search relics by name…",
  hint,
  className,
}: {
  label: string;
  onSelect: (relic: RelicEntry) => void;
  pools?: readonly RelicPool[];
  exclude?: ReadonlySet<string>;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const search = useCallback(
    (query: string): RelicEntry[] =>
      searchRelics(query, {
        ...(pools ? { pools } : {}),
        limit: RELIC_CATALOG.relics.length,
      }).filter((r) => !exclude?.has(r.id)),
    [pools, exclude],
  );
  return (
    <Combobox<RelicEntry>
      label={label}
      onSelect={onSelect}
      search={search}
      getKey={(r) => r.id}
      renderOption={(r) => {
        const rar = RELIC_RARITY_STYLE[r.rarity];
        return (
          <>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {r.pools.map((p) => RELIC_POOL_LABEL[p]).join(" · ")}
            </span>
            <span className={cn("shrink-0 text-xs", rar.className)}>
              <span aria-hidden="true">{rar.glyph}</span> {rar.label}
            </span>
          </>
        );
      }}
      placeholder={placeholder}
      emptyText={(q) => `No relic matches “${q}” (relics already listed are not offered again).`}
      {...(hint ? { hint } : {})}
      {...(className ? { className } : {})}
    />
  );
}
