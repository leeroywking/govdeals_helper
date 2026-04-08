#!/usr/bin/env python3
import argparse
import base64
import csv
import json
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


API_URL = "https://maestro.lqdt1.com/search/list"
PAGE_URL = "https://www.govdeals.com/en/search"
BUSINESS_ID = "GD"
API_KEY = "af93060f-337e-428c-87b8-c74b5837d6cd"
APIM_SUBSCRIPTION_KEY = "cf620d1d8f904b5797507dc5fd1fdb80"
DEFAULT_TIMEOUT = 30
DEFAULT_PAGE_SIZE = 100
DEFAULT_RETRIES = 5
DEFAULT_RETRY_BACKOFF = 2.0
DEFAULT_RESUME_OVERLAP_PAGES = 5

PREFERRED_COLUMNS = [
    "assetId",
    "accountId",
    "assetShortDescription",
    "categoryDisplay",
    "categoryDescription",
    "assetCategory",
    "companyName",
    "locationDisplay",
    "locationCity",
    "locationState",
    "stateDescription",
    "country",
    "countryDescription",
    "assetAuctionStartDate",
    "assetAuctionStartDateDisplay",
    "assetAuctionEndDateUtc",
    "assetAuctionEndDate",
    "assetAuctionEndDateDisplay",
    "timeRemaining",
    "currentBid",
    "assetBidPrice",
    "bidCount",
    "currencyCode",
    "makebrand",
    "model",
    "modelYear",
    "auctionTypeId",
    "lotNumber",
    "isSoldAuction",
    "isNewAsset",
    "itemUrl",
    "photoUrl",
    "assetLongDescription",
]


@dataclass
class PageResult:
    items: list[dict[str, Any]]
    total_count: int
    payload: dict[str, Any]


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_page_unique_id(page_url: str) -> str:
    encoded = base64.b64encode(page_url.encode("utf-8")).decode("ascii")
    return encoded.replace("+", "-").replace("/", "_").replace("=", "")


def build_headers(page_url: str, timezone_name: str) -> dict[str, str]:
    return {
        "x-api-key": API_KEY,
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY,
        "x-user-id": "-1",
        "x-api-correlation-id": str(uuid.uuid4()),
        "x-ecom-session-id": str(uuid.uuid4()),
        "x-page-unique-id": build_page_unique_id(page_url),
        "x-referer": page_url,
        "x-user-timezone": timezone_name,
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        ),
        "Content-Type": "application/json",
    }


def build_payload(page: int, page_size: int, search_text: str | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "businessId": BUSINESS_ID,
        "page": page,
        "displayRows": page_size,
        "requestType": "search",
    }
    if search_text:
        payload["searchText"] = search_text
    return payload


def asset_url(item: dict[str, Any]) -> str:
    account_id = item.get("accountId")
    asset_id = item.get("assetId")
    if not account_id or not asset_id:
        return ""
    url = f"https://www.govdeals.com/asset/{asset_id}/{account_id}"
    warehouse_id = item.get("warehouseId")
    if warehouse_id:
        url = f"{url}?wid={warehouse_id}"
    return url


def photo_url(item: dict[str, Any]) -> str:
    photo = item.get("photo")
    if not photo:
        return ""
    return f"https://files.lqdt1.com/{photo}"


def location_display(item: dict[str, Any]) -> str:
    parts = [
        item.get("locationCity"),
        item.get("stateDescription") or item.get("locationState"),
        item.get("countryDescription") or item.get("country"),
    ]
    return ", ".join(str(part).strip() for part in parts if part and str(part).strip())


def normalize_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    return str(value).replace("\r\n", "\n").replace("\r", "\n")


def normalize_item(item: dict[str, Any]) -> dict[str, str]:
    row = {key: normalize_value(value) for key, value in item.items()}
    row["itemUrl"] = asset_url(item)
    row["photoUrl"] = photo_url(item)
    row["locationDisplay"] = location_display(item)
    row["categoryDisplay"] = normalize_value(item.get("categoryDescription"))
    return row


def parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def sort_rows(rows: list[dict[str, str]], sort_by: str) -> list[dict[str, str]]:
    if sort_by == "none":
        return rows

    sort_fields = {
        "end": "assetAuctionEndDateUtc",
        "start": "assetAuctionStartDate",
        "bid": "currentBid",
        "title": "assetShortDescription",
    }
    field = sort_fields[sort_by]

    if sort_by in {"end", "start"}:
        return sorted(rows, key=lambda row: parse_datetime(row.get(field)))
    if sort_by == "bid":
        return sorted(rows, key=lambda row: float(row.get(field) or 0), reverse=True)
    return sorted(rows, key=lambda row: (row.get(field) or "").lower())


