# Local Query App

This project now includes a local-only Postgres-backed query app for exploratory work on the GovDeals dataset.

## What It Provides

- a Dockerized PostgreSQL database
- automatic loading of `data/govdeals_listings.csv`
- a local HTTP API that accepts raw SQL
- a raw table and a typed SQL view

This is intended for local analysis only. It is not designed for internet exposure.

## Services

### PostgreSQL

- host: `127.0.0.1`
- port: `5432`
- database: `govdeals`
- user: `govdeals`
- password: `govdeals`

### Query API

- host: `127.0.0.1`
- port: `8000`

## Loaded Objects

### Raw Table

- `govdeals_listings_raw`

This mirrors the CSV exactly with text columns.

### Typed View

- `govdeals_listings`

This casts common numeric, boolean, and timestamp fields so ad hoc SQL is much easier.

Examples of typed fields in the view:

- `assetId`
- `accountId`
- `currentBid`
- `assetBidPrice`
- `bidCount`
- `assetAuctionStartDate`
- `assetAuctionEndDate`
- `assetAuctionEndDateUtc`
- `latitude`
- `longitude`
- `isSoldAuction`
- `isNewAsset`

## Start The Stack

```bash
docker compose up --build
```

On startup, the API checks whether the current CSV file has already been loaded into Postgres. If not, it loads the CSV and creates the typed view.

## Health Check

```bash
curl http://127.0.0.1:8000/health
```

## Dataset Info

```bash
curl http://127.0.0.1:8000/dataset
```

This returns the loaded metadata and state JSON alongside the table/view names.

## Built-In Summary Endpoint

The app includes a dedicated endpoint for the commonly requested market breakdown:

```bash
curl http://127.0.0.1:8000/summary/market-breakdown
```

It returns:

- total items in the database
- items over `$1,000` that are not vehicles or heavy equipment
- total vehicles
- vehicles in Washington
- vehicles outside Washington
- total heavy equipment
- heavy equipment in Washington
- heavy equipment outside Washington

Notes:

- vehicle and heavy-equipment classification is heuristic
- classification is based on `categoryDescription` and `assetShortDescription`
- Washington is identified by `locationState = 'WA'`

## First-Layer Programmatic Filter

The app also includes a dedicated endpoint to run the first-layer programmatic filter and scoring pass.

Run it:

```bash
curl -s http://127.0.0.1:8000/analysis/run-first-layer \
  -H 'content-type: application/json' \
  -d '{"top_n": 500}'
```

This writes output files under:

- `/workspace/data/first_layer/main_candidates.csv`
- `/workspace/data/first_layer/main_candidates_top_500.csv`
- `/workspace/data/first_layer/consumer_vehicles.csv`
- `/workspace/data/first_layer/excluded_items.csv`
- `/workspace/data/first_layer/summary.json`

Read the latest summary:

```bash
curl http://127.0.0.1:8000/summary/first-layer
```

Notes:

- this is a first-pass, fully programmatic filter
- comp-driven resale and profit fields are placeholders in this pass
- distance is computed from ZIP `98155` using listing latitude/longitude when present
- vehicle and heavy-equipment classification is heuristic and regex-based

## Mobile Bundle Export

The app includes a dedicated endpoint to convert the latest first-layer CSV outputs into app-ready JSON for the Android client.

Run it:

```bash
curl -s http://127.0.0.1:8000/analysis/export-mobile-bundle \
  -H 'content-type: application/json' \
  -d '{}'
```

This writes:

- `/workspace/mobile/www/data/manifest.json`
- `/workspace/mobile/www/data/mainCandidates.json`
- `/workspace/mobile/www/data/consumerVehicles.json`
- `/workspace/mobile/www/data/excludedItems.json`

Read the latest bundle summary:

```bash
curl http://127.0.0.1:8000/summary/mobile-bundle
```

Notes:

- the bundle is intentionally compact and only includes fields the Android client needs
- reviewed/unreviewed state is not stored here; it stays local to the device
- the Android client currently reads these JSON files directly from its bundled assets

## Run SQL

The API accepts raw SQL over HTTP.

Example:

```bash
curl -s http://127.0.0.1:8000/query \
  -H 'content-type: application/json' \
  -d '{"sql":"select assetId, assetShortDescription, currentBid from govdeals_listings order by currentBid desc limit 5"}'
```

Another example:

```bash
curl -s http://127.0.0.1:8000/query \
  -H 'content-type: application/json' \
  -d '{"sql":"select count(*) from govdeals_listings"}'
```

## Notes

- The `/query` endpoint will execute arbitrary SQL.
- This is acceptable here because the service is intended to run only on the local machine.
- The API truncates result sets to a configurable maximum per request to avoid dumping massive JSON responses.
- The typed view is the main object to query unless you specifically want raw CSV strings.
- the typed view is not safe for every `SELECT *` workflow because some raw values are dirty; the first-layer runner and mobile bundle exporter rely on raw first-layer outputs instead
