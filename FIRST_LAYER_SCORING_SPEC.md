# First-Layer Scoring Spec

This document defines the first-layer, fully programmatic filtering and scoring approach for GovDeals listings.

This layer is intentionally **not** LLM-driven.

Pipeline:

1. Programmatic filtering and scoring
2. Human review
3. Agentic / deeper investigation

The purpose of this layer is to reduce the full GovDeals result set into a smaller, higher-value candidate pool while preserving uncertain-but-promising listings for later review.

## Goal

The first layer should optimize for:

- expected total profit, not ROI
- ease of flip
- ease of pickup / handling
- low wasted review time

This layer should favor recall over overfitting. It should down-rank uncertain items rather than exclude them unless they clearly match a hard exclusion rule.

## Core Pipeline

1. Hard exclusions
2. Split consumer vehicles into a separate result set
3. Compute feature columns
4. Compute a numeric score
5. Emit ranked candidates plus reason columns
6. Preserve enough evidence for fast human review

## Hard Exclusions

Exclude immediately if explicit text or structured data indicates:

- hazardous materials / hazmat
- Chromebook
- laptop older than 2020
- broken old consumer electronics
- explicitly non-running consumer vehicles
- explicit forklift-required pickup or loading

Notes:

- Do not try to infer whether a vehicle runs unless that is explicit in data.
- Do not exclude uncertain items just because value is hard to assess.
- Do not exclude pallet lots solely because they are mixed.

## Separate Consumer Vehicle Output

Consumer road vehicles should be routed into a separate file:

- cars
- trucks
- SUVs
- vans
- motorcycles
- similar consumer vehicles

Reason:

- different comps
- different handling rules
- different resale dynamics
- different title and paperwork issues

The main score should focus on non-consumer-vehicle inventory.

## Primary Score Components

The total score should be a weighted sum of these parts.

### 1. Profit Score

Strongest component.

Derived from:

- expected resale value
- current bid

Target:

- expected total profit >= $2,000 is strong
- under $2,000 should be penalized

No ROI term should be used.

### 2. Flip Ease Score

Favor:

- broad resale channels
- recognizable items
- easy-to-explain listings
- good photos
- clear titles and descriptions
- visible brand and model

Specialty-market items should be flagged for later investigation, not necessarily penalized hard.

### 3. Distance Score

Distance from ZIP code `98155` should be a penalty, but not a hard exclusion.

Rules:

- local is better
- farther items need more profit
- very profitable items can still score well at long distance

The system should not over-model fuel cost. Keep distance treatment simple and practical.

### 4. Handling Score

Rules:

- under 1600 lb gets a boost
- missing weight gets only a mild penalty
- over 1600 lb gets a penalty, not exclusion
- explicit forklift-required handling should be excluded or penalized so heavily that it falls out
- clearly impractical heavy-equipment handling should be strongly penalized
- fitness equipment should not be auto-killed just for being heavy

### 5. Comp Confidence Score

Best score when exact make/model comps exist.

Strong comp thresholds:

- at least 2 exact sales in the last 30 days, or
- at least 20 exact sales in the last 365 days

If exact comps are sparse or missing:

- reduce confidence
- do not exclude the listing

### 6. Condition / Defect Score

Sketchy condition is generally acceptable.

Electronics:

- broken screen is a strong penalty or exclusion if the screen is core to the item’s value

Non-electronic equipment:

- broken screen is often neutral or potentially favorable

Do not broadly exclude damaged items outside explicit hard-no categories.

### 7. Auction Timing Score

Ending soon should raise priority because it is more actionable for review.

## Profit Logic

Keep this simple in the first layer.

Base formula:

- `estimated_profit = estimated_resale_value - current_bid`

Optional later enhancement:

- subtract a coarse friction reserve for distance and handling

Current guidance:

- `>= 2000` expected profit: strong positive
- `1000-2000`: middling
- `< 1000`: weak
- `< 500`: strong penalty unless flip ease is exceptional

Current bid desirability is a separate concept:

- around `$1000` current bid is ideal
- below `$500` gets a competition penalty
- above `$20,000` should be excluded or effectively zero-scored

Given current preferences, current bid above `$20,000` should be treated as a hard ceiling.

## Comp Rules

Programmatic only.

Preferred approach:

- exact make/model string match first
- if exact match unavailable, keep item but lower confidence
- if exact recent sales exist and imply `4x+` current bid, give a large boost
- if exact comp data exists but spread is weak, reduce score
- if no comp data exists, keep the listing with lower confidence

## Flip Ease Heuristics

This layer should use programmatic proxies only.

Useful proxies:

- brand present
- model present
- title specificity
- description length
- photo presence / photo count
- recognizable resale channel fit

Likely boosts:

- known brands
- exact model numbers
- clear photos
- listings easy to repost on Marketplace, Craigslist, or eBay

Likely penalties:

- vague mixed lots with little detail
- poor or missing photos
- missing brand/model
- items likely requiring specialist knowledge to market

Penalize rather than exclude.

## Distance Logic

Distance should never be a hard exclusion in the main score.

Simple rule:

- local gets a boost
- medium distance gets a mild penalty
- very far gets a larger penalty
- strong expected total profit can dominate distance

Operational interpretation:

- if expected profit is around or above `$2,000`, long-distance travel can still be justified

## Handling Logic

Programmatic handling rules:

- weight <= 1600 lb: boost
- missing weight: mild penalty
- weight > 1600 lb: penalty
- explicit forklift-required loading: hard exclude or near-hard-exclude
- heavy equipment: strong penalty unless other signs suggest practical handling
- fitness / exercise equipment: do not auto-exclude based on weight alone

## Output Artifacts

The scoring layer should eventually produce:

### 1. Main Ranked Candidate List

- non-consumer vehicles
- sorted by total score

### 2. Consumer Vehicle List

- separate file
- lightly filtered
- not mixed into the main candidate pool

### 3. Excluded Items Log

For each excluded item:

- item id
- exclusion reason

This is useful for debugging and tuning rules.

## Required Feature Columns

At minimum, compute and store:

- `distance_miles`
- `current_bid`
- `estimated_resale_value`
- `estimated_profit`
- `profit_score`
- `flip_ease_score`
- `distance_score`
- `handling_score`
- `comp_confidence_score`
- `condition_score`
- `timing_score`
- `total_score`

Supporting fields:

- `weight_lbs`
- `weight_known`
- `requires_forklift_flag`
- `consumer_vehicle_flag`
- `specialty_forum_flag`
- `photo_count` or proxy
- `description_length`
- `brand_present_flag`
- `model_present_flag`
- `screen_damage_flag`
- `consumer_electronics_flag`
- `pallet_lot_flag`
- `fitness_equipment_flag`
- `exact_comp_count_30d`
- `exact_comp_count_365d`
- `exact_comp_median_30d`
- `exact_comp_median_365d`
- `comp_source_confidence`

## Human Review Requirements

Each candidate row should preserve enough evidence for fast human inspection.

Recommended review-facing fields:

- item title
- current bid
- location / distance
- weight if known
- exact comp counts
- estimated resale
- estimated profit
- major penalty flags
- major boost flags
- raw URLs

Add deterministic explanation columns:

- `score_reasons_positive`
- `score_reasons_negative`

These should be rule-based strings assembled from triggered logic, not LLM-written prose.

## Design Principle

This layer should prefer:

- broad capture
- clear hard exclusions only where confidence is high
- transparent numeric ranking
- confidence penalties instead of silent filtering

The intended end-to-end strategy is:

- programmatic filtering and scoring
- human review of the top tranche
- agentic deeper analysis only on the surviving candidates
