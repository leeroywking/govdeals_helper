# Agent Notes

This repository is expected to remain usable by future agents without rediscovery work. Documentation updates are a continuing obligation, not a one-time task.

## Documentation Obligation

Whenever behavior, endpoints, workflows, output files, or required local setup change, update the relevant docs in the same change set.

At minimum, keep these current:

- [README.md](/home/ein/projects/govdeals/README.md)
- [LOCAL_QUERY_APP.md](/home/ein/projects/govdeals/LOCAL_QUERY_APP.md)
- [FIRST_LAYER_SCORING_SPEC.md](/home/ein/projects/govdeals/FIRST_LAYER_SCORING_SPEC.md)
- [ANDROID_APP_ROADMAP.md](/home/ein/projects/govdeals/ANDROID_APP_ROADMAP.md)
- [UI_REWORK_SPEC.md](/home/ein/projects/govdeals/UI_REWORK_SPEC.md)

If a new reusable endpoint or analysis workflow is added, document:

- what it does
- how to call it
- what files it writes
- important caveats or heuristic limitations

If the Android app gains new local workflows, also document:

- what state is persisted on-device
- what exports the user can produce from the app
- any security caveats for local API-key usage
- whether long-running work is foreground-only or uses native Android background execution
- whether refreshed/ended listing states are cached locally and how they survive app restarts

## Current Important Endpoints

The local query API currently exposes these important routes:

- `GET /health`
- `GET /dataset`
- `POST /query`
- `GET /summary/market-breakdown`
- `POST /analysis/run-first-layer`
- `GET /summary/first-layer`
- `POST /analysis/export-mobile-bundle`
- `GET /summary/mobile-bundle`
- `GET /bundle/mobile/{dataset_name}`
- `GET /listing/{account_id}/{asset_id}`
- `POST /analysis/refresh-all`

If any of these change, update docs immediately.

## Execution Bias

Keep working while there is work to do.

Do not stop after a single small UI tweak, endpoint, or bugfix if there are still clear roadmap items or directly adjacent required work that can be completed safely in the same pass.

Prefer larger autonomous chunks of progress:

- finish coherent feature slices end-to-end
- ship related UI, backend, and documentation changes together
- only pause for user review when there is a real product-direction decision, blocker, or risk that cannot be resolved reasonably from local context

## Data Hygiene

Keep `data/` reasonably clean.

Expected long-lived artifacts:

- `data/govdeals_listings.csv`
- `data/govdeals_listings.csv.meta.json`
- `data/govdeals_listings.csv.state.json`
- `data/first_layer/`
- `mobile/www/data/`

Remove stale smoke-test and scratch outputs when they are no longer needed.

## Secrets

- Never commit real secrets.
- Use `.env` for local secrets.
- Keep `.env.example` current as the template.

## Implementation Bias

Prefer:

- deterministic, programmatic filtering before any LLM reasoning
- transparent scores and reason columns
- preserving uncertain-but-promising items with penalties rather than aggressive exclusion
