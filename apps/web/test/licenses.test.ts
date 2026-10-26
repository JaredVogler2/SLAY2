// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = join(__dirname, "..", "..", "..", "scripts", "check-licenses.mjs");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function gate(prod: object, all: object = prod) {
  const dir = mkdtempSync(join(tmpdir(), "slay2-lic-"));
  dirs.push(dir);
  const file = join(dir, "licenses.json");
  writeFileSync(file, JSON.stringify({ prod, all }));
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, SLAY2_LICENSES_JSON: file },
  });
}
const pkg = (name: string) => [{ name, versions: ["1.0.0"] }];

describe("dependency license gate (campaign 11)", () => {
  it("passes a permissive tree and the documented exceptions", () => {
    const r = gate({
      MIT: pkg("a"),
      "Apache-2.0": pkg("b"),
      "LGPL-3.0-or-later": pkg("@img/sharp-libvips-linux-x64"),
      "CC-BY-4.0": pkg("caniuse-lite"),
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("license gate: clean");
  });

  it("fails when a new production dependency brings a license that is not allowed", () => {
    const r = gate({ MIT: pkg("a"), "GPL-3.0-only": pkg("sneaky-lib") });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("sneaky-lib");
  });

  it("an exception covers only the packages it names", () => {
    const r = gate({ "LGPL-3.0-or-later": pkg("some-other-lgpl-package") });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("some-other-lgpl-package");
  });

  it("strong copyleft is refused even in build tooling", () => {
    const r = gate({ MIT: pkg("a") }, { MIT: pkg("a"), "AGPL-3.0-only": pkg("dev-tool") });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dev-tool");
  });

  it("holds for the real dependency tree of this repository", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  }, 60_000); // lists the whole tree twice through pnpm: about 2 s on a free machine, much more under load
});
