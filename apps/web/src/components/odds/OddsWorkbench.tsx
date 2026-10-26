"use client";

import { useState } from "react";

import { ASCENSION_EFFECTS } from "@slay2/game-schema";

import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Tabs } from "@/components/ui/Tabs";
import { useUrlState, parseIntInRange, parseOneOf } from "@/hooks/useUrlState";
import { useRunState } from "@/lib/run-store";

import { DrawCalculator } from "./DrawCalculator";
import { EconomyCalculator } from "./EconomyCalculator";
import { PotionCalculator } from "./PotionCalculator";
import { RarityCalculator } from "./RarityCalculator";
import { UnknownRoomCalculator } from "./UnknownRoomCalculator";

const TABS = ["rewards", "potions", "rooms", "draws", "shop"] as const;
type TabId = (typeof TABS)[number];

export function OddsWorkbench() {
  const run = useRunState();
  const [tab, setTab] = useUrlState<TabId>("tab", "rewards", parseOneOf(TABS));
  const [ascParam, setAscParam] = useUrlState<number>("asc", -1, (raw) =>
    raw === "" ? undefined : parseIntInRange(0, 10)(raw),
  );
  const [firstRun, setFirstRun] = useState<"unknown" | "no" | "yes">("unknown");

  const confirmedRun = run?.ascensionConfirmed ? run : null;
  const ascension = ascParam >= 0 ? ascParam : (confirmedRun?.ascension ?? 0);
  const confirmed = ascParam >= 0 || confirmedRun !== null;

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-end gap-x-8 gap-y-4 p-4 sm:p-5">
        <div className="min-w-44">
          <label htmlFor="ctx-asc" className="mb-1.5 block text-sm font-medium text-parchment">
            Ascension
          </label>
          <Select
            id="ctx-asc"
            value={confirmed ? String(ascension) : ""}
            onChange={(e) => {
              setAscParam(Number(e.target.value));
            }}
          >
            {!confirmed ? (
              <option value="" disabled>
                Choose… (A0 assumed)
              </option>
            ) : null}
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0
                  ? "Ascension 0"
                  : `Ascension ${String(i)} · ${ASCENSION_EFFECTS[i - 1]?.id ?? ""}`}
              </option>
            ))}
          </Select>
        </div>
        <Segmented
          legend="Is this your profile’s first-ever run?"
          value={firstRun}
          onChange={setFirstRun}
          size="sm"
          options={[
            { value: "unknown", label: "Not sure" },
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Badge tone="build">STS2 main v0.107.1</Badge>
          {!confirmed ? <Badge tone="unverified">Ascension not set · A0 assumed</Badge> : null}
          {run?.character ? <Badge tone="neutral">Saved run found</Badge> : null}
        </div>
        {firstRun === "yes" ? (
          <p
            role="note"
            className="basis-full rounded-lg border border-rose-deep bg-rose/10 p-3 text-sm text-rose"
          >
            A profile’s first run has scripted early rewards and “?” rooms. These calculators model
            the normal rules, so treat early numbers as unreliable until you are past the tutorial
            rewards.
          </p>
        ) : null}
      </div>

      <Tabs<TabId>
        label="Calculators"
        tabs={[
          { id: "rewards", label: "Card rewards" },
          { id: "potions", label: "Potions" },
          { id: "rooms", label: "“?” rooms" },
          { id: "draws", label: "Draws" },
          { id: "shop", label: "Shop & gold" },
        ]}
        active={tab}
        onChange={setTab}
        renderPanel={(id) => {
          switch (id) {
            case "rewards":
              return (
                <RarityCalculator ascension={ascension} ascensionConfirmed={confirmed} run={run} />
              );
            case "potions":
              return <PotionCalculator run={run} />;
            case "rooms":
              return <UnknownRoomCalculator run={run} />;
            case "draws":
              return <DrawCalculator />;
            case "shop":
              return <EconomyCalculator ascension={ascension} />;
          }
        }}
      />
    </div>
  );
}
