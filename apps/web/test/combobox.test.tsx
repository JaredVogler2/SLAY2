import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/Combobox";

const NAMES = ["Anger", "Bash", "Cleave"] as const;
// the search is kept stable between renders, as the component asks
const search = (query: string): readonly string[] =>
  NAMES.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));

function Box({ onSelect = () => undefined }: { onSelect?: (name: string) => void }) {
  return (
    <Combobox<string>
      label="Pick a card"
      onSelect={onSelect}
      search={search}
      getKey={(n) => n}
      renderOption={(n) => n}
      placeholder="Search"
      emptyText={(q) => `Nothing matches “${q}”.`}
    />
  );
}

const liveRegion = (container: HTMLElement): HTMLElement => {
  const region = container.querySelector<HTMLElement>('[aria-live="polite"]');
  if (!region) throw new Error("no live region");
  return region;
};

// the box closes its list shortly after it loses focus (so that a click on an option registers first): 120 ms in the component
const CLOSE_DELAY = 120;

const focus = (el: HTMLElement): void => {
  act(() => {
    el.focus();
  });
};
const blur = (el: HTMLElement): void => {
  act(() => {
    el.blur();
  });
};
const wait = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("the search box", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the list a moment after it loses focus", () => {
    render(<Box />);
    const box = screen.getByRole("combobox", { name: "Pick a card" });
    focus(box);
    fireEvent.change(box, { target: { value: "ba" } });
    expect(box).toHaveAttribute("aria-expanded", "true");
    blur(box);
    expect(box).toHaveAttribute("aria-expanded", "true");
    wait(CLOSE_DELAY + 20);
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("still takes a click on an option that comes right after the box lost focus", () => {
    const onSelect = vi.fn();
    render(<Box onSelect={onSelect} />);
    const box = screen.getByRole("combobox", { name: "Pick a card" });
    focus(box);
    fireEvent.change(box, { target: { value: "ba" } });
    blur(box);
    fireEvent.mouseDown(screen.getByRole("option", { name: "Bash" }));
    expect(onSelect).toHaveBeenCalledWith("Bash");
  });

  it("does not close the list under someone who came back to the box and typed before an earlier blur's delay was up", () => {
    // what happens when focus leaves the box and a handler puts it straight back (the relics panel does, after a removal)
    const { container } = render(<Box />);
    const box = screen.getByRole("combobox", { name: "Pick a card" });
    focus(box);
    blur(box);
    wait(30);
    focus(box);
    fireEvent.change(box, { target: { value: "zzzzqx" } });
    expect(liveRegion(container)).toHaveTextContent("Nothing matches “zzzzqx”.");
    wait(CLOSE_DELAY * 3);
    expect(liveRegion(container)).toHaveTextContent("Nothing matches “zzzzqx”.");
  });

  it("keeps a list that has matches open the same way", () => {
    render(<Box />);
    const box = screen.getByRole("combobox", { name: "Pick a card" });
    focus(box);
    blur(box);
    focus(box);
    fireEvent.change(box, { target: { value: "a" } });
    wait(CLOSE_DELAY * 3);
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });
});
