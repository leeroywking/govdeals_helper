import csv

from app.mobile_bundle import build_mobile_bundle


FIELDNAMES = [
    "assetId",
    "accountId",
    "assetShortDescription",
    "categoryDisplay",
    "categoryDescription",
    "companyName",
    "locationDisplay",
    "locationState",
    "locationZip",
    "currentBid",
    "currencyCode",
    "bidCount",
    "distance_miles",
    "weight_lbs",
    "weight_known",
    "assetAuctionEndDateUtc",
    "assetAuctionEndDateDisplay",
    "timeRemaining",
    "hours_to_end",
    "total_score",
    "makebrand",
    "model",
    "modelYear",
    "itemUrl",
    "photoUrl",
    "assetLongDescription",
    "score_reasons_positive",
    "score_reasons_negative",
    "exclusion_reason",
    "first_layer_status",
    "consumer_vehicle_flag",
    "heavy_equipment_flag",
    "specialty_forum_flag",
    "requires_forklift_flag",
    "screen_damage_flag",
    "consumer_electronics_flag",
    "pallet_lot_flag",
    "fitness_equipment_flag",
    "photo_present_flag",
    "brand_present_flag",
    "model_present_flag",
]


def write_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def make_row(asset_id, account_id, status):
    return {
        "assetId": asset_id,
        "accountId": account_id,
        "assetShortDescription": f"Item {asset_id}",
        "categoryDisplay": "Category",
        "categoryDescription": "Category",
        "companyName": "Seller",
        "locationDisplay": "Seattle, Washington, United States",
        "locationState": "WA",
        "locationZip": "98101",
        "currentBid": "1250",
        "currencyCode": "USD",
        "bidCount": "3",
        "distance_miles": "12.5",
        "weight_lbs": "900",
        "weight_known": "true",
        "assetAuctionEndDateUtc": "2099-01-01T12:00:00Z",
        "assetAuctionEndDateDisplay": "Jan 1, 2099",
        "timeRemaining": "100 days",
        "hours_to_end": "2400",
        "total_score": "55",
        "makebrand": "Brand",
        "model": "Model",
        "modelYear": "2022",
        "itemUrl": f"https://example.com/{asset_id}",
        "photoUrl": f"https://example.com/{asset_id}.jpg",
        "assetLongDescription": "Detailed description",
        "score_reasons_positive": "brand present | photo present",
        "score_reasons_negative": "weight unknown",
        "exclusion_reason": "" if status != "excluded" else "hazmat",
        "first_layer_status": status,
        "consumer_vehicle_flag": "true" if status == "consumer_vehicle" else "false",
        "heavy_equipment_flag": "false",
        "specialty_forum_flag": "false",
        "requires_forklift_flag": "false",
        "screen_damage_flag": "false",
        "consumer_electronics_flag": "false",
        "pallet_lot_flag": "false",
        "fitness_equipment_flag": "false",
        "photo_present_flag": "true",
        "brand_present_flag": "true",
        "model_present_flag": "true",
    }


def test_build_mobile_bundle_writes_expected_json(tmp_path):
    input_dir = tmp_path / "first_layer"
    output_dir = tmp_path / "mobile"
    input_dir.mkdir()

    write_csv(input_dir / "main_candidates.csv", [make_row("1", "10", "main_candidate")])
    write_csv(input_dir / "consumer_vehicles.csv", [make_row("2", "20", "consumer_vehicle")])
    write_csv(input_dir / "excluded_items.csv", [make_row("3", "30", "excluded")])

    result = build_mobile_bundle(input_dir=input_dir, output_dir=output_dir)

    assert result.manifest["counts"]["mainCandidates"] == 1
    assert result.manifest["counts"]["consumerVehicles"] == 1
    assert result.manifest["counts"]["excludedItems"] == 1
    assert (output_dir / "mainCandidates.json").exists()
    assert (output_dir / "consumerVehicles.json").exists()
    assert (output_dir / "excludedItems.json").exists()
    assert (output_dir / "manifest.json").exists()


def test_build_mobile_bundle_compacts_flags_and_reasons(tmp_path):
    input_dir = tmp_path / "first_layer"
    output_dir = tmp_path / "mobile"
    input_dir.mkdir()

    row = make_row("5", "50", "main_candidate")
    row["specialty_forum_flag"] = "true"
    row["pallet_lot_flag"] = "true"
    row["score_reasons_positive"] = "brand present | photo present | model present"
    write_csv(input_dir / "main_candidates.csv", [row])
    write_csv(input_dir / "consumer_vehicles.csv", [])
    write_csv(input_dir / "excluded_items.csv", [])

    result = build_mobile_bundle(input_dir=input_dir, output_dir=output_dir)
    dataset_path = output_dir / "mainCandidates.json"
    payload = dataset_path.read_text(encoding="utf-8")

    assert "specialty-forum" in payload
    assert "pallet-lot" in payload
    assert "brand present" in payload
    assert result.manifest["datasets"]["mainCandidates"]["count"] == 1
