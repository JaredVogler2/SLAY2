"use client";

import { useMemo, useRef, useState } from "react";

import { starterDeck, type PlayableClass } from "@slay2/game-data";
import { evaluateDraft, type DraftAction } from "@slay2/decision";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Field";
import { useHydrated } from "@/hooks/useHydrated";
import {
  MAX_IMPORT_BYTES,
  newRun,
  parseRunState,
  withCharacter,
  type PackSource,
  type RunState,
} from "@/lib/run-state";
import { runStore, useRunHistory, useRunState } from "@/lib/run-store";

import { CharacterPicker } from "./CharacterPicker";
import { DeckPanel } from "./DeckPanel";
import { HandOddsPanel } from "./HandOddsPanel";
import { ADVISOR_SOURCES, OfferedPanel } from "./OfferedPanel";
import { OfferCheck } from "./OfferCheck";
import { PityTracker } from "./PityTracker";
import { RecommendationPanel } from "./RecommendationPanel";

// A plausible first-fight reward: no rare, because a normal-fight pack cannot hold one at the start of a run (rule CARD-8).
const EXAMPLE_OFFER = ["POMMEL_STRIKE", "SHRUG_IT_OFF", "INFLAME"] as const;

export function AdvisorWorkbench() {
  const hydrated = useHydrated();
  const run = useRunState();
  const { canUndo, canRedo } = useRunHistory();
  const [offered, setOffered] = useState<string[]>([]);
  const [source, setSource] = useState<PackSource>("regular");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (next: RunState): void => {
    runStore.set(next);
  };

  const character = run?.character ?? null;
  const outcome = useMemo(() => {
    if (!run?.character || offered.length === 0) {
      return null;
    }
    try {
      return {
        ok: true as const,
        result: evaluateDraft({
          build: run.build,
          character: run.character,
          ascension: run.ascension,
          actIndex: run.actIndex,
          deck: run.deck,
          offered,
          source,
          riskPreference: run.risk,
        }),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Could not evaluate this offer.",
      };
    }
  }, [run, offered, source]);

  if (!hydrated) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading your saved run">
        <div className="panel h-48 animate-pulse" />
        <div className="panel h-64 animate-pulse" />
      </div>
    );
  }

  const chooseCharacter = (c: PlayableClass): void => {
    update(run ? withCharacter(run, c) : newRun(c));
    setOffered([]);
    setMessage(null);
  };

  const tryExample = (): void => {
    const base = run?.character === "ironclad" ? run : newRun("ironclad");
    if (base !== run) {
      update(base);
    }
    setOffered([...EXAMPLE_OFFER]);
    setSource("regular");
    setMessage(
      "Example offer loaded for the Ironclad starter deck. It is a fixture, not your run — replace the cards with what you are actually offered.",
    );
  };

  const record = (action: DraftAction): void => {
    if (!run) {
      return;
    }
    const picked = action.kind === "skip" ? "skip" : action.cardId;
    const deck =
      action.kind === "pick"
        ? run.deck.some((d) => d.id === action.cardId)
          ? run.deck.map((d) =>
              d.id === action.cardId ? { ...d, count: Math.min(30, d.count + 1) } : d,
            )
          : [...run.deck, { id: action.cardId, count: 1 }]
        : run.deck;
    update({
      ...run,
      deck,
      packs: [
        ...run.packs,
        {
          at: new Date().toISOString(),
          source,
          actIndex: run.actIndex,
          offered: [...offered],
          picked,
        },
      ].slice(-200),
    });
    setOffered([]);
    setMessage(
      action.kind === "skip"
        ? "Skip recorded. The rare-pity tracker has been updated."
        : "Pick added to your deck and the pack recorded for the rare-pity tracker.",
    );
  };

  const exportRun = (): void => {
    if (!run) {
      return;
    }
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slay2-run-${run.id}.json`;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const importRun = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage(
        `That file is larger than ${String(MAX_IMPORT_BYTES / 1024)} KB, so it cannot be a SLAY2 run.`,
      );
      return;
    }
    const parsed = parseRunState(await file.text());
    if (parsed.ok) {
      update(parsed.state);
      setOffered([]);
      setMessage(`Imported run ${parsed.state.id}.`);
    } else {
      setMessage(parsed.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!canUndo}
            onClick={() => {
              runStore.undo();
            }}
          >
            ↶ Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canRedo}
            onClick={() => {
              runStore.redo();
            }}
          >
            ↷ Redo
          </Button>
          <Button size="sm" variant="ghost" disabled={!run} onClick={exportRun}>
            Export run (JSON)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            Import run…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import a SLAY2 run file"
            onChange={(e) => {
              void importRun(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="danger"
            disabled={!run}
            onClick={() => {
              if (
                window.confirm(
                  "Clear this run from the browser? You can undo this until you leave the page.",
                )
              ) {
                runStore.set(null);
                setOffered([]);
                setMessage("Run cleared.");
              }
            }}
          >
            New run
          </Button>
        </div>
        <p className="text-xs text-muted">
          Saved only in this browser
          {runStore.storageAvailable
            ? ""
            : " — storage is blocked here, so nothing persists after you leave"}
          . No account, no upload.
        </p>
      </div>

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-teal-deep/60 bg-teal/10 px-4 py-3 text-sm text-teal"
        >
          {message}
        </p>
      ) : null}

      <Panel
        eyebrow="Step 1"
        title={run?.character ? "Your run" : "Choose your character"}
        headingLevel={2}
        aside={
          run?.character ? (
            <Badge tone="build">{run.build}</Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={tryExample}>
              Try an example
            </Button>
          )
        }
      >
        <div className="space-y-5">
          <CharacterPicker
            value={run?.character ?? null}
            onChange={chooseCharacter}
            compact={Boolean(run?.character)}
          />
          {run?.character ? (
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label
                  htmlFor="adv-asc"
                  className="mb-1.5 block text-sm font-medium text-parchment"
                >
                  Ascension
                </label>
                <Select
                  id="adv-asc"
                  value={run.ascensionConfirmed ? String(run.ascension) : ""}
                  onChange={(e) => {
                    update({ ...run, ascension: Number(e.target.value), ascensionConfirmed: true });
                  }}
                >
                  {!run.ascensionConfirmed ? (
                    <option value="" disabled>
                      Choose… (A0 assumed)
                    </option>
                  ) : null}
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>
                      Ascension {i}
                    </option>
                  ))}
                </Select>
              </div>
              <Segmented
                legend="Act"
                value={String(run.actIndex) as "0" | "1" | "2"}
                onChange={(v) => {
                  update({ ...run, actIndex: Number(v) as 0 | 1 | 2, unknownRooms: [] });
                }}
                options={[
                  { value: "0", label: "Act 1" },
                  { value: "1", label: "Act 2" },
                  { value: "2", label: "Act 3" },
                ]}
              />
              <Segmented
                legend="How do you want to play it?"
                value={run.risk}
                onChange={(v) => {
                  update({ ...run, risk: v });
                }}
                options={[
                  { value: "safe", label: "Safe", description: "Weigh block and consistency more" },
                  { value: "balanced", label: "Balanced" },
                  {
                    value: "aggressive",
                    label: "Aggressive",
                    description: "Weigh damage and scaling more",
                  },
                ]}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">
              Pick a character to start from its real starter deck. Or{" "}
              <button
                type="button"
                onClick={tryExample}
                className="text-teal underline decoration-dotted underline-offset-4"
              >
                load an example offer
              </button>{" "}
              to see how it works in ten seconds.
            </p>
          )}
        </div>
      </Panel>

      {run && character ? (
        <>
          <OfferedPanel
            character={character}
            offered={offered}
            onChange={(next) => {
              setOffered(next);
              setMessage(null);
            }}
            source={source}
            onSourceChange={setSource}
          />

          <OfferCheck run={run} offered={offered} source={source} />

          {outcome?.ok ? (
            <RecommendationPanel result={outcome.result} onRecord={record} />
          ) : outcome ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-deep bg-rose/10 p-4 text-sm text-rose"
            >
              {outcome.error}
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <DeckPanel
              run={run}
              onChange={(deck) => {
                update({ ...run, deck: deck.length > 0 ? deck : starterDeck(character) });
              }}
            />
            <div className="min-w-0 space-y-6">
              <PityTracker run={run} />
              <HandOddsPanel run={run} />
            </div>
          </div>

          {run.packs.length > 0 ? (
            <Panel eyebrow="History" title="Rewards you have recorded" headingLevel={3}>
              <ol className="space-y-1.5 text-sm" aria-label="Recorded packs">
                {run.packs.map((p, i) => (
                  <li
                    key={`${p.at}-${String(i)}`}
                    className="rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-muted"
                  >
                    <span className="num text-dim">{i + 1}.</span> Act {p.actIndex + 1} ·{" "}
                    {ADVISOR_SOURCES.includes(p.source as never) ? p.source : p.source} ·{" "}
                    {p.offered.map((id) => id.replace(/_/g, " ").toLowerCase()).join(", ")} →{" "}
                    <strong className="font-medium text-parchment">
                      {p.picked === "skip"
                        ? "skipped"
                        : p.picked
                          ? p.picked.replace(/_/g, " ").toLowerCase()
                          : "not recorded"}
                    </strong>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
