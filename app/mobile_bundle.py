import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.first_layer import now_utc_iso


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIRST_LAYER_INPUT_DIR = REPO_ROOT / "data" / "first_layer"
DEFAULT_MOBILE_DATA_DIR = REPO_ROOT / "mobile" / "www" / "data"

SOURCE_FILES = {
    "mainCandidates": "main_candidates.csv",
    "consumerVehicles": "consumer_vehicles.csv",
    "excludedItems": "excluded_items.csv",
}


@dataclass
class MobileBundleResult:
    manifest: dict[str, Any]
    output_files: dict[str, str]


def split_reasons(value: Any) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [part.strip() for part in text.split("|") if part.strip()]


def parse_float(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_bool(value: Any) -> bool:
    return str(value or "").strip().lower() in {"true", "t", "1", "yes", "y"}


def item_key(row: dict[str, Any]) -> str:
    return f'{row.get("accountId", "")}:{row.get("assetId", "")}'


def collect_flags(row: dict[str, Any]) -> list[str]:
    flag_map = {
        "consumer_vehicle_flag": "consumer-vehicle",
        "heavy_equipment_flag": "heavy-equipment",
        "specialty_forum_flag": "specialty-forum",
        "requires_forklift_flag": "forklift-required",
        "screen_damage_flag": "screen-damage",
        "consumer_electronics_flag": "consumer-electronics",
        "pallet_lot_flag": "pallet-lot",
        "fitness_equipment_flag": "fitness-equipment",
        "weight_known": "weight-known",
    }
    flags = [label for field, label in flag_map.items() if parse_bool(row.get(field))]
    if parse_bool(row.get("photo_present_flag")):
        flags.append("photo-present")
    if parse_bool(row.get("brand_present_flag")):
        flags.append("brand-present")
    if parse_bool(row.get("model_present_flag")):
        flags.append("model-present")
    return flags


def compact_item(row: dict[str, Any], bucket: str) -> dict[str, Any]:
    return {
        "id": item_key(row),
        "assetId": row.get("assetId", ""),
        "accountId": row.get("accountId", ""),
        "bucket": bucket,
        "status": row.get("first_layer_status", ""),
        "title": row.get("assetShortDescription", ""),
        "category": row.get("categoryDisplay") or row.get("categoryDescription") or "",
        "company": row.get("companyName", ""),
        "location": row.get("locationDisplay", ""),
        "state": row.get("locationState", ""),
        "zip": row.get("locationZip", ""),
        "currentBid": parse_float(row.get("currentBid")),
        "currencyCode": row.get("currencyCode", "USD"),
        "bidCount": parse_float(row.get("bidCount")),
        "distanceMiles": parse_float(row.get("distance_miles")),
        "weightLbs": parse_float(row.get("weight_lbs")),
        "weightKnown": parse_bool(row.get("weight_known")),
        "auctionEndUtc": row.get("assetAuctionEndDateUtc", ""),
        "auctionEndDisplay": row.get("assetAuctionEndDateDisplay", ""),
        "timeRemaining": row.get("timeRemaining", ""),
        "hoursToEnd": parse_float(row.get("hours_to_end")),
        "score": parse_float(row.get("total_score")),
        "brand": row.get("makebrand", ""),
        "model": row.get("model", ""),
        "modelYear": row.get("modelYear", ""),
        "itemUrl": row.get("itemUrl", ""),
        "photoUrl": row.get("photoUrl", ""),
        "longDescription": row.get("assetLongDescription", ""),
        "positiveReasons": split_reasons(row.get("score_reasons_positive")),
        "negativeReasons": split_reasons(row.get("score_reasons_negative")),
        "exclusionReason": row.get("exclusion_reason", ""),
        "flags": collect_flags(row),
    }


def read_rows(path: Path, bucket: str) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [compact_item(row, bucket) for row in reader]


def build_mobile_bundle(
    input_dir: Path = DEFAULT_FIRST_LAYER_INPUT_DIR,
    output_dir: Path = DEFAULT_MOBILE_DATA_DIR,
) -> MobileBundleResult:
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    output_files: dict[str, str] = {}

    for bucket, filename in SOURCE_FILES.items():
        source_path = input_dir / filename
        if not source_path.exists():
            raise FileNotFoundError(f"Missing first-layer source file: {source_path}")
        rows = read_rows(source_path, bucket)
        counts[bucket] = len(rows)
        target_path = output_dir / f"{bucket}.json"
        with target_path.open("w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=2)
            handle.write("\n")
        output_files[bucket] = str(target_path)

    manifest = {
        "generatedAt": now_utc_iso(),
        "sourceDirectory": str(input_dir),
        "counts": counts,
        "datasets": {
            bucket: {
                "path": f"data/{bucket}.json",
                "count": counts[bucket],
            }
            for bucket in SOURCE_FILES
        },
    }

    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    output_files["manifest"] = str(manifest_path)

    return MobileBundleResult(manifest=manifest, output_files=output_files)


if __name__ == "__main__":
    result = build_mobile_bundle()
    print(json.dumps({"ok": True, "manifest": result.manifest, "outputFiles": result.output_files}, indent=2))