def listing_key(item: dict[str, Any] | dict[str, str]) -> str:
    return f"{item.get('accountId', '')}:{item.get('assetId', '')}"


def load_state(state_path: Path) -> dict[str, Any] | None:
    if not state_path.exists():
        return None
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_state(state_path: Path, state: dict[str, Any]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=True, sort_keys=True), encoding="utf-8")


def initial_state(args: argparse.Namespace, output_path: Path) -> dict[str, Any]:
    return {
        "apiUrl": API_URL,
        "pageUrl": PAGE_URL if not args.search else f"{PAGE_URL}?kWord={args.search}",
        "businessId": BUSINESS_ID,
        "searchText": args.search or "",
        "outputPath": str(output_path),
        "createdAt": now_utc_iso(),
        "updatedAt": now_utc_iso(),
        "status": "running",
        "pageSize": args.page_size,
        "pauseSeconds": args.pause_seconds,
        "sortBy": args.sort_by,
        "maxPages": args.max_pages,
        "timeout": args.timeout,
        "retryCount": args.retries,
        "retryBackoffSeconds": args.retry_backoff_seconds,
        "resumeOverlapPages": args.resume_overlap_pages,
        "pagesFetched": 0,
        "rowsWritten": 0,
        "totalCount": None,
        "lastPageFetched": 0,
        "consecutiveResumeOverlapPages": 0,
        "responseTopLevelKeys": [],
        "assetFieldNames": [],
        "assetSearchFacetsLength": None,
        "assetSearchFacetsShortenedLength": None,
        "isAPIFailureActive": None,
        "easMsg": None,
        "sampleAsset": {},
        "seenKeys": [],
    }


def update_state_from_payload(state: dict[str, Any], payload: dict[str, Any], total_count: int) -> None:
    if not state["responseTopLevelKeys"]:
        state["responseTopLevelKeys"] = sorted(payload.keys())
    if not state["assetFieldNames"]:
        state["assetFieldNames"] = sorted(
            {key for item in payload.get("assetSearchResults", []) for key in item.keys()}
        )
    if state["assetSearchFacetsLength"] is None:
        state["assetSearchFacetsLength"] = len(payload.get("assetSearchFacets") or [])
    if state["assetSearchFacetsShortenedLength"] is None:
        state["assetSearchFacetsShortenedLength"] = len(payload.get("assetSearchFacetsShortened") or [])
    if state["isAPIFailureActive"] is None:
        state["isAPIFailureActive"] = payload.get("isAPIFailureActive")
    if state["easMsg"] is None:
        state["easMsg"] = payload.get("easMsg")
    if not state["sampleAsset"]:
        state["sampleAsset"] = payload.get("assetSearchResults", [{}])[0]
    if state["totalCount"] is None:
        state["totalCount"] = total_count


