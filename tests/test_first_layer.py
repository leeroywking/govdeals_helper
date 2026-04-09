from app.first_layer import compute_row


def make_row(**overrides):
    row = {
        "assetId": "100",
        "accountId": "200",
        "assetShortDescription": "Leica total station with case",
        "categoryDescription": "Survey Equipment",
        "assetLongDescription": "Detailed description with accessories included and tested.",
        "makebrand": "Leica",
        "model": "TS15",
        "currentBid": "1100",
        "latitude": "47.61",
        "longitude": "-122.33",
        "assetAuctionEndDateUtc": "2099-01-01T12:00:00Z",
        "photoUrl": "https://example.com/photo.jpg",
        "photo": "sample/photo.jpg",
        "locationCity": "Seattle",
        "stateDescription": "Washington",
        "locationState": "WA",
        "countryDescription": "United States",
        "locationZip": "98101",
        "currencyCode": "USD",
    }
    row.update(overrides)
    return row


def test_compute_row_scores_main_candidate_with_positive_signals():
    status, computed = compute_row(make_row())
    assert status == "main_candidate"
    assert computed["first_layer_status"] == "main_candidate"
    assert computed["total_score"] > 0
    assert "brand present" in computed["score_reasons_positive"]
    assert computed["consumer_vehicle_flag"] is False


def test_compute_row_excludes_pre_2020_laptop():
    status, computed = compute_row(
        make_row(
            assetShortDescription="Dell Latitude laptop 2018",
            categoryDescription="Electronics",
            assetLongDescription="Business laptop from 2018 in used condition.",
            makebrand="Dell",
            model="Latitude",
        )
    )
    assert status == "excluded"
    assert "pre-2020 laptop" in computed["exclusion_reason"]


def test_compute_row_excludes_consumer_electronics_with_screen_damage():
    status, computed = compute_row(
        make_row(
            assetShortDescription="Samsung TV with broken screen",
            categoryDescription="Electronics",
            assetLongDescription="Television with cracked screen damage.",
            makebrand="Samsung",
            model="QLED",
        )
    )
    assert status == "excluded"
    assert "consumer electronics with screen damage" in computed["exclusion_reason"]


def test_compute_row_keeps_non_electronic_screen_damage_item():
    status, computed = compute_row(
        make_row(
            assetShortDescription="Kubota tractor display issue",
            categoryDescription="Farm Equipment",
            assetLongDescription="Tractor runs, broken screen on dash display, 1800 lb.",
            makebrand="Kubota",
            model="L2501",
            currentBid="1400",
        )
    )
    assert status == "main_candidate"
    assert computed["screen_damage_flag"] is True
    assert "non-electronic screen damage may be fixable" in computed["score_reasons_positive"]


def test_compute_row_routes_consumer_vehicle_without_non_running_flag():
    status, computed = compute_row(
        make_row(
            assetShortDescription="2014 Ford F-150 pickup truck",
            categoryDescription="Vehicles",
            assetLongDescription="Pickup truck with title paperwork included.",
            makebrand="Ford",
            model="F-150",
        )
    )
    assert status == "consumer_vehicle"
    assert computed["consumer_vehicle_flag"] is True
    assert computed["first_layer_status"] == "consumer_vehicle"
