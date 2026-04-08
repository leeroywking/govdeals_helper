# GovDeals Helper

This repo contains:

- a Python CLI that pulls current GovDeals listings into CSV
- a local-only Postgres-backed query API for ad hoc SQL and reusable summary endpoints
- a first-layer, fully programmatic filtering pass that writes ranked candidate files for later human and agentic review
- a local-first Android review app packaged from app-ready JSON data

The intended workflow is:

1. export the current GovDeals dataset
2. load/query it locally through the query API
3. run first-layer programmatic filtering
4. do human review on the reduced candidate set
5. do deeper agentic investigation only on survivors

## Main Docs

- [LOCAL_QUERY_APP.md](/home/ein/projects/govdeals/LOCAL_QUERY_APP.md): local Postgres/query server and analysis endpoints
- [FIRST_LAYER_SCORING_SPEC.md](/home/ein/projects/govdeals/FIRST_LAYER_SCORING_SPEC.md): first-layer scoring rules and intent
- [ANDROID_APP_ROADMAP.md](/home/ein/projects/govdeals/ANDROID_APP_ROADMAP.md): Android delivery plan and current milestone

## Usage

```bash
python3 fetch_govdeals_listings.py
```

That writes:

- `data/govdeals_listings.csv`
- `data/govdeals_listings.csv.meta.json`
- `data/govdeals_listings.csv.state.json`

Useful options:

```bash
python3 fetch_govdeals_listings.py --max-pages 2 --page-size 50
python3 fetch_govdeals_listings.py --search forklift --output data/forklifts.csv
python3 fetch_govdeals_listings.py --sort-by bid
python3 fetch_govdeals_listings.py --metadata-output data/govdeals_meta.json
python3 fetch_govdeals_listings.py --pause-seconds 2
python3 fetch_govdeals_listings.py --resume
```

## Local Query App

After the dataset is present, the local query stack can be started with:

```bash
docker compose up --build
```

Important local endpoints:

- `GET /health`
- `GET /dataset`
- `POST /query`
- `GET /summary/market-breakdown`
- `POST /analysis/run-first-layer`
- `GET /summary/first-layer`
- `POST /analysis/export-mobile-bundle`
- `GET /summary/mobile-bundle`

See [LOCAL_QUERY_APP.md](/home/ein/projects/govdeals/LOCAL_QUERY_APP.md) for example calls and output files.

## Android App

The repository now includes a simple local-first Android review client under `mobile/`.

Current app features:

- separate views for main candidates, consumer vehicles, and excluded items
- direct GovDeals link-out per item
- local reviewed/unreviewed state stored on-device
- separate pursued/not-pursued state stored on-device
- plain-text export of pursued items for transfer back to a computer
- per-item Codex enrichment with local API-key configuration
- batch enrichment for the current filtered set or the pursued set
- search and sorting inside the app
- item detail sheet with score reasons and flags

The app reads app-ready JSON files from `mobile/www/data/`.

Codex enrichment notes:

- the app prompts for an OpenAI API key locally on the device
- the key can be session-only or remembered on that device
- enrichment results are stored locally in the app and affect the displayed effective score
- enrichment now attempts to include direct comp links when available
- batch enrichment is foreground-only; it is not a guaranteed background Android worker yet
- this is intentionally a local-use tradeoff; client-side API key use is less secure than a server-backed integration

To refresh those files from the latest first-layer outputs:

```bash
curl -s http://127.0.0.1:8000/analysis/export-mobile-bundle \
  -H 'content-type: application/json' \
  -d '{}'
```

Or:

```bash
python3 -m app.mobile_bundle
```

GitHub Actions builds an Android debug APK on pushes to `main` and publishes or updates a prerelease named `Android Road Preview`.

## What The API Returns

The script uses one endpoint only:

`POST https://maestro.lqdt1.com/search/list`

The live response currently includes these top-level keys:

- `assetSearchResults`
- `assetSearchFacets`
- `assetSearchFacetsShortened`
- `isAPIFailureActive`
- `easMsg`

For the default anonymous GovDeals-wide search, the per-listing data is the useful part and the facet arrays are currently empty. The metadata JSON records that explicitly.

### Listing Fields

Each listing currently includes fields such as:

- IDs: `assetId`, `accountId`, `auctionId`, `locationId`, `eventId`, `warehouseId`
- Title and description: `assetShortDescription`, `assetLongDescription`
- Category data: `assetCategory`, `categoryDescription`
- Seller data: `companyName`, `groupId`, `commDesc`
- Location data: `locationAddress1`, `locationAddress2`, `locationCity`, `locationState`, `stateDescription`, `locationZip`, `country`, `countryDescription`, `latitude`, `longitude`
- Timing data: `assetAuctionStartDate`, `assetAuctionEndDate`, `assetAuctionEndDateUtc`, display-formatted date fields, `timeRemaining`
- Bid data: `assetBidPrice`, `currentBid`, `bidCount`, `highBidder`, `currencyCode`, `auctionTypeId`
- Status flags: `isSoldAuction`, `isNewAsset`, `isReserveNotMet`, `hasReservePrice`, `isFreeAsset`, `allowProbationBidders`
- Media and navigation data: `photo`, `clickUrl`, `categoryRoutepath`

The CSV keeps the raw fields and also adds:

- `itemUrl`
- `photoUrl`
- `locationDisplay`
- `categoryDisplay`

## Full Run Expectations

Based on the live API test on April 8, 2026:

- Current full result count is about `24.5k` listings
- A full run with the default `--page-size 100` should make about `246` API requests
- With `--pause-seconds 0.15`, expect roughly `1-3 minutes` wall-clock time depending on network conditions
- With `--pause-seconds 2`, expect roughly `8-12 minutes`
- The CSV will contain one row per listing with all currently exposed listing-level fields from that API response
- The metadata JSON will describe the response keys, field names, total count, and include a sample raw asset object from page 1
- The state JSON will track progress, retries, seen listing keys, and resume context

## Retry And Resume

The exporter now:

- writes rows incrementally as each page is fetched
- checkpoints after every page
- retries failed page requests with exponential backoff
- resumes without trusting old page numbers

Resume strategy:

- restart from page `1`
- deduplicate by `(accountId, assetId)`
- keep appending only unseen rows
- stop after several consecutive pages produce no new rows

This is intentionally safer than resuming from a saved page number because listings can be added or removed while a run is in progress, which shifts later page boundaries.

## Notes

- The script uses GovDeals' current anonymous search API surface.
- Server-side sort parameters currently error from this endpoint, so the script sorts client-side after fetching.
- Output columns include the raw listing fields plus derived helper columns for easier downstream filtering.
- Category information is already present per listing via `assetCategory` and `categoryDescription`; the default top-level facet arrays are empty in the live anonymous response.
- Environment secrets should go in `.env`; use `.env.example` as the template.