def fetch_page_with_retries(
    session: requests.Session,
    page: int,
    page_size: int,
    timeout: int,
    timezone_name: str,
    search_text: str | None,
    retries: int,
    retry_backoff_seconds: float,
) -> PageResult:
    page_url = PAGE_URL if not search_text else f"{PAGE_URL}?kWord={search_text}"
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            response = session.post(
                API_URL,
                headers=build_headers(page_url, timezone_name),
                data=json.dumps(build_payload(page, page_size, search_text)),
                timeout=timeout,
            )
            response.raise_for_status()
            payload = response.json()
            total_count = int(response.headers.get("x-total-count", "0") or 0)
            return PageResult(
                items=payload.get("assetSearchResults", []),
                total_count=total_count,
                payload=payload,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= retries:
                break
            sleep_seconds = retry_backoff_seconds * (2 ** (attempt - 1))
            print(
                f"Request failed on page {page}, attempt {attempt}/{retries}: {exc}. "
                f"Retrying in {sleep_seconds:.1f}s.",
                file=sys.stderr,
            )
            time.sleep(sleep_seconds)

    assert last_error is not None
    raise last_error


def csv_fieldnames_for_state(state: dict[str, Any]) -> list[str]:
    discovered = state.get("assetFieldNames", [])
    ordered = [col for col in PREFERRED_COLUMNS if col in discovered or col in {"itemUrl", "photoUrl", "locationDisplay", "categoryDisplay"}]
    ordered.extend(
        col
        for col in discovered
        if col not in ordered
    )
    for derived in ["itemUrl", "photoUrl", "locationDisplay", "categoryDisplay"]:
        if derived not in ordered:
            ordered.append(derived)
    return ordered


def ensure_csv_writer(output_path: Path, fieldnames: list[str], append: bool) -> tuple[Any, csv.DictWriter]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not append or not output_path.exists() or output_path.stat().st_size == 0
    handle = output_path.open("a" if append else "w", newline="", encoding="utf-8")
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    if needs_header:
        writer.writeheader()
        handle.flush()
    return handle, writer


def rewrite_sorted_csv(output_path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def read_existing_rows(output_path: Path) -> list[dict[str, str]]:
    if not output_path.exists():
        return []
    with output_path.open("r", newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_metadata(metadata: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, ensure_ascii=True, sort_keys=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch current GovDeals listings into CSV with retry and resume support."
    )
    parser.add_argument(
        "-o",
        "--output",
        default="data/govdeals_listings.csv",
        help="Where to write the CSV file.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help="Listings requested per API page.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional cap for testing or partial exports.",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=0.15,
        help="Delay between page requests.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--timezone",
        default="America/Los_Angeles",
        help="Timezone sent to the GovDeals API.",
    )
    parser.add_argument(
        "--search",
        default=None,
        help="Optional keyword search string.",
    )
    parser.add_argument(
        "--sort-by",
        choices=["none", "end", "start", "bid", "title"],
        default="end",
        help="Client-side sort applied after fetching.",
    )
    parser.add_argument(
        "--metadata-output",
        default=None,
        help="Optional JSON path for API metadata. Defaults to <output>.meta.json.",
    )
    parser.add_argument(
        "--state-output",
        default=None,
        help="Optional JSON path for checkpoint state. Defaults to <output>.state.json.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help=(
            "Resume from an existing state file. Resume restarts at page 1, "
            "deduplicates by (accountId, assetId), and stops after several consecutive "
            "pages with no new rows."
        ),
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help="How many times to retry a failed page request.",
    )
    parser.add_argument(
        "--retry-backoff-seconds",
        type=float,
        default=DEFAULT_RETRY_BACKOFF,
        help="Base backoff in seconds for request retries.",
    )
    parser.add_argument(
        "--resume-overlap-pages",
        type=int,
        default=DEFAULT_RESUME_OVERLAP_PAGES,
        help=(
            "When resuming, stop after this many consecutive pages yield no new rows. "
            "This avoids relying on stale page numbers when results shift."
        ),
    )
    return parser.parse_args()


def run_export(args: argparse.Namespace) -> tuple[Path, Path, Path, dict[str, Any]]:
    output_path = Path(args.output)
    metadata_output = (
        Path(args.metadata_output)
        if args.metadata_output
        else output_path.with_suffix(output_path.suffix + ".meta.json")
    )
    state_output = (
        Path(args.state_output)
        if args.state_output
        else output_path.with_suffix(output_path.suffix + ".state.json")
    )

    if args.resume:
        state = load_state(state_output)
        if state is None:
            raise FileNotFoundError(f"No state file found at {state_output} to resume from.")
        args.page_size = int(state.get("pageSize", args.page_size))
        args.pause_seconds = float(state.get("pauseSeconds", args.pause_seconds))
        args.search = state.get("searchText") or None
        args.sort_by = state.get("sortBy", args.sort_by)
        args.max_pages = state.get("maxPages", args.max_pages)
        args.timeout = int(state.get("timeout", args.timeout))
        args.retries = int(state.get("retryCount", args.retries))
        args.retry_backoff_seconds = float(
            state.get("retryBackoffSeconds", args.retry_backoff_seconds)
        )
        args.resume_overlap_pages = int(
            state.get("resumeOverlapPages", args.resume_overlap_pages)
        )
        seen_keys = set(state.get("seenKeys", []))
        append = True
        print(
            f"Resuming from {state_output}. Existing rows tracked: {len(seen_keys)}. "
            "Restarting from page 1 and deduplicating against saved keys.",
            file=sys.stderr,
        )
    else:
        state = initial_state(args, output_path)
        seen_keys = set()
        append = False
        if output_path.exists():
            output_path.unlink()
        if metadata_output.exists():
            metadata_output.unlink()
        write_state(state_output, state)

    session = requests.Session()
    handle = None
    writer = None
    page = 1

    try:
        while True:
            result = fetch_page_with_retries(
                session=session,
                page=page,
                page_size=args.page_size,
                timeout=args.timeout,
                timezone_name=args.timezone,
                search_text=args.search,
                retries=args.retries,
                retry_backoff_seconds=args.retry_backoff_seconds,
            )

            update_state_from_payload(state, result.payload, result.total_count)
            if handle is None or writer is None:
                fieldnames = csv_fieldnames_for_state(state)
                handle, writer = ensure_csv_writer(output_path, fieldnames, append=append)
                append = True

            if not result.items:
                print(f"Fetched page {page}: 0 listings. Stopping.", file=sys.stderr)
                break

            new_rows: list[dict[str, str]] = []
            for item in result.items:
                key = listing_key(item)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                new_rows.append(normalize_item(item))

            if new_rows:
                writer.writerows(new_rows)
                handle.flush()
                state["consecutiveResumeOverlapPages"] = 0
            else:
                state["consecutiveResumeOverlapPages"] = state.get("consecutiveResumeOverlapPages", 0) + 1

            state["pagesFetched"] = state.get("pagesFetched", 0) + 1
            state["rowsWritten"] = len(seen_keys)
            state["lastPageFetched"] = page
            state["updatedAt"] = now_utc_iso()
            state["totalCount"] = result.total_count
            state["seenKeys"] = sorted(seen_keys)
            write_state(state_output, state)

            print(
                f"Fetched page {page}: {len(result.items)} listings, "
                f"{len(new_rows)} new, {len(seen_keys)} total saved "
                f"({result.total_count} reported live).",
                file=sys.stderr,
            )

            if len(result.items) < args.page_size:
                break
            if args.max_pages is not None and page >= args.max_pages:
                break
            if args.resume and state["consecutiveResumeOverlapPages"] >= args.resume_overlap_pages:
                print(
                    f"Resume overlap threshold reached after {state['consecutiveResumeOverlapPages']} "
                    "consecutive pages with no new rows. Stopping resume.",
                    file=sys.stderr,
                )
                break

            page += 1
            if args.pause_seconds > 0:
                time.sleep(args.pause_seconds)
    except Exception:
        state["status"] = "failed"
        state["updatedAt"] = now_utc_iso()
        write_state(state_output, state)
        raise
    finally:
        if handle is not None:
            handle.close()

    rows = read_existing_rows(output_path)
    rows = sort_rows(rows, args.sort_by)
    fieldnames = csv_fieldnames_for_state(state)
    rewrite_sorted_csv(output_path, rows, fieldnames)

    state["status"] = "completed"
    state["updatedAt"] = now_utc_iso()
    state["rowCountWritten"] = len(rows)
    state["seenKeys"] = sorted(seen_keys)
    write_state(state_output, state)

    metadata = {
        "apiUrl": state["apiUrl"],
        "pageUrl": state["pageUrl"],
        "businessId": state["businessId"],
        "searchText": state["searchText"],
        "totalCount": state["totalCount"],
        "rowCountWritten": len(rows),
        "responseTopLevelKeys": state["responseTopLevelKeys"],
        "assetFieldNames": state["assetFieldNames"],
        "assetSearchFacetsLength": state["assetSearchFacetsLength"],
        "assetSearchFacetsShortenedLength": state["assetSearchFacetsShortenedLength"],
        "isAPIFailureActive": state["isAPIFailureActive"],
        "easMsg": state["easMsg"],
        "sampleAsset": state["sampleAsset"],
        "sortBy": args.sort_by,
        "pageSize": args.page_size,
        "maxPages": args.max_pages,
        "pauseSeconds": args.pause_seconds,
        "resumeStrategy": (
            "Resume restarts from page 1, deduplicates by (accountId, assetId), "
            "and stops after consecutive pages with no new rows."
        ),
        "completedAt": now_utc_iso(),
    }
    write_metadata(metadata, metadata_output)
    return output_path, metadata_output, state_output, metadata


def main() -> int:
    args = parse_args()
    output_path, metadata_output, state_output, metadata = run_export(args)
    print(f"Wrote {metadata['rowCountWritten']} listings to {output_path}", file=sys.stderr)
    print(f"Wrote API metadata to {metadata_output}", file=sys.stderr)
    print(f"Wrote checkpoint state to {state_output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
