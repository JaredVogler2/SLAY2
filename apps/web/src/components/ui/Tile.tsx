/** One headline figure with what it is and its interval or caveat: the tiles of a result's summary row. Render inside a `<ul>`. */
export function Tile({ k, value, note }: { k: string; value: string; note: string }) {
  return (
    <li className="rounded-lg border border-line bg-ink-2 p-3">
      <p className="text-xs text-muted">{k}</p>
      <p className="num mt-1 font-display text-2xl text-parchment">{value}</p>
      <p className="num mt-0.5 text-xs text-dim">{note}</p>
    </li>
  );
}
