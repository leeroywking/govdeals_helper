import csv
import json
import os
import time
from pathlib import Path
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from psycopg import sql
from psycopg.rows import dict_row

from app.first_layer import DEFAULT_OUTPUT_DIR, run_first_layer


DATABASE_URL = os.environ["GOVDEALS_DATABASE_URL"]
CSV_PATH = Path(os.environ["GOVDEALS_CSV_PATH"])
META_PATH = Path(os.environ["GOVDEALS_META_PATH"])
STATE_PATH = Path(os.environ["GOVDEALS_STATE_PATH"])
RAW_TABLE = "govdeals_listings_raw"
TYPED_VIEW = "govdeals_listings"
LOAD_STATE_TABLE = "dataset_load_state"
MAX_ROWS_DEFAULT = 1000


TEXT_COLUMNS = {
    "assetShortDescription",
    "categoryDisplay",
    "categoryDescription",
    "companyName",
    "locationDisplay",
    "locationCity",
    "locationState",
    "stateDescription",
    "country",
    "countryDescription",
    "assetAuctionStartDateDisplay",
    "assetAuctionEndDateDisplay",
    "assetAuctionEndDateUtc",
    "assetAuctionStartDate",
    "assetAuctionEndDate",
    "timeRemaining",
    "currencyCode",
    "makebrand",
    "model",
    "modelYear",
    "lotNumber",
    "itemUrl",
    "photoUrl",
    "assetLongDescription",
    "assetRestrictionCode",
    "assetStatusCd",
    "businessId",
    "categoryRoutepath",
    "clickUrl",
    "commDesc",
    "displayEventId",
    "groupId",
    "inventoryId",
    "keywords",
    "locationAddress1",
    "locationAddress2",
    "locationZip",
    "photo",
    "termsAndConditions",
    "willNextBidMeetReserve",
}

INTEGER_COLUMNS = {
    "assetId",
    "accountId",
    "assetCategory",
    "bidCount",
    "auctionTypeId",
    "auctionId",
    "bidWatchId",
    "eventId",
    "highBidder",
    "locationId",
    "warehouseId",
}

NUMERIC_COLUMNS = {
    "currentBid",
    "assetBidPrice",
    "assetBidIncrement",
    "assetStrikePrice",
    "latitude",
    "longitude",
    "proximityDistance",
}

BOOLEAN_COLUMNS = {
    "isSoldAuction",
    "isNewAsset",
    "allowProbationBidders",
    "displaySellerName",
    "hasReservePrice",
    "isFreeAsset",
    "isReserveNotMet",
    "isReserveReduced",
    "denyProbBids",
}

TIMESTAMP_COLUMNS = {
    "assetAuctionStartDate",
    "assetAuctionEndDate",
    "assetAuctionEndDateUtc",
}


class QueryRequest(BaseModel):
    sql: str = Field(..., description="Raw SQL to execute against the local GovDeals database.")
    max_rows: int = Field(default=MAX_ROWS_DEFAULT, ge=1, le=10000)


class FirstLayerRequest(BaseModel):
    output_dir: str = Field(
        default=str(DEFAULT_OUTPUT_DIR),
        description="Directory where first-layer output files should be written.",
    )
    top_n: int = Field(default=500, ge=1, le=5000)


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def quote_identifier(name: str) -> sql.Identifier:
    return sql.Identifier(name)


