"use client";

import { useState } from "react";

import { CodexBrowser } from "@/components/codex/CodexBrowser";
import { RelicBrowser } from "@/components/codex/RelicBrowser";
import { Segmented } from "@/components/ui/Segmented";
import { CATALOG, RELIC_CATALOG } from "@slay2/game-data";

type View = "cards" | "relics";

/** The Codex's two lists, one at a time: the cards (the default) and the relics. */
export function CodexViews() {
  const [view, setView] = useState<View>("cards");
  return (
    <div className="space-y-5">
      <Segmented<View>
        legend="Show"
        value={view}
        onChange={setView}
        size="sm"
        options={[
          {
            value: "cards",
            label: (
              <>
                Cards <span className="num ml-1.5 text-muted">{CATALOG.cards.length}</span>
              </>
            ),
          },
          {
            value: "relics",
            label: (
              <>
                Relics <span className="num ml-1.5 text-muted">{RELIC_CATALOG.relics.length}</span>
              </>
            ),
          },
        ]}
      />
      {view === "cards" ? <CodexBrowser /> : <RelicBrowser />}
    </div>
  );
}
