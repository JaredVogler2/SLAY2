import { startHpGap, type NeowData } from "@/lib/neow";

const onePlace = (x: number): string => `${(x * 100).toFixed(1)}%`;

/**
 * Gap G13: the simulator starts a Necrobinder with more HP than the game gives it. Beside any simulated number for that class this
 * says so, with the measured cost to one pilot (from the committed development comparison), and what it does and does not tell
 * the reader. Nothing is shown for a class whose start is the game's own.
 */
export function StartHpNote({
  character,
  subject,
  data,
  className = "text-xs text-rose",
}: {
  character: string;
  /** `chances`: percentages for this class; `values`: the card values measured for it */
  subject: "chances" | "values";
  data?: NeowData;
  className?: string;
}) {
  const gap = startHpGap(character, data);
  if (!gap) {
    return null;
  }
  // the class ids are the lower-case names of the classes ("necrobinder" is a Necrobinder)
  const label = character.charAt(0).toUpperCase() + character.slice(1).toLowerCase();
  return (
    <p className={className}>
      The simulator starts a {label} with more HP than the game gives it (gap G13). With the
      game&rsquo;s HP one simulated pilot got past the Act-1 boss in {onePlace(gap.game)} of{" "}
      {gap.pairs.toLocaleString("en-US")} paired runs instead of {onePlace(gap.simulator)},{" "}
      {subject === "chances"
        ? `so read every percentage below as too high for ${label}.`
        : "and whether the order of these values holds at the game's HP has not been measured."}
    </p>
  );
}
