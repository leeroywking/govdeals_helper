# Mobile UI Rework Spec

This document defines the target interaction model for the Android review app before additional workflow features are layered on top.

## Design Goal

The app should behave like an inbox-style triage tool, not a feed of standalone marketplace cards.

The right mental model is:

- inbox for navigation and fast disposition
- detail view for inspection
- queue/status area for enrichment and refresh work

## Core Structural Pattern

Use a list-detail triage layout with bucket-based navigation.

### Primary Buckets

- `Active`
- `Pursued`
- `Rejected`
- `Vehicles`
- `New` when refresh support exists

These are not decorative tabs. They are the main way the user changes context.

### Secondary Controls

Use filter chips for temporary narrowing inside a bucket:

- `Nearby`
- `Ends Soon`
- `Reviewed`
- `Enriched`
- `Has Comp Links`

These should be lightweight toggles, not separate pages.

### Main Content Area

The main screen should be a dense, scannable list of rows instead of large cards.

Each row should emphasize:

- title
- current bid
- distance
- time to end
- effective score
- a few short state badges

Per-row action density should stay low.

Preferred visible row actions:

- `Pursue`
- `Reject`
- `Enrich`
- `Details`

Open detail by tapping the row body, but still keep an explicit `Details` control for users who expect a discrete action target.

## Detail Pattern

The expanded row surface owns deeper inspection and lower-frequency actions.

It should show:

- full listing description
- positive and negative reasons
- Codex enrichment output
- comp links
- direct listing link
- refresh item action
- restore / reject / pursue controls

Primary behavior should be inline expansion from the row itself.
Secondary drill-in or sheet behavior can exist later if needed, but the default interaction should feel attached to the list item.

## Triage State Model

The UI should treat item state as first-class.

Minimum states:

- `active`
- `pursued`
- `holding`
- `rejected`
- `ended`

Supporting flags:

- `reviewed`
- `enriched`
- `new`

Rejected items should leave the active bucket immediately but remain recoverable from the rejected bucket.

## Batch Work Pattern

Batch work should come from selection mode or bucket-level actions, not from repeated row-button taps.

Minimum batch affordances:

- row-level selection for targeted multi-item work
- `Enrich Selected`
- selected-item `Pursue`, `Hold`, and `Reject`
- `Enrich Visible`
- `Enrich Pursued`
- stop batch
- visible progress

When selection mode is later added, batch actions should move into a contextual action bar.

## Scroll And Rerender Behavior

Row-level actions must not snap the user back to the top of the list.

Requirements:

- preserve scroll position after row actions
- prefer row-local updates over full-list rerenders
- keep the selected item stable if detail is open

This is a functional requirement, not a cosmetic one.

## Visual Direction

The UI should feel more like a purpose-built triage tool than a generic shopping app.

Preferred characteristics:

- dense rows
- restrained but readable metadata
- clear state badges
- obvious bucket context
- strong separation between list scanning and detailed inspection

Avoid:

- oversized cards for every item
- repeating the same large button cluster on every row
- forcing the user to scroll large visual blocks just to mark or reject items

## Immediate Implementation Scope

This rework should deliver:

- bucket-based primary navigation
- dense triage rows
- filter chips
- local `new` flag visibility after refresh merges
- holding bucket and hold/unhold workflow
- rejected bucket and restore flow
- row-level selection for targeted enrichment
- selected-item triage actions for pursue/hold/reject
- selected-item restore action
- inline expanding detail with enrichment and comp links
- device-state export/import for moving triage state off the phone
- optional backend-assisted full refresh and listing refresh
- refreshed bundle caching so newer backend-refreshed data survives app restart
- ended-list retention so disappeared listings stay reviewable after refresh
- row-local state updates without snap-to-top behavior

It does not need to deliver full refresh or native Android background services yet.