def ensure_load_state_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {LOAD_STATE_TABLE} (
                dataset_name TEXT PRIMARY KEY,
                file_size BIGINT NOT NULL,
                file_mtime DOUBLE PRECISION NOT NULL,
                row_count BIGINT NOT NULL,
                loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    conn.commit()


def current_dataset_signature() -> dict[str, Any]:
    stat = CSV_PATH.stat()
    return {
        "dataset_name": CSV_PATH.name,
        "file_size": stat.st_size,
        "file_mtime": stat.st_mtime,
    }


def dataset_is_loaded(conn: psycopg.Connection) -> bool:
    signature = current_dataset_signature()
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT file_size, file_mtime
            FROM {LOAD_STATE_TABLE}
            WHERE dataset_name = %s
            """,
            (signature["dataset_name"],),
        )
        row = cur.fetchone()
    if not row:
        return False
    return (
        int(row["file_size"]) == int(signature["file_size"])
        and float(row["file_mtime"]) == float(signature["file_mtime"])
    )


def csv_headers() -> list[str]:
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        return next(csv.reader(handle))


def create_raw_table(conn: psycopg.Connection, headers: list[str]) -> None:
    column_defs = sql.SQL(", ").join(
        sql.SQL("{} TEXT").format(quote_identifier(header)) for header in headers
    )
    with conn.cursor() as cur:
        cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(quote_identifier(RAW_TABLE)))
        cur.execute(
            sql.SQL("CREATE TABLE {} ({})").format(
                quote_identifier(RAW_TABLE),
                column_defs,
            )
        )
    conn.commit()


def load_csv_into_raw_table(conn: psycopg.Connection, headers: list[str]) -> int:
    create_raw_table(conn, headers)
    copied_rows = 0
    copy_columns = sql.SQL(", ").join(quote_identifier(header) for header in headers)
    copy_stmt = sql.SQL(
        "COPY {} ({}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE)"
    ).format(quote_identifier(RAW_TABLE), copy_columns)
    with conn.cursor() as cur:
        with cur.copy(copy_stmt) as copy:
            with CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
                for line in handle:
                    copy.write(line)
        cur.execute(sql.SQL("SELECT COUNT(*) AS row_count FROM {}").format(quote_identifier(RAW_TABLE)))
        copied_rows = int(cur.fetchone()["row_count"])
    conn.commit()
    return copied_rows


def cast_expression(column: str) -> sql.Composed:
    identifier = quote_identifier(column)
    empty_as_null = sql.SQL("NULLIF({col}, '')").format(col=identifier)

    if column in INTEGER_COLUMNS:
        return sql.SQL("{expr}::BIGINT AS {alias}").format(
            expr=empty_as_null,
            alias=identifier,
        )
    if column in NUMERIC_COLUMNS:
        return sql.SQL("{expr}::DOUBLE PRECISION AS {alias}").format(
            expr=empty_as_null,
            alias=identifier,
        )
    if column in BOOLEAN_COLUMNS:
        return sql.SQL(
            """
            CASE
                WHEN LOWER(COALESCE({col}, '')) IN ('true', 't', '1', 'yes', 'y') THEN TRUE
                WHEN LOWER(COALESCE({col}, '')) IN ('false', 'f', '0', 'no', 'n') THEN FALSE
                ELSE NULL
            END AS {alias}
            """
        ).format(col=identifier, alias=identifier)
    if column in TIMESTAMP_COLUMNS:
        return sql.SQL("{expr}::TIMESTAMPTZ AS {alias}").format(
            expr=empty_as_null,
            alias=identifier,
        )
    return sql.SQL("{col} AS {alias}").format(col=identifier, alias=identifier)


def create_typed_view(conn: psycopg.Connection, headers: list[str]) -> None:
    select_list = sql.SQL(", ").join(cast_expression(header) for header in headers)
    view_stmt = sql.SQL(
        "CREATE OR REPLACE VIEW {} AS SELECT {} FROM {}"
    ).format(
        quote_identifier(TYPED_VIEW),
        select_list,
        quote_identifier(RAW_TABLE),
    )
    with conn.cursor() as cur:
        cur.execute(view_stmt)
    conn.commit()


def upsert_load_state(conn: psycopg.Connection, row_count: int) -> None:
    signature = current_dataset_signature()
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {LOAD_STATE_TABLE} (dataset_name, file_size, file_mtime, row_count, loaded_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (dataset_name)
            DO UPDATE SET
                file_size = EXCLUDED.file_size,
                file_mtime = EXCLUDED.file_mtime,
                row_count = EXCLUDED.row_count,
                loaded_at = NOW()
            """,
            (
                signature["dataset_name"],
                signature["file_size"],
                signature["file_mtime"],
                row_count,
            ),
        )
    conn.commit()


def ensure_dataset_loaded() -> dict[str, Any]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV file not found at {CSV_PATH}")

    with get_connection() as conn:
        ensure_load_state_table(conn)
        if dataset_is_loaded(conn):
            headers = csv_headers()
            create_typed_view(conn, headers)
            with conn.cursor() as cur:
                cur.execute(sql.SQL("SELECT COUNT(*) AS row_count FROM {}").format(quote_identifier(RAW_TABLE)))
                row_count = int(cur.fetchone()["row_count"])
            return {"loaded": False, "row_count": row_count}

        headers = csv_headers()
        row_count = load_csv_into_raw_table(conn, headers)
        create_typed_view(conn, headers)
        upsert_load_state(conn, row_count)
        return {"loaded": True, "row_count": row_count}


def read_json_if_present(path: Path) -> Any:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


app = FastAPI(title="GovDeals Local Query API", version="1.0.0")
APP_STATE: dict[str, Any] = {}

