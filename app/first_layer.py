import csv
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RAW_TABLE = "govdeals_listings_raw"
DEFAULT_OUTPUT_DIR = Path("/workspace/data/first_layer")
HOME_ZIP = "98155"
HOME_LAT = 47.7568
HOME_LON = -122.3045


@dataclass
class FirstLayerResult:
    summary: dict[str, Any]
    output_files: dict[str, str]


CONSUMER_VEHICLE_RE = re.compile(
    r"\b(car|truck|pickup|suv|sedan|coupe|minivan|van|jeep|motorcycle|motorbike|automobile|convertible|wagon|crossover)\b",
    re.I,
)

HEAVY_EQUIPMENT_RE = re.compile(
    r"\b(heavy equipment|construction|mining|farming|tractor|excavator|dozer|bulldozer|loader|backhoe|skid steer|forklift|crane|paver|grader|compactor)\b",
    re.I,
)

HAZMAT_RE = re.compile(
    r"\b(hazmat|hazardous|flammable|corrosive|biohazard|asbestos|pcb|chemical waste|radioactive)\b",
    re.I,
)

FORKLIFT_REQUIRED_RE = re.compile(
    r"\b(forklift required|must be loaded with forklift|bring (a )?forklift|forklift needed|requires forklift)\b",
    re.I,
)

CHROMEBOOK_RE = re.compile(r"\bchromebook\b", re.I)
LAPTOP_RE = re.compile(r"\b(laptop|notebook|macbook)\b", re.I)
YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")

CONSUMER_ELECTRONICS_RE = re.compile(
    r"\b(tv|television|laptop|notebook|macbook|chromebook|monitor|tablet|ipad|iphone|android phone|smartphone|desktop computer|computer|pc|printer|scanner|projector|camera|camcorder|router|modem|speaker|gaming console|xbox|playstation|nintendo)\b",
    re.I,
)

BROKEN_ELECTRONICS_RE = re.compile(
    r"\b(broken|not working|does not work|for parts|parts only|won't power on|will not power on|cracked screen|broken screen|damaged screen|bad display)\b",
    re.I,
)

SCREEN_DAMAGE_RE = re.compile(
    r"\b(cracked screen|broken screen|damaged screen|bad display|screen damage|lcd damage)\b",
    re.I,
)

NON_RUNNING_RE = re.compile(
    r"\b(non[- ]running|does not run|not running|won't start|will not start|engine seized|no start)\b",
    re.I,
)

PALLET_LOT_RE = re.compile(r"\b(pallet|lot of|mixed lot|bulk lot|bulk)\b", re.I)
FITNESS_RE = re.compile(r"\b(fitness|exercise|treadmill|elliptical|weight machine|gym equipment)\b", re.I)
SPECIALTY_FORUM_RE = re.compile(
    r"\b(cnc|lathe|milling machine|welder|tractor|ham radio|oscilloscope|amplifier|pro audio|medical|dental|lab equipment)\b",
    re.I,
)


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def fetch_all_raw_rows_from_database(database_url: str) -> list[dict[str, Any]]:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(f'SELECT * FROM {RAW_TABLE}')
            return list(cur.fetchall())


