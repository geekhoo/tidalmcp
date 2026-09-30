# Delivery audit report

**Date:** 30 September 2026. **Disposition:** implementation/source delivery; production acceptance pending.

This report is generated from the work performed in the delivery environment. It is not an independent security audit, an official TIDAL review, or an assertion that the app has been deployed/approved by an agent host.

## Executed results

| Check | Result | Evidence |
|---|---|---|
| JavaScript syntax and declared CSS-variable references | Passed | `logs/syntax-check.log` |
| Dependency-free core tests | **65 passed / 0 failed / 0 skipped** | `logs/core-tests-coverage.log` |
| Real local HTTP auth boundary with synthetic TIDAL | Passed within core suite | `tests/core/http.test.mjs`, same log |
| Chromium component interactions | **18 checks passed** | `browser-results.json`, `logs/browser-component.log` |
| Actual component screenshots | Captured and visually reviewed | `screenshots/desktop.png`, `mobile.png`, `write-preview.png` |
| Original design token resolution/provenance | 155 production variables, source hashes recorded | `design-token-map.json`, core design tests |
| Source artifact integrity | SHA-256 manifest supplied | `source-manifest.json`; run `npm run manifest:verify` |

Browser execution used Chromium 144.0.7559.96 with the real UI source and CSS mounted in memory, and an injected adapter calling the real local synthetic HTTP service. Ordinary browser navigation was blocked by environment policy; the policy was not modified. No claim is made about the actual MCP Apps host bridge, production bundle or real account behavior from these component checks.

The native coverage report includes the modules loaded by the core suite and includes tests/fixtures. Its aggregate is not full-repository coverage. Unloaded SDK adapters, bootstrap code and host bridge behavior remain outside that measurement.

## Blocked and not executed

| Gate | Actual state | Release action |
|---|---|---|
| Dependency install | Offline npm install exited 1, `ENOTCACHED` | Successful trusted online install; retain and review generated lock |
| Production bundle | Exited 1; esbuild absent | Build and inspect generated single HTML resource |
| Official SDK protocol/adapter test suite | Exited 1 at module loading; no SDK assertions ran | Run `npm run test:mcp` after installation |
| Node Playwright suite | Not run | Install browser/dependencies; execute |
| Dependency advisory / transitive license / SBOM | Not run | Scan actual locked dependency graph |
| Raw full OpenAPI archive / exhaustive machine inventory | Not generated locally | Run `npm run schema:refresh`; review drift |
| Real TIDAL OAuth/read/write tests | No credentials supplied | Approved test app and explicit canary procedure |
| Actual ChatGPT/Codex/MCP Apps interoperability | No deployed endpoint/account test | Validate intended hosts and text-only clients |
| Docker/TLS/proxy/restore | Not executed | Deployment validation |
| Independent OAuth/security review | Not performed | Required for public/multi-user rollout |

No package lockfile, deployed URL, SDK build or passing interoperability badge has been fabricated. The package is not production-certified. Its demo is executable without those packages; the production entry point intentionally refuses to run without its real dependencies/build.

## Findings and resolutions

| ID | Finding | Resolution / remaining risk |
|---|---|---|
| F01 | Supplied easing token is an array, not a scalar | Resolver converts a valid four-number curve; alias/cycle tests added |
| F02 | UI font-family variable used a wrong name | Corrected to the generated primitive; CSS-reference check prevents recurrence |
| F03 | Host-rendered first result lacked pagination request context | Read outputs now carry source tool/arguments; core/browser checks cover it |
| F04 | Form error could appear behind an open modal | Error now also renders inside the dialog; browser check added |
| F05 | Demo open-link could target fictional IDs on the real service | Demo explicitly declines external navigation; production safe-link behavior remains separate |
| F06 | To-one artwork relationship accepted a cursor | Service rejects the unsupported combination before upstream I/O |
| F07 | OAuth refresh could drop required read permission | Rejects that narrowing; scope expansion remains forbidden |
| F08 | Per-tool OAuth metadata/challenge needed ChatGPT compatibility fields | Added explicit schemes and mirrored metadata plus safe error/description challenge fields; real host test pending |
| F09 | Oversized announced response was not cancelled before rejection | Reader now cancels the body before failure |
| F10 | Browser build path depended on URL pathname semantics | Switched to `fileURLToPath` for cross-platform path handling |
| R01 | SDK production build and integrations are unverified | **Release blocker**, not waived by synthetic tests |
| R02 | Exact transitive graph and advisory status unavailable | **Release blocker**; create a real lock and scan |
| R03 | Live scope/tier/include/relationship compatibility unverified | **Release blocker**; use a real approved test application |
| R04 | Confirmation boolean cannot prove human action | Host must enforce approvals; disable unattended writes |
| R05 | Playlist preflight has a time-of-check/time-of-use gap | Explicitly documented; no unsupported claim of atomic upstream locking |
| R06 | State store is single-writer and rewrites whole state | Small-scale deployment only; do not horizontally replicate |
| R07 | Audit chain alone cannot detect a rewritten/truncated history without a checkpoint | External checkpoint/retention needed; state/audit writes are not one distributed transaction |
| R08 | Dark token draft incomplete | Retained but not activated; current UI deliberately light |

## Evidence handling

Audit logs from the production application contain metadata only. `runtime-example.synthetic.jsonl` is a separate, actually executed synthetic service trace included to demonstrate chain verification; it contains no real TIDAL account events. Runtime data/key material and `.env` are not in the archive. The source manifest hashes delivery files and intentionally excludes itself. Re-running tests or regenerating docs can change evidence files; treat that as a new working tree, not a reason to rewrite historical results.

## Recommended acceptance decision

Accept this as an inspectable source implementation and tested core/component baseline. Do not accept it as an already installed, fully live-validated or externally audited production service. Complete the listed dependency, SDK, TIDAL, host and deployment gates before enabling a real account's write permissions.
