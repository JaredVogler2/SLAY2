import type { RouteRoom } from "@slay2/odds";

import { cn } from "@/lib/cn";

/**
 * Original room glyphs (a diamond for a fight, a crowned diamond for an elite, a ring with a mark for a "?", a flame,
 * a pouch and a chest). Each room also carries a text label wherever the glyph appears, so colour is never the only cue.
 */
export function RoomIcon({ room, className }: { room: RouteRoom; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {room === "monster" ? (
        <>
          <path d="M12 3 20 12 12 21 4 12Z" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {room === "elite" ? (
        <>
          <path d="M12 6 20 14 12 22 4 14Z" />
          <path d="M5 3.5 8 8M19 3.5 16 8M12 1.5V6" />
          <path d="M12 11.5 15.5 14 12 16.5 8.5 14Z" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {room === "unknown" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2" />
          <path d="M12 17.2h.01" strokeWidth="2.4" />
        </>
      ) : null}
      {room === "rest" ? (
        <>
          <path d="M12 3c.7 3.6 4.9 5.1 4.9 9.5a4.9 4.9 0 0 1-9.8 0c0-2.2 1.2-3.3 2-4.7.7 1.3 1.3 1.4 1.9.9C11.4 7.4 11.8 5.6 12 3Z" />
          <path d="M5 21h14" />
        </>
      ) : null}
      {room === "shop" ? (
        <>
          <path d="M8 8h8l2.2 12H5.8Z" />
          <path d="M9.4 8a2.6 2.6 0 0 1 5.2 0" />
          <path d="M12 12.5v4M10.4 14h3.2" />
        </>
      ) : null}
      {room === "treasure" ? (
        <>
          <path d="M4 10.5a8 6 0 0 1 16 0V19H4Z" />
          <path d="M4 13.5h16" />
          <path d="M12 12.2v3.4" />
        </>
      ) : null}
    </svg>
  );
}

/** Text colour per room, matching the colours the "?" bars already use for the same outcomes. */
export const ROOM_TONE: Readonly<Record<RouteRoom, string>> = {
  monster: "text-rose",
  elite: "text-copper",
  unknown: "text-parchment",
  rest: "text-teal",
  shop: "text-teal",
  treasure: "text-gold",
};