def fetch_all_raw_rows_from_api(query_api_url: str) -> list[dict[str, Any]]:
    import requests

    rows: list[dict[str, Any]] = []
    offset = 0
    batch_size = 10000

    while True:
        sql = f'SELECT * FROM {RAW_TABLE} ORDER BY "accountId", "assetId" LIMIT {batch_size} OFFSET {offset}'
        response = requests.post(
            f"{query_api_url.rstrip('/')}/query",
            json={"sql": sql, "max_rows": batch_size},
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        batch = payload["rows"]
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size

    return rows


def normalize_text(value: Any) -> str:
    return str(value or "")


def parse_float(value: Any) -> float | None:
    text = normalize_text(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_bool(value: Any) -> bool | None:
    text = normalize_text(value).strip().lower()
    if text in {"true", "t", "1", "yes", "y"}:
        return True
    if text in {"false", "f", "0", "no", "n"}:
        return False
    return None


def parse_datetime(value: Any) -> datetime | None:
    text = normalize_text(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def combined_text(row: dict[str, Any]) -> str:
    return " ".join(
        [
            normalize_text(row.get("assetShortDescription")),
            normalize_text(row.get("categoryDescription")),
            normalize_text(row.get("assetLongDescription")),
            normalize_text(row.get("makebrand")),
            normalize_text(row.get("model")),
        ]
    ).lower()


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_miles = 3958.8
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius_miles * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def extract_weight_lbs(text: str) -> float | None:
    normalized = text.lower().replace(",", "")
    match = re.search(r"\b(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b", normalized)
    if match:
        return float(match.group(1))

    ton_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(ton|tons)\b", normalized)
    if ton_match:
        return float(ton_match.group(1)) * 2000

    return None


def years_in_text(text: str) -> list[int]:
    return [int(match.group(1)) for match in YEAR_RE.finditer(text)]


def current_year() -> int:
    return datetime.now(timezone.utc).year


def score_current_bid(current_bid: float | None) -> tuple[float, list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    if current_bid is None:
        negatives.append("missing current bid")
        return -5, positives, negatives
    if current_bid > 20000:
        negatives.append("current bid above 20k ceiling")
        return -100, positives, negatives
    if 750 <= current_bid <= 1500:
        positives.append("current bid near 1k sweet spot")
        return 14, positives, negatives
    if 500 <= current_bid < 750:
        positives.append("current bid below 1k but not ultra-competitive")
        return 8, positives, negatives
    if current_bid < 500:
        negatives.append("current bid in high-competition under-500 range")
        return -6, positives, negatives
    if current_bid <= 5000:
        positives.append("current bid still practical")
        return 4, positives, negatives
    negatives.append("high current bid")
    return -8, positives, negatives


def score_distance(distance_miles: float | None) -> tuple[float, list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    if distance_miles is None:
        negatives.append("missing location distance")
        return -2, positives, negatives
    if distance_miles <= 100:
        positives.append("within 100 miles")
        return 12, positives, negatives
    if distance_miles <= 300:
        positives.append("within day-trip range")
        return 7, positives, negatives
    if distance_miles <= 1000:
        return 2, positives, negatives
    negatives.append("far from Seattle area")
    return -6, positives, negatives


def score_handling(weight_lbs: float | None, requires_forklift: bool, heavy_equipment: bool, fitness_item: bool) -> tuple[float, list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    if requires_forklift:
        negatives.append("explicit forklift-required pickup")
        return -100, positives, negatives
    score = 0.0
    if weight_lbs is None:
        negatives.append("weight unknown")
        score -= 2
    elif weight_lbs <= 1600:
        positives.append("weight appears under 1600 lb")
        score += 10
    else:
        negatives.append("weight appears over 1600 lb")
        score -= 8

    if heavy_equipment and not fitness_item:
        negatives.append("heavy-equipment handling burden")
        score -= 18

    if fitness_item:
        positives.append("fitness equipment exemption")
        score += 4

    return score, positives, negatives


def score_flip_ease(text: str, brand_present: bool, model_present: bool, photo_present: bool, description_length: int, pallet_lot: bool, specialty_forum: bool) -> tuple[float, list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    score = 0.0

    if brand_present:
        positives.append("brand present")
        score += 6
    else:
        negatives.append("missing brand")
        score -= 2

    if model_present:
        positives.append("model present")
        score += 6
    else:
        negatives.append("missing model")
        score -= 2

    if photo_present:
        positives.append("photo present")
        score += 5
    else:
        negatives.append("missing photo")
        score -= 6

    if description_length >= 250:
        positives.append("detailed description")
        score += 5
    elif description_length < 60:
        negatives.append("short description")
        score -= 4

    if pallet_lot:
        positives.append("lot-style inventory may hide value")
        score += 2

    if specialty_forum:
        positives.append("possible specialty resale channel")
        score += 1

    return score, positives, negatives


def score_condition(text: str, consumer_electronics: bool, screen_damage: bool) -> tuple[float, list[str], list[str], str | None]:
    positives: list[str] = []
    negatives: list[str] = []

    if consumer_electronics and screen_damage:
        return -100, positives, ["consumer electronics with screen damage"], "consumer electronics with screen damage"

    if consumer_electronics and BROKEN_ELECTRONICS_RE.search(text):
        return -100, positives, ["broken consumer electronics"], "broken consumer electronics"

    score = 0.0
    if not consumer_electronics and screen_damage:
        positives.append("non-electronic screen damage may be fixable")
        score += 3

    if re.search(r"\b(untested|as is|unknown condition)\b", text):
        negatives.append("condition uncertain")
        score -= 2

    return score, positives, negatives, None


def score_timing(end_dt: datetime | None) -> tuple[float, list[str], list[str], float | None]:
    positives: list[str] = []
    negatives: list[str] = []
    if end_dt is None:
        negatives.append("missing end time")
        return -1, positives, negatives, None
    hours_to_end = (end_dt - datetime.now(timezone.utc)).total_seconds() / 3600
    if hours_to_end <= 0:
        positives.append("ending immediately")
        return 6, positives, negatives, hours_to_end
    if hours_to_end <= 24:
        positives.append("ending within 24h")
        return 10, positives, negatives, hours_to_end
    if hours_to_end <= 72:
        positives.append("ending within 3 days")
        return 7, positives, negatives, hours_to_end
    if hours_to_end <= 168:
        positives.append("ending within 7 days")
        return 4, positives, negatives, hours_to_end
    return 0, positives, negatives, hours_to_end


def compute_row(row: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    text = combined_text(row)
    title = normalize_text(row.get("assetShortDescription"))
    category = normalize_text(row.get("categoryDescription"))
    current_bid = parse_float(row.get("currentBid"))
    latitude = parse_float(row.get("latitude"))
    longitude = parse_float(row.get("longitude"))
    end_dt = parse_datetime(row.get("assetAuctionEndDateUtc"))
    photo_present = bool(normalize_text(row.get("photoUrl")) or normalize_text(row.get("photo")))
    brand_present = bool(normalize_text(row.get("makebrand")).strip())
    model_present = bool(normalize_text(row.get("model")).strip())
    description_length = len(normalize_text(row.get("assetLongDescription")).strip())
    fitness_item = bool(FITNESS_RE.search(text))
    specialty_forum = bool(SPECIALTY_FORUM_RE.search(text))
    pallet_lot = bool(PALLET_LOT_RE.search(text))
    requires_forklift = bool(FORKLIFT_REQUIRED_RE.search(text))
    consumer_electronics = bool(CONSUMER_ELECTRONICS_RE.search(text))
    screen_damage = bool(SCREEN_DAMAGE_RE.search(text))
    is_consumer_vehicle = bool(CONSUMER_VEHICLE_RE.search(text))
    is_heavy_equipment = bool(HEAVY_EQUIPMENT_RE.search(text))
    years_found = years_in_text(text)
    newest_year = max(years_found) if years_found else None
    weight_lbs = extract_weight_lbs(text)

    distance_miles = None
    if latitude is not None and longitude is not None:
        distance_miles = round(haversine_miles(HOME_LAT, HOME_LON, latitude, longitude), 1)

    exclusion_reasons: list[str] = []
    if HAZMAT_RE.search(text):
        exclusion_reasons.append("hazmat")
    if CHROMEBOOK_RE.search(text):
        exclusion_reasons.append("chromebook")
    if requires_forklift:
        exclusion_reasons.append("forklift required")
    if is_consumer_vehicle and NON_RUNNING_RE.search(text):
        exclusion_reasons.append("explicit non-running consumer vehicle")
    if LAPTOP_RE.search(text) and newest_year is not None and newest_year < 2020:
        exclusion_reasons.append("pre-2020 laptop")

    condition_score, condition_pos, condition_neg, condition_exclusion = score_condition(
        text=text,
        consumer_electronics=consumer_electronics,
        screen_damage=screen_damage,
    )
    if condition_exclusion:
        exclusion_reasons.append(condition_exclusion)

    bid_score, bid_pos, bid_neg = score_current_bid(current_bid)
    distance_score, distance_pos, distance_neg = score_distance(distance_miles)
    handling_score, handling_pos, handling_neg = score_handling(
        weight_lbs=weight_lbs,
        requires_forklift=requires_forklift,
        heavy_equipment=is_heavy_equipment,
        fitness_item=fitness_item,
    )
    flip_score, flip_pos, flip_neg = score_flip_ease(
        text=text,
        brand_present=brand_present,
        model_present=model_present,
        photo_present=photo_present,
        description_length=description_length,
        pallet_lot=pallet_lot,
        specialty_forum=specialty_forum,
    )
    timing_score, timing_pos, timing_neg, hours_to_end = score_timing(end_dt)

    comp_confidence_score = 0.0
    profit_score = 0.0
    estimated_resale_value = None
    estimated_profit = None

    positive_reasons = bid_pos + distance_pos + handling_pos + flip_pos + condition_pos + timing_pos
    negative_reasons = bid_neg + distance_neg + handling_neg + flip_neg + condition_neg + timing_neg

    total_score = (
        bid_score
        + distance_score
        + handling_score
        + flip_score
        + condition_score
        + timing_score
        + comp_confidence_score
        + profit_score
    )

    computed = {
        **row,
        "distance_miles": distance_miles,
        "weight_lbs": weight_lbs,
        "weight_known": weight_lbs is not None,
        "requires_forklift_flag": requires_forklift,
        "consumer_vehicle_flag": is_consumer_vehicle,
        "heavy_equipment_flag": is_heavy_equipment,
        "specialty_forum_flag": specialty_forum,
        "photo_present_flag": photo_present,
        "description_length": description_length,
        "brand_present_flag": brand_present,
        "model_present_flag": model_present,
        "screen_damage_flag": screen_damage,
        "consumer_electronics_flag": consumer_electronics,
        "pallet_lot_flag": pallet_lot,
        "fitness_equipment_flag": fitness_item,
        "exact_comp_count_30d": None,
        "exact_comp_count_365d": None,
        "exact_comp_median_30d": None,
        "exact_comp_median_365d": None,
        "comp_source_confidence": "unavailable_in_first_pass",
        "estimated_resale_value": estimated_resale_value,
        "estimated_profit": estimated_profit,
        "profit_score": profit_score,
        "flip_ease_score": round(flip_score, 2),
        "distance_score": round(distance_score, 2),
        "handling_score": round(handling_score, 2),
        "comp_confidence_score": round(comp_confidence_score, 2),
        "condition_score": round(condition_score, 2),
        "timing_score": round(timing_score, 2),
        "bid_desirability_score": round(bid_score, 2),
        "hours_to_end": round(hours_to_end, 2) if hours_to_end is not None else None,
        "total_score": round(total_score, 2),
        "score_reasons_positive": " | ".join(dict.fromkeys(positive_reasons)),
        "score_reasons_negative": " | ".join(dict.fromkeys(negative_reasons + exclusion_reasons)),
        "first_layer_status": "excluded" if exclusion_reasons else ("consumer_vehicle" if is_consumer_vehicle else "main_candidate"),
        "exclusion_reason": " | ".join(dict.fromkeys(exclusion_reasons)),
    }
    return computed["first_layer_status"], computed


def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(row: dict[str, Any]) -> tuple:
        return (
            -(row.get("total_score") or 0),
            (row.get("hours_to_end") if row.get("hours_to_end") is not None else 10**9),
            -(row.get("currentBid") and float(row["currentBid"]) or 0),
        )

    return sorted(rows, key=key)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def run_first_layer(
    database_url: str | None = None,
    output_dir: Path | None = None,
    top_n: int = 500,
    query_api_url: str | None = None,
) -> FirstLayerResult:
    output_dir = output_dir or DEFAULT_OUTPUT_DIR
    if database_url:
        rows = fetch_all_raw_rows_from_database(database_url)
    elif query_api_url:
        rows = fetch_all_raw_rows_from_api(query_api_url)
    else:
        raise ValueError("Either database_url or query_api_url must be provided.")

    main_candidates: list[dict[str, Any]] = []
    consumer_vehicles: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []

    for row in rows:
        status, computed = compute_row(row)
        if status == "excluded":
            excluded.append(computed)
        elif status == "consumer_vehicle":
            consumer_vehicles.append(computed)
        else:
            main_candidates.append(computed)

    main_candidates = sort_rows(main_candidates)
    consumer_vehicles = sort_rows(consumer_vehicles)
    excluded = sort_rows(excluded)

    top_candidates = main_candidates[:top_n]

    output_files = {
        "main_candidates": str(output_dir / "main_candidates.csv"),
        "main_candidates_top": str(output_dir / f"main_candidates_top_{top_n}.csv"),
        "consumer_vehicles": str(output_dir / "consumer_vehicles.csv"),
        "excluded_items": str(output_dir / "excluded_items.csv"),
        "summary": str(output_dir / "summary.json"),
    }

    write_csv(Path(output_files["main_candidates"]), main_candidates)
    write_csv(Path(output_files["main_candidates_top"]), top_candidates)
    write_csv(Path(output_files["consumer_vehicles"]), consumer_vehicles)
    write_csv(Path(output_files["excluded_items"]), excluded)

    summary = {
        "generatedAt": now_utc_iso(),
        "homeZip": HOME_ZIP,
        "homeLatitude": HOME_LAT,
        "homeLongitude": HOME_LON,
        "inputRowCount": len(rows),
        "mainCandidateCount": len(main_candidates),
        "consumerVehicleCount": len(consumer_vehicles),
        "excludedCount": len(excluded),
        "topCandidateCount": len(top_candidates),
        "notes": [
            "This is a first-pass programmatic filter only.",
            "Comp-based resale and profit fields are placeholders in this pass and require later enrichment.",
            "Vehicle and heavy-equipment classification is heuristic and regex-based.",
            "Distance is computed from ZIP 98155 using listing latitude/longitude when available.",
        ],
        "outputFiles": output_files,
    }

    Path(output_files["summary"]).write_text(
        json.dumps(summary, indent=2, ensure_ascii=True, sort_keys=True),
        encoding="utf-8",
    )

    return FirstLayerResult(summary=summary, output_files=output_files)