MARKET_BREAKDOWN_SQL = """
with classified as (
    select
        "currentBid",
        "locationState",
        lower(coalesce("categoryDescription", '')) as cat,
        lower(coalesce("assetShortDescription", '')) as title,
        case
            when (
                lower(coalesce("categoryDescription", '')) ~ '(heavy equipment|construction|mining|farming|tractor|excavator|dozer|bulldozer|loader|backhoe|skid steer|forklift|crane|paver|grader|compactor)'
                or lower(coalesce("assetShortDescription", '')) ~ '(tractor|excavator|dozer|bulldozer|loader|backhoe|skid steer|forklift|crane|paver|grader|compactor)'
            ) then true else false end as is_heavy_equipment,
        case
            when (
                lower(coalesce("categoryDescription", '')) ~ '(vehicle|car|truck|van|suv|motorcycle|sedan|pickup|automobile|bus|trailer|rv|utv|atv)'
                or lower(coalesce("assetShortDescription", '')) ~ '(vehicle|car|truck|van|suv|motorcycle|sedan|pickup|automobile|bus|trailer|rv|utv|atv)'
            ) then true else false end as is_vehicle
    from govdeals_listings
),
non_vehicle_non_heavy_over_1000 as (
    select count(*) as over_1000_not_vehicles_or_heavy_equipment
    from classified
    where coalesce("currentBid", 0) > 1000
      and not is_vehicle
      and not is_heavy_equipment
),
vehicle_counts as (
    select
        count(*) filter (where is_vehicle and coalesce("locationState", '') = 'WA') as wa_vehicles,
        count(*) filter (where is_vehicle and coalesce("locationState", '') <> 'WA') as outside_vehicles,
        count(*) filter (where is_vehicle) as total_vehicles
    from classified
),
heavy_counts as (
    select
        count(*) filter (where is_heavy_equipment and coalesce("locationState", '') = 'WA') as wa_heavy_equipment,
        count(*) filter (where is_heavy_equipment and coalesce("locationState", '') <> 'WA') as outside_heavy_equipment,
        count(*) filter (where is_heavy_equipment) as total_heavy_equipment
    from classified
),
total_count as (
    select count(*) as total_items from classified
)
select *
from total_count, non_vehicle_non_heavy_over_1000, vehicle_counts, heavy_counts
"""


@app.on_event("startup")
def startup_event() -> None:
    load_result = ensure_dataset_loaded()
    APP_STATE["load_result"] = load_result
    APP_STATE["metadata"] = read_json_if_present(META_PATH)
    APP_STATE["state"] = read_json_if_present(STATE_PATH)


@app.get("/health")
def health() -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            cur.fetchone()
    return {
        "ok": True,
        "database": "connected",
        "csvPath": str(CSV_PATH),
        "typedView": TYPED_VIEW,
        "rawTable": RAW_TABLE,
        "load": APP_STATE.get("load_result"),
    }


@app.get("/dataset")
def dataset() -> dict[str, Any]:
    return {
        "csvPath": str(CSV_PATH),
        "metadata": APP_STATE.get("metadata"),
        "state": APP_STATE.get("state"),
        "rawTable": RAW_TABLE,
        "typedView": TYPED_VIEW,
    }


@app.get("/summary/market-breakdown")
def market_breakdown() -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(MARKET_BREAKDOWN_SQL)
            row = cur.fetchone()
    return {
        "ok": True,
        "summary": row,
        "notes": [
            "Vehicle and heavy-equipment counts are heuristic classifications based on categoryDescription and assetShortDescription.",
            "Washington is identified by locationState = 'WA'.",
            "The over_1000_not_vehicles_or_heavy_equipment count uses currentBid > 1000.",
        ],
    }


@app.post("/analysis/run-first-layer")
def analysis_run_first_layer(request: FirstLayerRequest) -> dict[str, Any]:
    result = run_first_layer(
        database_url=DATABASE_URL,
        output_dir=Path(request.output_dir),
        top_n=request.top_n,
    )
    APP_STATE["first_layer_summary"] = result.summary
    return {
        "ok": True,
        "summary": result.summary,
        "outputFiles": result.output_files,
    }


@app.get("/summary/first-layer")
def first_layer_summary() -> dict[str, Any]:
    summary_path = DEFAULT_OUTPUT_DIR / "summary.json"
    summary = APP_STATE.get("first_layer_summary")
    if summary is None and summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if summary is None:
        raise HTTPException(status_code=404, detail="No first-layer run summary found.")
    return {
        "ok": True,
        "summary": summary,
    }


@app.post("/query")
def query(request: QueryRequest) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(request.sql)
                elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

                if cur.description:
                    rows = cur.fetchmany(request.max_rows + 1)
                    truncated = len(rows) > request.max_rows
                    if truncated:
                        rows = rows[: request.max_rows]
                    columns = [desc.name for desc in cur.description]
                    return {
                        "ok": True,
                        "columns": columns,
                        "rows": rows,
                        "rowCount": len(rows),
                        "truncated": truncated,
                        "elapsedMs": elapsed_ms,
                    }

                conn.commit()
                return {
                    "ok": True,
                    "command": cur.statusmessage,
                    "rowCount": cur.rowcount,
                    "elapsedMs": elapsed_ms,
                }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
