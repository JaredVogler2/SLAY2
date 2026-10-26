"use client";

import { useId, useState } from "react";

import { MAX_ROUTE_ROOMS, MAX_ROUTE_UNKNOWNS, ROUTE_ROOMS, type RouteRoom } from "@slay2/odds";

import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { ROOM_CODE, ROOM_LABEL, describeRoute, formatRoute, parseRoute } from "@/lib/route-lab";

import { ROOM_TONE, RoomIcon } from "./RoomIcon";

/**
 * One candidate route: the rooms in the order they would be walked. Built with six buttons or typed as letters; the
 * canonical value is the compact string kept in the page's link.
 */
export function RouteBuilder({
  name,
  value,
  onChange,
}: {
  name: string;
  /** compact form, e.g. `M?ER`; always valid (the page only ever stores what parses) */
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseRoute(value);
  const rooms: RouteRoom[] = parsed.ok ? parsed.rooms : [];
  const headingId = useId();
  const inputId = useId();
  const helpId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unknownCount = rooms.filter((r) => r === "unknown").length;

  const canAdd = (room: RouteRoom): boolean =>
    rooms.length < MAX_ROUTE_ROOMS && (room !== "unknown" || unknownCount < MAX_ROUTE_UNKNOWNS);
  const commit = (next: readonly RouteRoom[]): void => {
    setDraft(null);
    setError(null);
    onChange(formatRoute(next));
  };

  return (
    <section aria-labelledby={headingId} className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-lg text-parchment">
          Route {name}
        </h3>
        <p className="text-sm text-muted" aria-live="polite">
          <span className="num">{rooms.length}</span> of {MAX_ROUTE_ROOMS} rooms ·{" "}
          <span className="num">{unknownCount}</span> “?”
        </p>
      </div>

      {rooms.length > 0 ? (
        <ol
          aria-label={`Route ${name}: ${describeRoute(rooms)}`}
          className="flex flex-wrap gap-1.5"
        >
          {rooms.map((room, i) => (
            <li
              key={`${String(i)}-${room}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-line-strong bg-ink-2 py-1 pl-2 pr-1 text-sm",
                ROOM_TONE[room],
              )}
            >
              <RoomIcon room={room} />
              <span className="text-parchment">{ROOM_LABEL[room]}</span>
              <button
                type="button"
                onClick={() => {
                  commit(rooms.filter((_, j) => j !== i));
                }}
                aria-label={`Remove ${ROOM_LABEL[room]} (room ${String(i + 1)}) from route ${name}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-ink-3 hover:text-parchment"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-dim">
          No rooms yet. Add them in the order you would walk them, or type them below.
        </p>
      )}

      <div role="group" aria-label={`Add a room to route ${name}`} className="flex flex-wrap gap-2">
        {ROUTE_ROOMS.map((room) => (
          <Button
            key={room}
            size="sm"
            disabled={!canAdd(room)}
            onClick={() => {
              commit([...rooms, room]);
            }}
            aria-label={`Add ${ROOM_LABEL[room]} to route ${name}`}
            className="gap-1.5"
          >
            <RoomIcon room={room} className={ROOM_TONE[room]} />
            <span>{ROOM_LABEL[room]}</span>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-parchment">
            Or type route {name}
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="M ? M E R"
            aria-describedby={helpId}
            aria-invalid={error !== null}
            value={draft ?? rooms.map((r) => ROOM_CODE[r]).join(" ")}
            onChange={(e) => {
              const text = e.target.value;
              setDraft(text);
              const result = parseRoute(text);
              if (!result.ok) {
                setError(result.error);
              } else if (result.rooms.filter((r) => r === "unknown").length > MAX_ROUTE_UNKNOWNS) {
                setError(`A route has at most ${String(MAX_ROUTE_UNKNOWNS)} “?” rooms.`);
              } else {
                setError(null);
                onChange(formatRoute(result.rooms));
              }
            }}
            onBlur={() => {
              setDraft(null);
              setError(null);
            }}
            className={cn(inputClass, "num font-mono tracking-wider")}
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={rooms.length === 0}
          onClick={() => {
            commit(rooms.slice(0, -1));
          }}
          aria-label={`Undo last room of route ${name}`}
        >
          Undo last
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={rooms.length === 0}
          onClick={() => {
            commit([]);
          }}
          aria-label={`Clear route ${name}`}
        >
          Clear
        </Button>
      </div>
      <p id={helpId} className="text-xs text-muted">
        M monster · E elite · ? unknown · R rest · S shop · T treasure
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose">
          {error}
        </p>
      ) : null}
    </section>
  );
}
