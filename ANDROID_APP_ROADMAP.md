# Android App Roadmap

This roadmap covers the path from the current local analysis tooling to a usable Android app for reviewing GovDeals opportunities.

## Product Goal

The end state is an Android app that lets the user:

- load filtered deal candidates
- browse them in views tailored to result type
- mark items as reviewed
- open the original GovDeals listing directly
- eventually support deeper scoring and richer investigation

The immediate goal is a practical local-first Android app release that is good enough to install and test on-device.

## Constraints

- the app is for local/private use, not public internet exposure
- the current dataset and first-layer filtering already exist locally
- local Android build tooling is not available in this workspace, so APK generation should be handled by GitHub Actions

## Phase 1: Testable Android App

Deliver a first installable Android build with:

- bundled first-layer output data
- separate views for:
  - main candidates
  - consumer vehicles
  - excluded items
- item cards / list rows with:
  - title
  - score
  - current bid
  - distance
  - key flags
- item detail screen
- direct link-out to the original GovDeals listing
- local reviewed/unreviewed state persisted on-device
- basic search and sort inside the app

Success condition:

- user can install APK
- user can review items comfortably
- user can mark items reviewed
- user can open the original listing in the browser

Current implementation status:

- inbox-style bucketed triage UI is implemented
- dense rows plus inline expandable detail sections have replaced the earlier card-heavy layout
- app shell is implemented under `mobile/`
- app-ready JSON bundle export is implemented
- reviewed state is stored locally on-device via `localStorage`
- holding state is stored locally on-device via `localStorage`
- new-item state is stored locally on-device via `localStorage`
- pursued-state export is implemented as plain text download/copy
- full local device-state export/import is implemented as plain-text JSON download/copy/paste
- per-item Codex enrichment is implemented with local API-key settings and saved enrichment state
- batch enrichment is implemented for filtered, selected, or pursued items while the app remains open
- selected-item pursue/hold/reject actions are implemented
- comp-link capture is implemented when enrichment can find source URLs
- optional backend-assisted full refresh is implemented when a reachable local query API URL is configured in the app
- optional expanded-row listing refresh is implemented against the current backend dataset when a reachable backend URL is configured
- backend-assisted refreshed bundles are cached on-device and restored on startup when newer than the packaged bundle
- GitHub Actions is set up to build a debug APK and publish or update an `Android Road Preview` prerelease on pushes to `main`
- first usable trial target is now aligned with this phase

Known limitation in the current preview:

- batch enrichment is not a true Android background worker
- it only keeps running while the app remains open in the foreground
- button interactions currently trigger a rerender that can snap the list back to the top, which makes multi-item triage and batch setup unnecessarily annoying
- batch enrichment is still foreground-only and not yet moved into a native Android service

Planned next-step architecture for that limitation:

- move batch enrichment into native Android execution
- start it from visible user action inside the app
- run it as a foreground service with a persistent notification
- support queue progress, stop, and eventual resume behavior from the notification or app UI

## Phase 2: Better Triage UX

Improve the app with:

- saved filters
- quick actions for:
  - reviewed
  - shortlist
  - skip
- reject / remove from active list
- pinned explanation fields:
  - positive reasons
  - negative reasons
- view presets by:
  - nearby
  - high score
  - ends soon
  - vehicles
- local summary stats in the app
- triage buckets such as:
  - active
  - pursued
  - rejected
  - holding / undo area

Additional platform work to include in this phase:

- native Android foreground-service support for long-running enrichment jobs
- explicit user-controlled background execution path with notification-based progress
- clearer stop/resume semantics when the app leaves the foreground
- keep an explicit `Details` action on each row even when row-tap also selects the item
- use an inline expansion or chevron-style affordance so detail feels attached to the row rather than detached at the bottom of the screen
- preserve list scroll position and avoid snap-to-top behavior after per-item actions such as pursue, review, and enrich
- reduce full-list rerenders for row-level actions so the user can move down the list without repeated scrolling
- add a reversible remove/reject workflow so investigated items can leave the active list without being permanently lost
- support a holding area or undo bucket so mistakenly rejected items can be restored easily
- continue reducing rerender-heavy row actions so selection and review flows feel stable on long lists

## Phase 3: Data Refresh Workflow

Add a repeatable refresh path:

- rerun exporter
- rerun first-layer filter
- generate app-ready data bundle
- rebuild APK
- support item-level refresh from the detail view so opening `Details` can update the current bid, description, and other listing fields in place
- support a full listing refresh that merges new source data into the existing app state instead of replacing local triage state
- preserve reviewed, pursued, rejected, and holding-area status across refreshes using stable item identity keys
- tag newly appeared listings as `new` after a full refresh
- allow filtering and sorting based on `new` status after refresh
- update in-place listings already under review or consideration when their bid, description, or related listing metadata changes
- eventually surface removed / ended listings distinctly so the user can tell whether an item disappeared versus being manually rejected

Eventually:

- app can import a new data file without needing a full code rebuild
- app can perform these refreshes without requiring a full APK rebuild

## Phase 4: Richer Scoring Inputs

Add more structured inputs into the scoring layer:

- comp-derived resale estimates
- profit estimates
- better category taxonomy
- handling flags
- salability heuristics
- specialty-forum flags

The app should surface these fields, but not depend on LLM reasoning.

## Implementation Approach

For the first Android release:

- use a small web-tech client packaged for Android
- keep reviewed-state local to the device
- bundle app-ready JSON generated from the current first-layer outputs
- build APK in GitHub Actions

This is the fastest path to a usable APK without requiring a full native Android codebase immediately.

## Delivery Sequence

1. create app shell and local data model
2. generate app-ready data bundle from first-layer outputs
3. implement result-type views and reviewed-state
4. package the app for Android
5. add GitHub Actions APK build
6. push to GitHub and use generated APK for device testing

## Continuing Documentation Obligation

When the Android app changes, update:

- [README.md](/home/ein/projects/govdeals/README.md)
- [LOCAL_QUERY_APP.md](/home/ein/projects/govdeals/LOCAL_QUERY_APP.md)
- [FIRST_LAYER_SCORING_SPEC.md](/home/ein/projects/govdeals/FIRST_LAYER_SCORING_SPEC.md)
- [ANDROID_APP_ROADMAP.md](/home/ein/projects/govdeals/ANDROID_APP_ROADMAP.md)
- [AGENTS.md](/home/ein/projects/govdeals/AGENTS.md)
