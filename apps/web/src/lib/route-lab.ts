import { MAX_ROUTE_ROOMS, ROUTE_ROOMS, type RouteRoom, type UnknownObservation } from "@slay2/odds";

/** What a room is called on the page, and the one letter that stands for it when a route is typed or put in a link. */
export const ROOM_LABEL: Readonly<Record<RouteRoom, string>> = {
  monster: "Monster",
  elite: "Elite",
  unknown: "“?” room",
  rest: "Rest site",
  shop: "Shop",
  treasure: "Treasure",
};

export const ROOM_CODE: Readonly<Record<RouteRoom, string>> = {
  monster: "M",
  elite: "E",
  unknown: "?",
  rest: "R",
  shop: "S",
  treasure: "T",
};

const FROM_CODE: ReadonlyMap<string, RouteRoom> = new Map([
  ...ROUTE_ROOMS.map((room) => [ROOM_CODE[room].toLowerCase(), room] as const),
  ["q", "unknown" as const], // a "?" is awkward to type on some keyboards
]);

export type ParsedRoute = { ok: true; rooms: RouteRoom[] } | { ok: false; error: string };

/**
 * A route typed as letters: M monster, E elite, ? (or Q) unknown, R rest, S shop, T treasure. Spaces, commas, dots and
 * dashes between the letters are ignored. Anything else, or more than a route can hold, is refused with a reason.
 */
export function parseRoute(text: string): ParsedRoute {
  const rooms: RouteRoom[] = [];
  for (const ch of text) {
    if (/[\s,.\-–>/]/.test(ch)) {
      continue;
    }
    const room = FROM_CODE.get(ch.toLowerCase());
    if (room === undefined) {
      return {
        ok: false,
        error: `“${ch}” is not a room. Use M monster, E elite, ? unknown, R rest, S shop, T treasure.`,
      };
    }
    rooms.push(room);
    if (rooms.length > MAX_ROUTE_ROOMS) {
      return { ok: false, error: `A route has at most ${String(MAX_ROUTE_ROOMS)} rooms.` };
    }
  }
  return { ok: true, rooms };
}

/** The compact form used in links: `M?ERS`. */
export function formatRoute(rooms: readonly RouteRoom[]): string {
  return rooms.map((r) => ROOM_CODE[r]).join("");
}

/** URL parameter parser: a route that does not parse is ignored (the default, an empty route, is used instead). */
export function parseRouteParam(raw: string): string | undefined {
  const parsed = parseRoute(raw);
  return parsed.ok ? formatRoute(parsed.rooms) : undefined;
}

const OUTCOME_CODE = { event: "e", fight: "f", shop: "s", treasure: "t" } as const;
const FROM_OUTCOME: ReadonlyMap<string, UnknownObservation> = new Map([
  ["e", { outcome: "event" }],
  ["f", { outcome: "fight" }],
  ["s", { outcome: "shop" }],
  ["t", { outcome: "treasure" }],
  ["x", {}], // a “?” room whose result was not noted
]);

/** "?" rooms already met this act, as letters: e event, f fight, s shop, t treasure, x not noted. */
export function parseUnknownHistory(text: string): UnknownObservation[] | undefined {
  const out: UnknownObservation[] = [];
  for (const ch of text.toLowerCase()) {
    const obs = FROM_OUTCOME.get(ch);
    if (obs === undefined) {
      return undefined;
    }
    out.push(obs);
  }
  return out;
}

export function formatUnknownHistory(history: readonly UnknownObservation[]): string {
  return history.map((o) => (o.outcome === undefined ? "x" : OUTCOME_CODE[o.outcome])).join("");
}

/** URL parameter parser for the "?" history (at most as many as an act can hold is enforced by the engine). */
export function parseUnknownParam(raw: string): string | undefined {
  const parsed = parseUnknownHistory(raw);
  return parsed === undefined || parsed.length > 20 ? undefined : formatUnknownHistory(parsed);
}

/** One route as a sentence for people who cannot see the chips: "Monster, “?” room, Elite, Rest site". */
export function describeRoute(rooms: readonly RouteRoom[]): string {
  return rooms.length === 0 ? "no rooms yet" : rooms.map((r) => ROOM_LABEL[r]).join(", ");
}

/** A small example so the first visit shows something: the stretch between two rest sites, two ways. */
export const EXAMPLE_ROUTES: readonly [string, string] = ["M?MER", "M??RE"];
