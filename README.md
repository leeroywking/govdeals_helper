# GovDeals Listing Exporter

This repo contains a Python CLI that pulls the current GovDeals search listings into CSV, writes a companion metadata JSON file describing the single API response shape, and keeps a checkpoint state file for retry and resume.

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
