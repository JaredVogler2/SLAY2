#!/usr/bin/env node
// Rights gate for dependencies (prompts/11 campaign 11). Fails when a PRODUCTION dependency carries a license that is
// not on the allowlist, or when ANY dependency (build tools included) is under a strong-copyleft license.
// Exceptions are explicit and explained; an exception that no longer matches anything is reported so the list stays honest.
//   node scripts/check-licenses.mjs            (runs `pnpm licenses list`)
//   SLAY2_LICENSES_JSON=file.json node ...     (tests: read {prod, all} from a file instead)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PERMISSIVE = new Set(["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "OFL-1.1", "Unlicense", "CC0-1.0"]);
const STRONG_COPYLEFT = /^(A?GPL|SSPL|BUSL|PolyForm|CC-BY-NC|Commons-Clause)/i;

// license -> { packages that may carry it in the production tree, why that is acceptable }
const EXCEPTIONS = {
  "LGPL-3.0-or-later": {
    packages: ["@img/sharp-libvips-linux-x64", "@img/sharp-libvips-linuxmusl-x64"],
    reason: "optional prebuilt libvips pulled in by Next's image optimiser; SLAY2 does not use next/image, the libraries are dynamically linked and unmodified",
  },
  "CC-BY-4.0": { packages: ["caniuse-lite"], reason: "browser-support data used at build time only, attribution kept in the package" },
  "MPL-2.0": { packages: ["axe-core", "lightningcss"], reason: "file-level copyleft, unmodified, used by tests and the CSS build" },
};

function load() {
  if (process.env.SLAY2_LICENSES_JSON) return JSON.parse(readFileSync(process.env.SLAY2_LICENSES_JSON, "utf8"));
  const run = (args) => {
    const r = spawnSync("pnpm", ["licenses", "list", ...args, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`pnpm licenses failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  return { prod: run(["--prod"]), all: run([]) };
}

export function evaluate({ prod, all }) {
  const problems = [];
  const used = new Set();
  for (const [license, pkgs] of Object.entries(prod)) {
    if (PERMISSIVE.has(license)) continue;
    const exception = EXCEPTIONS[license];
    for (const p of pkgs) {
      if (exception?.packages.includes(p.name)) {
        used.add(`${license}:${p.name}`);
      } else {
        problems.push(`production dependency ${p.name}@${(p.versions ?? []).join(",")} is under ${license}, which is not on the allowlist`);
      }
    }
  }
  for (const [license, pkgs] of Object.entries(all)) {
    if (!STRONG_COPYLEFT.test(license)) continue;
    for (const p of pkgs) problems.push(`${p.name}@${(p.versions ?? []).join(",")} is under strong-copyleft/non-commercial ${license}`);
  }
  return { problems, used };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { problems, used } = evaluate(load());
  const counts = Object.entries(load().prod).map(([l, p]) => `${l}:${p.length}`).join("  ");
  console.log(`production licenses -> ${counts}`);
  for (const [license, e] of Object.entries(EXCEPTIONS)) {
    const hit = [...used].filter((u) => u.startsWith(license + ":")).length;
    console.log(`  exception ${license}: ${hit} package(s) - ${e.reason}`);
  }
  if (problems.length) {
    console.error(problems.map((p) => `LICENSE PROBLEM: ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("license gate: clean");
}
