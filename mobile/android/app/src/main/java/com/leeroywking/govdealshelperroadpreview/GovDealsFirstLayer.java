package com.leeroywking.govdealshelperroadpreview;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GovDealsFirstLayer {
    private static final double HOME_LAT = 47.7568;
    private static final double HOME_LON = -122.3045;

    private static final Pattern CONSUMER_VEHICLE_RE = Pattern.compile("\\b(car|truck|pickup|suv|sedan|coupe|minivan|van|jeep|motorcycle|motorbike|automobile|convertible|wagon|crossover)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEAVY_EQUIPMENT_RE = Pattern.compile("\\b(heavy equipment|construction|mining|farming|tractor|excavator|dozer|bulldozer|loader|backhoe|skid steer|forklift|crane|paver|grader|compactor)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern HAZMAT_RE = Pattern.compile("\\b(hazmat|hazardous|flammable|corrosive|biohazard|asbestos|pcb|chemical waste|radioactive)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern FORKLIFT_REQUIRED_RE = Pattern.compile("\\b(forklift required|must be loaded with forklift|bring (a )?forklift|forklift needed|requires forklift)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CHROMEBOOK_RE = Pattern.compile("\\bchromebook\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LAPTOP_RE = Pattern.compile("\\b(laptop|notebook|macbook)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern YEAR_RE = Pattern.compile("\\b(19\\d{2}|20\\d{2})\\b");
    private static final Pattern CONSUMER_ELECTRONICS_RE = Pattern.compile("\\b(tv|television|laptop|notebook|macbook|chromebook|monitor|tablet|ipad|iphone|android phone|smartphone|desktop computer|computer|pc|printer|scanner|projector|camera|camcorder|router|modem|speaker|gaming console|xbox|playstation|nintendo)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern BROKEN_ELECTRONICS_RE = Pattern.compile("\\b(broken|not working|does not work|for parts|parts only|won't power on|will not power on|cracked screen|broken screen|damaged screen|bad display)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCREEN_DAMAGE_RE = Pattern.compile("\\b(cracked screen|broken screen|damaged screen|bad display|screen damage|lcd damage)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_RUNNING_RE = Pattern.compile("\\b(non[- ]running|does not run|not running|won't start|will not start|engine seized|no start)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PALLET_LOT_RE = Pattern.compile("\\b(pallet|lot of|mixed lot|bulk lot|bulk)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern FITNESS_RE = Pattern.compile("\\b(fitness|exercise|treadmill|elliptical|weight machine|gym equipment)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPECIALTY_FORUM_RE = Pattern.compile("\\b(cnc|lathe|milling machine|welder|tractor|ham radio|oscilloscope|amplifier|pro audio|medical|dental|lab equipment)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern WEIGHT_LBS_RE = Pattern.compile("\\b(\\d+(?:\\.\\d+)?)\\s*(lb|lbs|pound|pounds)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern WEIGHT_TON_RE = Pattern.compile("\\b(\\d+(?:\\.\\d+)?)\\s*(ton|tons)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNCERTAIN_CONDITION_RE = Pattern.compile("\\b(untested|as is|unknown condition)\\b", Pattern.CASE_INSENSITIVE);

    private GovDealsFirstLayer() {}

    public static JSONObject buildBundle(JSONArray rawItems) throws JSONException {
        List<JSONObject> mainCandidates = new ArrayList<>();
        List<JSONObject> vehicles = new ArrayList<>();
        List<JSONObject> excluded = new ArrayList<>();

        for (int i = 0; i < rawItems.length(); i++) {
            JSONObject raw = rawItems.getJSONObject(i);
            ComputedRow computed = computeRow(raw);
            if ("excluded".equals(computed.status)) {
                excluded.add(computed.row);
            } else if ("consumer_vehicle".equals(computed.status)) {
                vehicles.add(computed.row);
            } else {
                mainCandidates.add(computed.row);
            }
        }

        Comparator<JSONObject> comparator = (left, right) -> {
            int scoreCompare = Double.compare(optDouble(right, "score"), optDouble(left, "score"));
            if (scoreCompare != 0) return scoreCompare;
            int timeCompare = Double.compare(optDouble(left, "hoursToEnd", Double.MAX_VALUE), optDouble(right, "hoursToEnd", Double.MAX_VALUE));
            if (timeCompare != 0) return timeCompare;
            return Double.compare(optDouble(right, "currentBid"), optDouble(left, "currentBid"));
        };

        Collections.sort(mainCandidates, comparator);
        Collections.sort(vehicles, comparator);
        Collections.sort(excluded, comparator);

        JSONObject manifest = new JSONObject();
        manifest.put("generatedAt", isoNow());
        manifest.put("sourceDirectory", "android-native-refresh");
        JSONObject counts = new JSONObject();
        counts.put("mainCandidates", mainCandidates.size());
        counts.put("consumerVehicles", vehicles.size());
        counts.put("excludedItems", excluded.size());
        manifest.put("counts", counts);

        JSONObject datasets = new JSONObject();
        datasets.put("mainCandidates", jsonArrayOf(mainCandidates));
        datasets.put("consumerVehicles", jsonArrayOf(vehicles));
        datasets.put("excludedItems", jsonArrayOf(excluded));

        JSONObject bundle = new JSONObject();
        bundle.put("manifest", manifest);
        bundle.put("datasets", datasets);
        return bundle;
    }

    private static JSONArray jsonArrayOf(List<JSONObject> values) {
        JSONArray array = new JSONArray();
        for (JSONObject value : values) {
            array.put(value);
        }
        return array;
    }

    private static ComputedRow computeRow(JSONObject row) throws JSONException {
        String text = combinedText(row).toLowerCase(Locale.US);
        double currentBid = parseDouble(row.opt("currentBid"), Double.NaN);
        double latitude = parseDouble(row.opt("latitude"), Double.NaN);
        double longitude = parseDouble(row.opt("longitude"), Double.NaN);
        String photoUrl = photoUrl(row);
        boolean photoPresent = !photoUrl.isEmpty() || !normalize(row.opt("photo")).isEmpty();
        boolean brandPresent = !normalize(row.opt("makebrand")).trim().isEmpty();
        boolean modelPresent = !normalize(row.opt("model")).trim().isEmpty();
        int descriptionLength = normalize(row.opt("assetLongDescription")).trim().length();
        boolean fitnessItem = FITNESS_RE.matcher(text).find();
        boolean specialtyForum = SPECIALTY_FORUM_RE.matcher(text).find();
        boolean palletLot = PALLET_LOT_RE.matcher(text).find();
        boolean requiresForklift = FORKLIFT_REQUIRED_RE.matcher(text).find();
        boolean consumerElectronics = CONSUMER_ELECTRONICS_RE.matcher(text).find();
        boolean screenDamage = SCREEN_DAMAGE_RE.matcher(text).find();
        boolean consumerVehicle = CONSUMER_VEHICLE_RE.matcher(text).find();
        boolean heavyEquipment = HEAVY_EQUIPMENT_RE.matcher(text).find();
        Integer newestYear = newestYear(text);
        Double weightLbs = extractWeightLbs(text);
        Double distanceMiles = null;
        if (!Double.isNaN(latitude) && !Double.isNaN(longitude)) {
            distanceMiles = Math.round(haversineMiles(HOME_LAT, HOME_LON, latitude, longitude) * 10.0) / 10.0;
        }
        Double hoursToEnd = hoursToEnd(normalize(row.opt("assetAuctionEndDateUtc")));

        List<String> exclusionReasons = new ArrayList<>();
        if (HAZMAT_RE.matcher(text).find()) exclusionReasons.add("hazmat");
        if (CHROMEBOOK_RE.matcher(text).find()) exclusionReasons.add("chromebook");
        if (requiresForklift) exclusionReasons.add("forklift required");
        if (consumerVehicle && NON_RUNNING_RE.matcher(text).find()) exclusionReasons.add("explicit non-running consumer vehicle");
        if (LAPTOP_RE.matcher(text).find() && newestYear != null && newestYear < 2020) exclusionReasons.add("pre-2020 laptop");

        ScoreResult bidScore = scoreCurrentBid(currentBid);
        ScoreResult distanceScore = scoreDistance(distanceMiles);
        ScoreResult handlingScore = scoreHandling(weightLbs, requiresForklift, heavyEquipment, fitnessItem);
        ScoreResult flipScore = scoreFlipEase(brandPresent, modelPresent, photoPresent, descriptionLength, palletLot, specialtyForum);
        ConditionScore conditionScore = scoreCondition(text, consumerElectronics, screenDamage);
        if (conditionScore.exclusionReason != null) exclusionReasons.add(conditionScore.exclusionReason);
        TimingScore timingScore = scoreTiming(hoursToEnd);

        double totalScore = bidScore.score + distanceScore.score + handlingScore.score + flipScore.score + conditionScore.score + timingScore.score;
        List<String> positives = dedupe(joinLists(bidScore.positives, distanceScore.positives, handlingScore.positives, flipScore.positives, conditionScore.positives, timingScore.positives));
        List<String> negatives = dedupe(joinLists(bidScore.negatives, distanceScore.negatives, handlingScore.negatives, flipScore.negatives, conditionScore.negatives, timingScore.negatives, exclusionReasons));

        String status = !exclusionReasons.isEmpty() ? "excluded" : (consumerVehicle ? "consumer_vehicle" : "main_candidate");

        JSONObject compact = new JSONObject();
        compact.put("id", normalize(row.opt("accountId")) + ":" + normalize(row.opt("assetId")));
        compact.put("assetId", normalize(row.opt("assetId")));
        compact.put("accountId", normalize(row.opt("accountId")));
        compact.put("bucket", "consumer_vehicle".equals(status) ? "consumerVehicles" : ("excluded".equals(status) ? "excludedItems" : "mainCandidates"));
        compact.put("status", status);
        compact.put("title", normalize(row.opt("assetShortDescription")));
        compact.put("category", firstNonBlank(normalize(row.opt("categoryDisplay")), normalize(row.opt("categoryDescription"))));
        compact.put("company", normalize(row.opt("companyName")));
        compact.put("location", locationDisplay(row));
        compact.put("state", normalize(row.opt("locationState")));
        compact.put("zip", normalize(row.opt("locationZip")));
        putNumberOrNull(compact, "currentBid", currentBid);
        compact.put("currencyCode", firstNonBlank(normalize(row.opt("currencyCode")), "USD"));
        putNumberOrNull(compact, "bidCount", parseDouble(row.opt("bidCount"), Double.NaN));
        putNumberOrNull(compact, "distanceMiles", distanceMiles);
        putNumberOrNull(compact, "weightLbs", weightLbs);
        compact.put("weightKnown", weightLbs != null);
        compact.put("auctionEndUtc", normalize(row.opt("assetAuctionEndDateUtc")));
        compact.put("auctionEndDisplay", normalize(row.opt("assetAuctionEndDateDisplay")));
        compact.put("timeRemaining", normalize(row.opt("timeRemaining")));
        putNumberOrNull(compact, "hoursToEnd", hoursToEnd);
        compact.put("score", roundTwo(totalScore));
        compact.put("brand", normalize(row.opt("makebrand")));
        compact.put("model", normalize(row.opt("model")));
        compact.put("modelYear", normalize(row.opt("modelYear")));
        compact.put("itemUrl", assetUrl(row));
        compact.put("photoUrl", photoUrl);
        compact.put("longDescription", normalize(row.opt("assetLongDescription")));
        compact.put("positiveReasons", new JSONArray(positives));
        compact.put("negativeReasons", new JSONArray(negatives));
        compact.put("exclusionReason", joinWithPipes(dedupe(exclusionReasons)));
        compact.put("flags", buildFlags(consumerVehicle, heavyEquipment, specialtyForum, requiresForklift, screenDamage, consumerElectronics, palletLot, fitnessItem, weightLbs != null, photoPresent, brandPresent, modelPresent));

        return new ComputedRow(status, compact);
    }

    private static JSONArray buildFlags(boolean consumerVehicle, boolean heavyEquipment, boolean specialtyForum, boolean requiresForklift, boolean screenDamage, boolean consumerElectronics, boolean palletLot, boolean fitnessItem, boolean weightKnown, boolean photoPresent, boolean brandPresent, boolean modelPresent) {
        JSONArray flags = new JSONArray();
        if (consumerVehicle) flags.put("consumer-vehicle");
        if (heavyEquipment) flags.put("heavy-equipment");
        if (specialtyForum) flags.put("specialty-forum");
        if (requiresForklift) flags.put("forklift-required");
        if (screenDamage) flags.put("screen-damage");
        if (consumerElectronics) flags.put("consumer-electronics");
        if (palletLot) flags.put("pallet-lot");
        if (fitnessItem) flags.put("fitness-equipment");
        if (weightKnown) flags.put("weight-known");
        if (photoPresent) flags.put("photo-present");
        if (brandPresent) flags.put("brand-present");
        if (modelPresent) flags.put("model-present");
        return flags;
    }

    private static String combinedText(JSONObject row) {
        return String.join(" ",
                normalize(row.opt("assetShortDescription")),
                normalize(row.opt("categoryDescription")),
                normalize(row.opt("assetLongDescription")),
                normalize(row.opt("makebrand")),
                normalize(row.opt("model"))
        );
    }

    private static String normalize(Object value) {
        return value == null || JSONObject.NULL.equals(value) ? "" : String.valueOf(value);
    }

    private static void putNumberOrNull(JSONObject target, String key, Double value) throws JSONException {
        if (value == null || value.isNaN() || value.isInfinite()) {
            target.put(key, JSONObject.NULL);
        } else {
            target.put(key, roundTwo(value));
        }
    }

    private static double parseDouble(Object value, double defaultValue) {
        try {
            String text = normalize(value).trim();
            return text.isEmpty() ? defaultValue : Double.parseDouble(text);
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private static Integer newestYear(String text) {
        Matcher matcher = YEAR_RE.matcher(text);
        Integer newest = null;
        while (matcher.find()) {
            int year = Integer.parseInt(matcher.group(1));
            if (newest == null || year > newest) newest = year;
        }
        return newest;
    }

    private static Double extractWeightLbs(String text) {
        Matcher lbs = WEIGHT_LBS_RE.matcher(text);
        if (lbs.find()) {
            return Double.parseDouble(lbs.group(1));
        }
        Matcher tons = WEIGHT_TON_RE.matcher(text);
        if (tons.find()) {
            return Double.parseDouble(tons.group(1)) * 2000.0;
        }
        return null;
    }

    private static Double hoursToEnd(String endUtc) {
        if (endUtc == null || endUtc.isEmpty()) return null;
        try {
            Date end = parseIsoDate(endUtc);
            if (end == null) return null;
            long millis = end.getTime() - System.currentTimeMillis();
            return millis / 3600000.0;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Date parseIsoDate(String value) {
        String[] patterns = new String[] {
                "yyyy-MM-dd'T'HH:mm:ss.SSSX",
                "yyyy-MM-dd'T'HH:mm:ssX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                return format.parse(value);
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static double haversineMiles(double lat1, double lon1, double lat2, double lon2) {
        double radiusMiles = 3958.8;
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dPhi = Math.toRadians(lat2 - lat1);
        double dLambda = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        return 2 * radiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static ScoreResult scoreCurrentBid(double currentBid) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        if (Double.isNaN(currentBid)) {
            negatives.add("missing current bid");
            return new ScoreResult(-5, positives, negatives);
        }
        if (currentBid > 20000) {
            negatives.add("current bid above 20k ceiling");
            return new ScoreResult(-100, positives, negatives);
        }
        if (currentBid >= 750 && currentBid <= 1500) {
            positives.add("current bid near 1k sweet spot");
            return new ScoreResult(14, positives, negatives);
        }
        if (currentBid >= 500 && currentBid < 750) {
            positives.add("current bid below 1k but not ultra-competitive");
            return new ScoreResult(8, positives, negatives);
        }
        if (currentBid < 500) {
            negatives.add("current bid in high-competition under-500 range");
            return new ScoreResult(-6, positives, negatives);
        }
        if (currentBid <= 5000) {
            positives.add("current bid still practical");
            return new ScoreResult(4, positives, negatives);
        }
        negatives.add("high current bid");
        return new ScoreResult(-8, positives, negatives);
    }

    private static ScoreResult scoreDistance(Double distanceMiles) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        if (distanceMiles == null) {
            negatives.add("missing location distance");
            return new ScoreResult(-2, positives, negatives);
        }
        if (distanceMiles <= 100) {
            positives.add("within 100 miles");
            return new ScoreResult(12, positives, negatives);
        }
        if (distanceMiles <= 300) {
            positives.add("within day-trip range");
            return new ScoreResult(7, positives, negatives);
        }
        if (distanceMiles <= 1000) {
            return new ScoreResult(2, positives, negatives);
        }
        negatives.add("far from Seattle area");
        return new ScoreResult(-6, positives, negatives);
    }

    private static ScoreResult scoreHandling(Double weightLbs, boolean requiresForklift, boolean heavyEquipment, boolean fitnessItem) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        if (requiresForklift) {
            negatives.add("explicit forklift-required pickup");
            return new ScoreResult(-100, positives, negatives);
        }
        double score = 0.0;
        if (weightLbs == null) {
            negatives.add("weight unknown");
            score -= 2;
        } else if (weightLbs <= 1600) {
            positives.add("weight appears under 1600 lb");
            score += 10;
        } else {
            negatives.add("weight appears over 1600 lb");
            score -= 8;
        }
        if (heavyEquipment && !fitnessItem) {
            negatives.add("heavy-equipment handling burden");
            score -= 18;
        }
        if (fitnessItem) {
            positives.add("fitness equipment exemption");
            score += 4;
        }
        return new ScoreResult(score, positives, negatives);
    }

    private static ScoreResult scoreFlipEase(boolean brandPresent, boolean modelPresent, boolean photoPresent, int descriptionLength, boolean palletLot, boolean specialtyForum) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        double score = 0.0;
        if (brandPresent) {
            positives.add("brand present");
            score += 6;
        } else {
            negatives.add("missing brand");
            score -= 2;
        }
        if (modelPresent) {
            positives.add("model present");
            score += 6;
        } else {
            negatives.add("missing model");
            score -= 2;
        }
        if (photoPresent) {
            positives.add("photo present");
            score += 5;
        } else {
            negatives.add("missing photo");
            score -= 6;
        }
        if (descriptionLength >= 250) {
            positives.add("detailed description");
            score += 5;
        } else if (descriptionLength < 60) {
            negatives.add("short description");
            score -= 4;
        }
        if (palletLot) {
            positives.add("lot-style inventory may hide value");
            score += 2;
        }
        if (specialtyForum) {
            positives.add("possible specialty resale channel");
            score += 1;
        }
        return new ScoreResult(score, positives, negatives);
    }

    private static ConditionScore scoreCondition(String text, boolean consumerElectronics, boolean screenDamage) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        if (consumerElectronics && screenDamage) {
            negatives.add("consumer electronics with screen damage");
            return new ConditionScore(-100, positives, negatives, "consumer electronics with screen damage");
        }
        if (consumerElectronics && BROKEN_ELECTRONICS_RE.matcher(text).find()) {
            negatives.add("broken consumer electronics");
            return new ConditionScore(-100, positives, negatives, "broken consumer electronics");
        }
        double score = 0.0;
        if (!consumerElectronics && screenDamage) {
            positives.add("non-electronic screen damage may be fixable");
            score += 3;
        }
        if (UNCERTAIN_CONDITION_RE.matcher(text).find()) {
            negatives.add("condition uncertain");
            score -= 2;
        }
        return new ConditionScore(score, positives, negatives, null);
    }

    private static TimingScore scoreTiming(Double hoursToEnd) {
        List<String> positives = new ArrayList<>();
        List<String> negatives = new ArrayList<>();
        if (hoursToEnd == null) {
            negatives.add("missing end time");
            return new TimingScore(-1, positives, negatives);
        }
        if (hoursToEnd <= 0) {
            positives.add("ending immediately");
            return new TimingScore(6, positives, negatives);
        }
        if (hoursToEnd <= 24) {
            positives.add("ending within 24h");
            return new TimingScore(10, positives, negatives);
        }
        if (hoursToEnd <= 72) {
            positives.add("ending within 3 days");
            return new TimingScore(7, positives, negatives);
        }
        if (hoursToEnd <= 168) {
            positives.add("ending within 7 days");
            return new TimingScore(4, positives, negatives);
        }
        return new TimingScore(0, positives, negatives);
    }

    private static String assetUrl(JSONObject item) {
        String accountId = normalize(item.opt("accountId"));
        String assetId = normalize(item.opt("assetId"));
        if (accountId.isEmpty() || assetId.isEmpty()) return "";
        String url = "https://www.govdeals.com/asset/" + assetId + "/" + accountId;
        String warehouseId = normalize(item.opt("warehouseId"));
        return warehouseId.isEmpty() ? url : url + "?wid=" + warehouseId;
    }

    private static String photoUrl(JSONObject item) {
        String photo = normalize(item.opt("photo"));
        return photo.isEmpty() ? "" : "https://files.lqdt1.com/" + photo;
    }

    private static String locationDisplay(JSONObject item) {
        List<String> parts = new ArrayList<>();
        addIfNotBlank(parts, normalize(item.opt("locationCity")));
        addIfNotBlank(parts, firstNonBlank(normalize(item.opt("stateDescription")), normalize(item.opt("locationState"))));
        addIfNotBlank(parts, firstNonBlank(normalize(item.opt("countryDescription")), normalize(item.opt("country"))));
        return String.join(", ", parts);
    }

    private static void addIfNotBlank(List<String> parts, String value) {
        if (value != null && !value.trim().isEmpty()) parts.add(value.trim());
    }

    private static String firstNonBlank(String first, String second) {
        return first != null && !first.trim().isEmpty() ? first : second;
    }

    private static List<String> joinLists(List<String>... lists) {
        List<String> output = new ArrayList<>();
        for (List<String> list : lists) {
            output.addAll(list);
        }
        return output;
    }

    private static List<String> dedupe(List<String> values) {
        List<String> deduped = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String value : values) {
            String normalized = value == null ? "" : value.trim();
            if (!normalized.isEmpty() && seen.add(normalized)) {
                deduped.add(normalized);
            }
        }
        return deduped;
    }

    private static String joinWithPipes(List<String> values) {
        return String.join(" | ", values);
    }

    private static double roundTwo(Double value) {
        if (value == null) return Double.NaN;
        return Math.round(value * 100.0) / 100.0;
    }

    private static double optDouble(JSONObject object, String key) {
        return optDouble(object, key, Double.NaN);
    }

    private static double optDouble(JSONObject object, String key, double defaultValue) {
        Object value = object.opt(key);
        if (value == null || JSONObject.NULL.equals(value)) return defaultValue;
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private static final class ComputedRow {
        final String status;
        final JSONObject row;

        ComputedRow(String status, JSONObject row) {
            this.status = status;
            this.row = row;
        }
    }

    private static class ScoreResult {
        final double score;
        final List<String> positives;
        final List<String> negatives;

        ScoreResult(double score, List<String> positives, List<String> negatives) {
            this.score = score;
            this.positives = positives;
            this.negatives = negatives;
        }
    }

    private static final class ConditionScore extends ScoreResult {
        final String exclusionReason;

        ConditionScore(double score, List<String> positives, List<String> negatives, String exclusionReason) {
            super(score, positives, negatives);
            this.exclusionReason = exclusionReason;
        }
    }

    private static final class TimingScore extends ScoreResult {
        TimingScore(double score, List<String> positives, List<String> negatives) {
            super(score, positives, negatives);
        }
    }
}
