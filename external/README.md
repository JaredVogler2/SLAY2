# external/

Pinned, **read-only, git-ignored** third-party inputs. See `pins.json`, `docs/IP-COMPLIANCE.md` (ADR-011) and `docs/sources/SOURCE-REGISTRY.md`.

```bash
scripts/external-fetch.sh            # sts2-rl-agent + spire-archive at their pinned SHAs
scripts/external-fetch.sh --all      # every pinned repo
export SLAY2_EXTERNAL_ROOT=/path    # optional: alternative checkout root
```

* `external/checkouts/` is ignored by git; `scripts/guard-third-party.sh` blocks any attempt to stage it.
* Nothing in here is ours. Do not copy files out of it. Facts go into `docs/` with a file-path citation; results go into `experiments/`.
