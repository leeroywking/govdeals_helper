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

Open detail by tapping the row body, not by forcing a separate large button for every row action.

## Detail Pattern

The detail surface owns deeper inspection and lower-frequency actions.

It should show:

- full listing description
- positive and negative reasons
- Codex enrichment output
- comp links
- direct listing link
- refresh item action
- restore / reject / pursue controls

On phones, detail can be a full-screen sheet or drill-in panel.
On larger screens, it should become a true split-pane detail view.

## Triage State Model

The UI should treat item state as first-class.

Minimum states:

- `active`
- `pursued`
- `rejected`

Supporting flags:

- `reviewed`
- `enriched`
- `new`

Rejected items should leave the active bucket immediately but remain recoverable from the rejected bucket.

## Batch Work Pattern

Batch work should come from selection mode or bucket-level actions, not from repeated row-button taps.

Minimum batch affordances:

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
- rejected bucket and restore flow
- detail pane/sheet with enrichment and comp links
- row-local state updates without snap-to-top behavior

It does not need to deliver full refresh or native Android background services yet.
