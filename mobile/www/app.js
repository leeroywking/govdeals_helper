const STORAGE_KEYS = {
  reviewed: "govdeals-reviewed-ids",
  pursued: "govdeals-pursued-ids",
  holding: "govdeals-holding-ids",
  rejected: "govdeals-rejected-ids",
  enrichments: "govdeals-enrichments",
  apiKey: "govdeals-openai-api-key",
  rememberKey: "govdeals-openai-remember-key",
  model: "govdeals-openai-model",
};

const BUCKETS = [
  { key: "active", label: "Active" },
  { key: "pursued", label: "Pursued" },
  { key: "holding", label: "Holding" },
  { key: "rejected", label: "Rejected" },
  { key: "vehicles", label: "Vehicles" },
  { key: "excluded", label: "Excluded" },
];

const CHIPS = [
  { key: "nearby", label: "Nearby" },
  { key: "endsSoon", label: "Ends Soon" },
  { key: "reviewed", label: "Reviewed" },
  { key: "enriched", label: "Enriched" },
  { key: "hasCompLinks", label: "Has Comp Links" },
];

const state = {
  manifest: null,
  datasets: {},
  bucket: "active",
  expandedIds: [],
  search: "",
  sort: "score",
  chips: {
    nearby: false,
    endsSoon: false,
    reviewed: false,
    enriched: false,
    hasCompLinks: false,
  },
  reviewedIds: loadArray(STORAGE_KEYS.reviewed),
  pursuedIds: loadArray(STORAGE_KEYS.pursued),
  holdingIds: loadArray(STORAGE_KEYS.holding),
  rejectedIds: loadArray(STORAGE_KEYS.rejected),
  enrichments: loadObject(STORAGE_KEYS.enrichments),
  rememberKey: localStorage.getItem(STORAGE_KEYS.rememberKey) === "true",
  model: localStorage.getItem(STORAGE_KEYS.model) || "gpt-5-mini",
  sessionApiKey: "",
  loadingEnrichmentIds: [],
  batchRun: {
    running: false,
    scope: "",
    total: 0,
    completed: 0,
    failed: 0,
    currentTitle: "",
    stopRequested: false,
  },
};

const bucketNavEl = document.getElementById("bucket-nav");
const chipBarEl = document.getElementById("chip-bar");
const rowsEl = document.getElementById("rows");
const listTitleEl = document.getElementById("list-title");
const datasetStatusEl = document.getElementById("dataset-status");
const listStatsEl = document.getElementById("list-stats");
const batchStatusEl = document.getElementById("batch-status");
const searchInputEl = document.getElementById("search-input");
const sortSelectEl = document.getElementById("sort-select");
const batchVisibleButtonEl = document.getElementById("batch-visible-button");
const batchPursuedButtonEl = document.getElementById("batch-pursued-button");
const batchStopButtonEl = document.getElementById("batch-stop-button");
const exportButtonEl = document.getElementById("export-button");
const settingsButtonEl = document.getElementById("settings-button");
const settingsDialogEl = document.getElementById("settings-dialog");
const exportDialogEl = document.getElementById("export-dialog");
const exportTextEl = document.getElementById("export-text");
const exportStatusEl = document.getElementById("export-status");
const apiKeyInputEl = document.getElementById("api-key-input");
const rememberKeyCheckboxEl = document.getElementById("remember-key-checkbox");
const modelInputEl = document.getElementById("model-input");
const settingsStatusEl = document.getElementById("settings-status");
const saveSettingsButtonEl = document.getElementById("save-settings-button");
const clearSettingsButtonEl = document.getElementById("clear-settings-button");
const copyExportButtonEl = document.getElementById("copy-export-button");
const downloadExportButtonEl = document.getElementById("download-export-button");
const rowTemplate = document.getElementById("row-template");

function loadArray(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function loadObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function saveArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getApiKey() {
  return state.rememberKey ? localStorage.getItem(STORAGE_KEYS.apiKey) || "" : state.sessionApiKey;
}

function setApiKey(value, remember) {
  state.rememberKey = remember;
  localStorage.setItem(STORAGE_KEYS.rememberKey, String(remember));
  if (remember) {
    localStorage.setItem(STORAGE_KEYS.apiKey, value);
    state.sessionApiKey = "";
  } else {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    state.sessionApiKey = value;
  }
}

function clearApiKey() {
  state.sessionApiKey = "";
  state.rememberKey = false;
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  localStorage.removeItem(STORAGE_KEYS.rememberKey);
}

function hasApiKey() {
  return Boolean(getApiKey());
}

function isIn(id, collection) {
  return collection.includes(id);
}

function addTo(id, collection) {
  if (!collection.includes(id)) {
    collection.push(id);
  }
}

function removeFrom(id, collection) {
  return collection.filter((entry) => entry !== id);
}

function toggleExpanded(id, reveal = false) {
  if (state.expandedIds.includes(id)) {
    state.expandedIds = state.expandedIds.filter((entry) => entry !== id);
  } else {
    state.expandedIds.push(id);
  }
  render({ preserveScroll: true });
  if (reveal) {
    requestAnimationFrame(() => {
      document.querySelector(`[data-row-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

function setReviewed(id, preserveScroll = true) {
  if (isIn(id, state.reviewedIds)) {
    state.reviewedIds = removeFrom(id, state.reviewedIds);
  } else {
    addTo(id, state.reviewedIds);
  }
  saveArray(STORAGE_KEYS.reviewed, state.reviewedIds);
  render({ preserveScroll });
}

function clearTriageConflicts(id) {
  state.pursuedIds = removeFrom(id, state.pursuedIds);
  state.holdingIds = removeFrom(id, state.holdingIds);
  state.rejectedIds = removeFrom(id, state.rejectedIds);
}

function setPursued(id, preserveScroll = true) {
  const already = isIn(id, state.pursuedIds);
  clearTriageConflicts(id);
  if (!already) {
    addTo(id, state.pursuedIds);
  }
  saveArray(STORAGE_KEYS.pursued, state.pursuedIds);
  saveArray(STORAGE_KEYS.holding, state.holdingIds);
  saveArray(STORAGE_KEYS.rejected, state.rejectedIds);
  render({ preserveScroll });
}

function setHolding(id, preserveScroll = true) {
  const already = isIn(id, state.holdingIds);
  clearTriageConflicts(id);
  if (!already) {
    addTo(id, state.holdingIds);
  }
  saveArray(STORAGE_KEYS.pursued, state.pursuedIds);
  saveArray(STORAGE_KEYS.holding, state.holdingIds);
  saveArray(STORAGE_KEYS.rejected, state.rejectedIds);
  render({ preserveScroll });
}

function setRejected(id, preserveScroll = true) {
  const already = isIn(id, state.rejectedIds);
  clearTriageConflicts(id);
  if (!already) {
    addTo(id, state.rejectedIds);
  }
  saveArray(STORAGE_KEYS.pursued, state.pursuedIds);
  saveArray(STORAGE_KEYS.holding, state.holdingIds);
  saveArray(STORAGE_KEYS.rejected, state.rejectedIds);
  render({ preserveScroll });
}

function restoreActive(id) {
  clearTriageConflicts(id);
  saveArray(STORAGE_KEYS.pursued, state.pursuedIds);
  saveArray(STORAGE_KEYS.holding, state.holdingIds);
  saveArray(STORAGE_KEYS.rejected, state.rejectedIds);
  render({ preserveScroll: true });
}

function setLoading(id, loading) {
  if (loading && !state.loadingEnrichmentIds.includes(id)) {
    state.loadingEnrichmentIds.push(id);
  }
  if (!loading && state.loadingEnrichmentIds.includes(id)) {
    state.loadingEnrichmentIds = state.loadingEnrichmentIds.filter((entry) => entry !== id);
  }
}

function isLoading(id) {
  return state.loadingEnrichmentIds.includes(id);
}

function batchStatusText() {
  if (!state.batchRun.running) {
    return "Batch enrichment can process many items, but only while the app stays open in the foreground.";
  }
  const current = state.batchRun.currentTitle ? ` | Current: ${state.batchRun.currentTitle}` : "";
  return `Batch ${state.batchRun.scope}: ${state.batchRun.completed}/${state.batchRun.total} complete, ${state.batchRun.failed} failed${state.batchRun.stopRequested ? " | stopping after current item" : ""}${current}`;
}

async function loadManifest() {
  const response = await fetch("data/manifest.json");
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  state.manifest = await response.json();
}

function formatCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMiles(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown";
  }
  return `${Math.round(value)} mi`;
}

function formatHours(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown";
  }
  if (value < 24) {
    return `${Math.max(0, Math.round(value))} h`;
  }
  return `${(value / 24).toFixed(1)} d`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateText(text, maxLength = 120) {
  const value = String(text || "").trim();
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function openListing(url) {
  if (!url) {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function settingsSummaryText() {
  return hasApiKey() ? `Codex ready with ${state.model}.` : "Codex enrichment is not configured yet.";
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonFromText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model output.");
  }
}

function collectStrings(node, values = []) {
  if (typeof node === "string") {
    values.push(node);
    return values;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectStrings(item, values));
    return values;
  }
  if (!node || typeof node !== "object") {
    return values;
  }
  for (const [key, value] of Object.entries(node)) {
    if ((key === "text" || key === "output_text") && typeof value === "string") {
      values.push(value);
      continue;
    }
    collectStrings(value, values);
  }
  return values;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return collectStrings(payload, []).filter((entry) => entry.trim()).join("\n").trim();
}

function normalizeSource(source) {
  if (!source) {
    return null;
  }
  if (typeof source === "string") {
    return { label: source, url: "" };
  }
  if (typeof source === "object") {
    return {
      label: String(source.label || source.name || source.url || "").trim(),
      url: String(source.url || "").trim(),
    };
  }
  return null;
}

function getAllRowsSync() {
  return [
    ...(state.datasets.mainCandidates || []),
    ...(state.datasets.consumerVehicles || []),
    ...(state.datasets.excludedItems || []),
  ];
}

function getEnrichment(row) {
  return state.enrichments[row.id] || null;
}

function effectiveScore(row) {
  const enrichment = getEnrichment(row);
  if (enrichment?.updatedScore != null) {
    return enrichment.updatedScore;
  }
  if (enrichment?.scoreAdjustment != null && typeof row.score === "number") {
    return row.score + enrichment.scoreAdjustment;
  }
  return row.score;
}

function sourceRowsForBucket(bucket) {
  if (bucket === "vehicles") {
    return state.datasets.consumerVehicles || [];
  }
  if (bucket === "excluded") {
    return state.datasets.excludedItems || [];
  }
  return state.datasets.mainCandidates || [];
}

function inBucket(row, bucket) {
  if (bucket === "active") {
    return !isIn(row.id, state.pursuedIds) && !isIn(row.id, state.holdingIds) && !isIn(row.id, state.rejectedIds);
  }
  if (bucket === "pursued") {
    return isIn(row.id, state.pursuedIds);
  }
  if (bucket === "holding") {
    return isIn(row.id, state.holdingIds);
  }
  if (bucket === "rejected") {
    return isIn(row.id, state.rejectedIds);
  }
  if (bucket === "vehicles") {
    return !isIn(row.id, state.rejectedIds);
  }
  if (bucket === "excluded") {
    return true;
  }
  return true;
}

function rowMatchesChips(row) {
  const enrichment = getEnrichment(row);
  if (state.chips.nearby && !(typeof row.distanceMiles === "number" && row.distanceMiles <= 100)) {
    return false;
  }
  if (state.chips.endsSoon && !(typeof row.hoursToEnd === "number" && row.hoursToEnd <= 48)) {
    return false;
  }
  if (state.chips.reviewed && !isIn(row.id, state.reviewedIds)) {
    return false;
  }
  if (state.chips.enriched && !enrichment) {
    return false;
  }
  if (state.chips.hasCompLinks && !(enrichment && enrichment.possibleSources.length)) {
    return false;
  }
  return true;
}

function filteredRowsForCurrentBucket() {
  const term = state.search.trim().toLowerCase();
  return sourceRowsForBucket(state.bucket)
    .filter((row) => inBucket(row, state.bucket))
    .filter((row) => rowMatchesChips(row))
    .filter((row) => {
      if (!term) {
        return true;
      }
      const enrichment = getEnrichment(row);
      const haystack = [
        row.title,
        row.category,
        row.state,
        row.brand,
        row.model,
        row.company,
        row.location,
        row.longDescription,
        enrichment?.summary,
        enrichment?.listingSignals?.join(" "),
        enrichment?.compSignals?.join(" "),
        ...(enrichment?.possibleSources || []).map((source) => `${source.label} ${source.url}`).join(" "),
        ...(row.flags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
}

function sortRows(rows) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    if (state.sort === "endingSoon") {
      return (left.hoursToEnd ?? 1e9) - (right.hoursToEnd ?? 1e9);
    }
    if (state.sort === "distance") {
      return (left.distanceMiles ?? 1e9) - (right.distanceMiles ?? 1e9);
    }
    if (state.sort === "bid") {
      return (right.currentBid ?? -1) - (left.currentBid ?? -1);
    }
    if (state.sort === "title") {
      return (left.title || "").localeCompare(right.title || "");
    }
    if (state.sort === "enrichedScore") {
      return (effectiveScore(right) ?? -1e9) - (effectiveScore(left) ?? -1e9);
    }
    return (right.score ?? -1e9) - (left.score ?? -1e9);
  });
  return sorted;
}

function renderBuckets() {
  bucketNavEl.replaceChildren();
  BUCKETS.forEach((bucket) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-button${state.bucket === bucket.key ? " active" : ""}`;
    const count = sourceRowsForBucket(bucket.key).filter((row) => inBucket(row, bucket.key)).length;
    button.textContent = `${bucket.label} (${count})`;
    button.addEventListener("click", () => {
      state.bucket = bucket.key;
      state.expandedIds = [];
      render({ preserveScroll: false });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    bucketNavEl.appendChild(button);
  });
}

function renderChips() {
  chipBarEl.replaceChildren();
  CHIPS.forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip-button${state.chips[chip.key] ? " active" : ""}`;
    button.textContent = chip.label;
    button.addEventListener("click", () => {
      state.chips[chip.key] = !state.chips[chip.key];
      render({ preserveScroll: true });
    });
    chipBarEl.appendChild(button);
  });
}

function metricPill(text, kind = "") {
  const el = document.createElement("span");
  el.className = `pill${kind ? ` ${kind}` : ""}`;
  el.textContent = text;
  return el;
}

function sanitizeEnrichment(raw, row) {
  const scoreAdjustment = normalizeNumber(raw.scoreAdjustment);
  const updatedScore = normalizeNumber(raw.updatedScore);
  return {
    enrichedAt: new Date().toISOString(),
    summary: String(raw.summary || "").trim(),
    listingSignals: Array.isArray(raw.listingSignals) ? raw.listingSignals.map(String) : [],
    compSignals: Array.isArray(raw.compSignals) ? raw.compSignals.map(String) : [],
    riskSignals: Array.isArray(raw.riskSignals) ? raw.riskSignals.map(String) : [],
    possibleSources: Array.isArray(raw.possibleSources) ? raw.possibleSources.map(normalizeSource).filter(Boolean) : [],
    confidence: String(raw.confidence || "").trim(),
    recommendation: String(raw.recommendation || "").trim(),
    scoreAdjustment,
    updatedScore: updatedScore ?? (typeof row.score === "number" && typeof scoreAdjustment === "number" ? row.score + scoreAdjustment : null),
    estimatedResaleLow: normalizeNumber(raw.estimatedResaleLow),
    estimatedResaleHigh: normalizeNumber(raw.estimatedResaleHigh),
    estimatedProfitLow: normalizeNumber(raw.estimatedProfitLow),
    estimatedProfitHigh: normalizeNumber(raw.estimatedProfitHigh),
    rawText: String(raw.rawText || "").trim(),
  };
}

function buildEnrichmentPrompt(row) {
  return `
You are helping evaluate a GovDeals listing for resale profit and ease of flip.

Return strict JSON only with these keys:
summary, listingSignals, compSignals, riskSignals, possibleSources, confidence, recommendation, scoreAdjustment, updatedScore, estimatedResaleLow, estimatedResaleHigh, estimatedProfitLow, estimatedProfitHigh, rawText

Rules:
- listingSignals, compSignals, riskSignals must be arrays of short strings
- possibleSources must be an array of objects with keys label and url
- include direct links to comparable sales or supporting pages whenever possible
- scoreAdjustment should be between -30 and 30
- updatedScore should be the revised total score for this item
- estimate profit using current bid only
- use web search for comps when useful
- if exact comps are weak, say so and lower confidence
- do not include markdown fences

Listing data:
${JSON.stringify(
    {
      title: row.title,
      category: row.category,
      company: row.company,
      location: row.location,
      state: row.state,
      currentBid: row.currentBid,
      bidCount: row.bidCount,
      distanceMiles: row.distanceMiles,
      weightLbs: row.weightLbs,
      baseScore: row.score,
      positiveReasons: row.positiveReasons,
      negativeReasons: row.negativeReasons,
      flags: row.flags,
      itemUrl: row.itemUrl,
      longDescription: row.longDescription,
      previousEnrichment: getEnrichment(row) || null,
    },
    null,
    2,
  )}
`.trim();
}

async function runEnrichment(row) {
  return runEnrichmentInternal(row, { rerenderAfter: true, showError: true });
}

async function runEnrichmentInternal(row, options = {}) {
  const { rerenderAfter = true, showError = true } = options;
  if (!hasApiKey()) {
    openSettingsDialog("Enter an OpenAI API key before running Codex enrichment.");
    return false;
  }
  setLoading(row.id, true);
  await render({ preserveScroll: true });
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: state.model,
        tools: [{ type: "web_search" }],
        input: buildEnrichmentPrompt(row),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || `OpenAI request failed with ${response.status}`);
    }
    const responseText = extractResponseText(payload);
    const parsed = parseJsonFromText(responseText);
    parsed.rawText = parsed.rawText || responseText;
    state.enrichments[row.id] = sanitizeEnrichment(parsed, row);
    saveObject(STORAGE_KEYS.enrichments, state.enrichments);
    return true;
  } catch (error) {
    if (showError) {
      datasetStatusEl.textContent = `Enrichment failed: ${String(error)}`;
    }
    return false;
  } finally {
    setLoading(row.id, false);
    if (rerenderAfter) {
      await render({ preserveScroll: true });
    }
  }
}

async function runBatchEnrichment(scope) {
  if (state.batchRun.running) {
    datasetStatusEl.textContent = "A batch enrichment run is already in progress.";
    return;
  }
  if (!hasApiKey()) {
    openSettingsDialog("Enter an OpenAI API key before running batch enrichment.");
    return;
  }
  const rows = scope === "pursued"
    ? sortRows(getAllRowsSync().filter((row) => isIn(row.id, state.pursuedIds) && !isIn(row.id, state.rejectedIds)))
    : sortRows(filteredRowsForCurrentBucket());
  if (!rows.length) {
    datasetStatusEl.textContent = "No items available for batch enrichment.";
    return;
  }
  if (!window.confirm(`Start batch enrichment for ${rows.length} items? Keep the app open while it runs.`)) {
    return;
  }
  state.batchRun = {
    running: true,
    scope,
    total: rows.length,
    completed: 0,
    failed: 0,
    currentTitle: "",
    stopRequested: false,
  };
  await render({ preserveScroll: true });
  for (const row of rows) {
    if (state.batchRun.stopRequested) {
      break;
    }
    state.batchRun.currentTitle = truncateText(row.title, 72);
    await render({ preserveScroll: true });
    const ok = await runEnrichmentInternal(row, { rerenderAfter: false, showError: false });
    state.batchRun.completed += 1;
    if (!ok) {
      state.batchRun.failed += 1;
    }
    await render({ preserveScroll: true });
  }
  const finished = state.batchRun.completed;
  const failed = state.batchRun.failed;
  const stopped = state.batchRun.stopRequested;
  state.batchRun = {
    running: false,
    scope: "",
    total: 0,
    completed: 0,
    failed: 0,
    currentTitle: "",
    stopRequested: false,
  };
  datasetStatusEl.textContent = stopped
    ? `Batch enrichment stopped after ${finished} items with ${failed} failures.`
    : `Batch enrichment finished: ${finished} items processed with ${failed} failures.`;
  await render({ preserveScroll: true });
}

function requestBatchStop() {
  if (!state.batchRun.running) {
    datasetStatusEl.textContent = "No batch enrichment is running.";
    return;
  }
  state.batchRun.stopRequested = true;
  render({ preserveScroll: true });
}

function detailSection(titleText, contentNode) {
  const section = document.createElement("section");
  section.className = "detail-block";
  const title = document.createElement("h3");
  title.textContent = titleText;
  section.appendChild(title);
  section.appendChild(contentNode);
  return section;
}

function renderExpandedDetail(row) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-grid";
  const enrichment = getEnrichment(row);

  const overviewContent = document.createElement("div");
  overviewContent.className = "detail-pills";
  overviewContent.appendChild(metricPill(`Bid ${formatCurrency(row.currentBid)}`));
  overviewContent.appendChild(metricPill(`Distance ${formatMiles(row.distanceMiles)}`));
  overviewContent.appendChild(metricPill(`Ends ${formatHours(row.hoursToEnd)}`));
  overviewContent.appendChild(metricPill(`Score ${effectiveScore(row) ?? "N/A"}`));
  if (isIn(row.id, state.reviewedIds)) overviewContent.appendChild(metricPill("Reviewed", "positive"));
  if (isIn(row.id, state.pursuedIds)) overviewContent.appendChild(metricPill("Pursued", "warning"));
  if (isIn(row.id, state.holdingIds)) overviewContent.appendChild(metricPill("Holding", "hold"));
  if (isIn(row.id, state.rejectedIds)) overviewContent.appendChild(metricPill("Rejected", "negative"));
  wrapper.appendChild(detailSection("Overview", overviewContent));

  const actionRow = document.createElement("div");
  actionRow.className = "inline-actions";

  const reviewButton = document.createElement("button");
  reviewButton.type = "button";
  reviewButton.className = isIn(row.id, state.reviewedIds) ? "primary-button" : "ghost-button";
  reviewButton.textContent = isIn(row.id, state.reviewedIds) ? "Unreview" : "Mark Reviewed";
  reviewButton.addEventListener("click", () => setReviewed(row.id, true));
  actionRow.appendChild(reviewButton);

  const pursueButton = document.createElement("button");
  pursueButton.type = "button";
  pursueButton.className = isIn(row.id, state.pursuedIds) ? "primary-button" : "ghost-button";
  pursueButton.textContent = isIn(row.id, state.pursuedIds) ? "Unpursue" : "Pursue";
  pursueButton.addEventListener("click", () => setPursued(row.id, true));
  actionRow.appendChild(pursueButton);

  const holdButton = document.createElement("button");
  holdButton.type = "button";
  holdButton.className = isIn(row.id, state.holdingIds) ? "primary-button" : "ghost-button";
  holdButton.textContent = isIn(row.id, state.holdingIds) ? "Unhold" : "Hold";
  holdButton.addEventListener("click", () => setHolding(row.id, true));
  actionRow.appendChild(holdButton);

  const rejectButton = document.createElement("button");
  rejectButton.type = "button";
  rejectButton.className = isIn(row.id, state.rejectedIds) ? "primary-button" : "ghost-button";
  rejectButton.textContent = isIn(row.id, state.rejectedIds) ? "Restore" : "Reject";
  rejectButton.addEventListener("click", () => {
    if (isIn(row.id, state.rejectedIds)) {
      restoreActive(row.id);
    } else {
      setRejected(row.id, true);
    }
  });
  actionRow.appendChild(rejectButton);

  const enrichButton = document.createElement("button");
  enrichButton.type = "button";
  enrichButton.className = isLoading(row.id) ? "primary-button" : "ghost-button";
  enrichButton.textContent = isLoading(row.id) ? "Enriching..." : "Run Enrichment";
  enrichButton.disabled = isLoading(row.id);
  enrichButton.addEventListener("click", () => runEnrichment(row));
  actionRow.appendChild(enrichButton);

  const linkButton = document.createElement("button");
  linkButton.type = "button";
  linkButton.className = "ghost-button";
  linkButton.textContent = "Open Listing";
  linkButton.addEventListener("click", () => openListing(row.itemUrl));
  actionRow.appendChild(linkButton);
  wrapper.appendChild(detailSection("Actions", actionRow));

  const signals = document.createElement("div");
  signals.className = "detail-reasons";
  (row.positiveReasons || []).slice(0, 4).forEach((reason) => signals.appendChild(metricPill(reason, "positive")));
  (row.negativeReasons || []).slice(0, 3).forEach((reason) => signals.appendChild(metricPill(reason, "negative")));
  wrapper.appendChild(detailSection("Signals", signals));

  const description = document.createElement("pre");
  description.textContent = row.longDescription || "No long description in bundle.";
  wrapper.appendChild(detailSection("Description", description));

  const enrichContent = document.createElement("div");
  if (!enrichment) {
    const note = document.createElement("p");
    note.className = "supporting-text";
    note.textContent = "No enrichment saved for this item yet.";
    enrichContent.appendChild(note);
  } else {
    const summary = document.createElement("p");
    summary.textContent = enrichment.summary || enrichment.rawText || "No summary returned.";
    enrichContent.appendChild(summary);

    const pills = document.createElement("div");
    pills.className = "detail-pills";
    pills.appendChild(metricPill(`Updated ${enrichment.updatedScore ?? "N/A"}`));
    pills.appendChild(metricPill(`Profit ${formatCurrency(enrichment.estimatedProfitLow)} to ${formatCurrency(enrichment.estimatedProfitHigh)}`));
    if (enrichment.confidence) {
      pills.appendChild(metricPill(enrichment.confidence, "positive"));
    }
    enrichContent.appendChild(pills);

    const list = document.createElement("ul");
    const lines = [
      ...enrichment.compSignals.map((value) => `Comp: ${value}`),
      ...enrichment.riskSignals.map((value) => `Risk: ${value}`),
      ...enrichment.listingSignals.map((value) => `Listing: ${value}`),
    ];
    list.innerHTML = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("") || "<li>No structured notes.</li>";
    enrichContent.appendChild(list);

    if (enrichment.possibleSources.length) {
      const sourceList = document.createElement("ul");
      enrichment.possibleSources.forEach((source) => {
        const item = document.createElement("li");
        if (source.url) {
          const link = document.createElement("a");
          link.className = "source-link";
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = source.label || source.url;
          item.appendChild(link);
        } else {
          item.textContent = source.label;
        }
        sourceList.appendChild(item);
      });
      enrichContent.appendChild(sourceList);
    }
  }
  wrapper.appendChild(detailSection("Codex Enrichment", enrichContent));
  return wrapper;
}

function renderRows(rows) {
  rowsEl.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items match the current bucket and filters.";
    rowsEl.appendChild(empty);
    return;
  }

  rows.slice(0, 500).forEach((row) => {
    const fragment = rowTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".row-card");
    const main = fragment.querySelector(".row-main");
    const title = fragment.querySelector(".row-title");
    const subtitle = fragment.querySelector(".row-subtitle");
    const metrics = fragment.querySelector(".row-metrics");
    const detailsButton = fragment.querySelector(".details-button");
    const pursueButton = fragment.querySelector(".pursue-button");
    const holdButton = fragment.querySelector(".hold-button");
    const rejectButton = fragment.querySelector(".reject-button");
    const enrichButton = fragment.querySelector(".enrich-button");
    const detail = fragment.querySelector(".row-detail");
    const enrichment = getEnrichment(row);

    card.dataset.rowId = row.id;
    if (state.expandedIds.includes(row.id)) {
      card.classList.add("expanded");
      detail.replaceChildren(renderExpandedDetail(row));
    }

    title.textContent = row.title || "Untitled item";
    subtitle.textContent = `${row.category || "Unknown"} · ${row.location || "Unknown location"}`;
    metrics.appendChild(metricPill(formatCurrency(row.currentBid)));
    metrics.appendChild(metricPill(formatMiles(row.distanceMiles)));
    metrics.appendChild(metricPill(formatHours(row.hoursToEnd)));
    metrics.appendChild(metricPill(`Score ${effectiveScore(row) ?? "N/A"}`));
    if (isIn(row.id, state.reviewedIds)) metrics.appendChild(metricPill("Reviewed", "positive"));
    if (isIn(row.id, state.pursuedIds)) metrics.appendChild(metricPill("Pursued", "warning"));
    if (isIn(row.id, state.holdingIds)) metrics.appendChild(metricPill("Holding", "hold"));
    if (isIn(row.id, state.rejectedIds)) metrics.appendChild(metricPill("Rejected", "negative"));
    if (enrichment?.possibleSources?.length) metrics.appendChild(metricPill(`${enrichment.possibleSources.length} comp links`, "positive"));

    main.addEventListener("click", () => toggleExpanded(row.id, false));
    detailsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!state.expandedIds.includes(row.id)) {
        toggleExpanded(row.id, true);
      } else {
        toggleExpanded(row.id, true);
      }
    });

    pursueButton.textContent = isIn(row.id, state.pursuedIds) ? "Unpursue" : "Pursue";
    pursueButton.classList.toggle("active", isIn(row.id, state.pursuedIds));
    pursueButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setPursued(row.id, true);
    });

    holdButton.textContent = isIn(row.id, state.holdingIds) ? "Unhold" : "Hold";
    holdButton.classList.add("hold");
    holdButton.classList.toggle("active", isIn(row.id, state.holdingIds));
    holdButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setHolding(row.id, true);
    });

    rejectButton.textContent = isIn(row.id, state.rejectedIds) ? "Restore" : "Reject";
    rejectButton.classList.add("reject");
    rejectButton.classList.toggle("active", isIn(row.id, state.rejectedIds));
    rejectButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isIn(row.id, state.rejectedIds)) {
        restoreActive(row.id);
      } else {
        setRejected(row.id, true);
      }
    });

    enrichButton.textContent = isLoading(row.id) ? "Enriching..." : enrichment ? "Re-enrich" : "Enrich";
    enrichButton.classList.toggle("active", isLoading(row.id));
    enrichButton.disabled = isLoading(row.id);
    enrichButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!state.expandedIds.includes(row.id)) {
        state.expandedIds.push(row.id);
      }
      await runEnrichment(row);
    });

    rowsEl.appendChild(fragment);
  });
}

function buildExportText() {
  const rows = sortRows(getAllRowsSync().filter((row) => isIn(row.id, state.pursuedIds) && !isIn(row.id, state.rejectedIds)));
  const lines = [
    "GovDeals Helper Pursued Export",
    `Generated: ${new Date().toISOString()}`,
    `Count: ${rows.length}`,
    "",
  ];
  rows.forEach((row, index) => {
    const enrichment = getEnrichment(row);
    lines.push(`${index + 1}. ${row.title}`);
    lines.push(`URL: ${row.itemUrl || "N/A"}`);
    lines.push(`Bid: ${formatCurrency(row.currentBid)} | Effective score: ${effectiveScore(row) ?? "N/A"}`);
    lines.push(`Location: ${row.location || "Unknown"} | Distance: ${formatMiles(row.distanceMiles)}`);
    if (enrichment) {
      lines.push(`Summary: ${enrichment.summary || enrichment.rawText || "N/A"}`);
      lines.push(`Comp links: ${(enrichment.possibleSources || []).map((source) => `${source.label}${source.url ? ` (${source.url})` : ""}`).join("; ") || "None"}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

function openExportDialog() {
  exportTextEl.value = buildExportText();
  exportStatusEl.textContent = state.pursuedIds.length
    ? `${state.pursuedIds.filter((id) => !state.rejectedIds.includes(id)).length} pursued items included.`
    : "No pursued items selected yet.";
  exportDialogEl.showModal();
}

function openSettingsDialog(message = "") {
  apiKeyInputEl.value = getApiKey();
  rememberKeyCheckboxEl.checked = state.rememberKey;
  modelInputEl.value = state.model;
  settingsStatusEl.textContent = message || settingsSummaryText();
  settingsDialogEl.showModal();
}

async function copyExportText() {
  try {
    await navigator.clipboard.writeText(exportTextEl.value);
    exportStatusEl.textContent = "Export copied to clipboard.";
  } catch {
    exportStatusEl.textContent = "Clipboard copy failed on this device. Use Download instead.";
  }
}

function downloadExportText() {
  const blob = new Blob([exportTextEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `govdeals-pursued-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  exportStatusEl.textContent = "Export downloaded.";
}

function saveSettings() {
  const apiKey = apiKeyInputEl.value.trim();
  const remember = rememberKeyCheckboxEl.checked;
  const model = modelInputEl.value.trim() || "gpt-5-mini";
  setApiKey(apiKey, remember);
  state.model = model;
  localStorage.setItem(STORAGE_KEYS.model, model);
  settingsStatusEl.textContent = apiKey ? `Saved. Using ${model}.` : "No API key saved.";
  render({ preserveScroll: true });
}

function clearSettings() {
  clearApiKey();
  state.model = "gpt-5-mini";
  localStorage.setItem(STORAGE_KEYS.model, state.model);
  apiKeyInputEl.value = "";
  rememberKeyCheckboxEl.checked = false;
  modelInputEl.value = state.model;
  settingsStatusEl.textContent = "Cleared stored API key.";
  render({ preserveScroll: true });
}

async function render(options = {}) {
  const { preserveScroll = false } = options;
  const scrollY = preserveScroll ? window.scrollY : 0;
  if (!state.manifest) {
    return;
  }
  renderBuckets();
  renderChips();

  batchVisibleButtonEl.classList.toggle("busy", state.batchRun.running && state.batchRun.scope === "visible");
  batchPursuedButtonEl.classList.toggle("busy", state.batchRun.running && state.batchRun.scope === "pursued");
  batchStopButtonEl.classList.toggle("busy", state.batchRun.running);
  batchVisibleButtonEl.disabled = state.batchRun.running;
  batchPursuedButtonEl.disabled = state.batchRun.running;
  batchStopButtonEl.disabled = !state.batchRun.running;
  batchStatusEl.textContent = batchStatusText();

  const rows = sortRows(filteredRowsForCurrentBucket());
  listTitleEl.textContent = BUCKETS.find((bucket) => bucket.key === state.bucket)?.label || "Queue";
  datasetStatusEl.textContent = `Bundle generated ${state.manifest.generatedAt} | ${settingsSummaryText()}`;
  listStatsEl.textContent = `${rows.length} visible | Reviewed ${state.reviewedIds.length} | Pursued ${state.pursuedIds.length} | Holding ${state.holdingIds.length} | Rejected ${state.rejectedIds.length}`;
  renderRows(rows);

  if (preserveScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
  }
}

async function initialize() {
  try {
    await loadManifest();
    const datasetMeta = state.manifest.datasets;
    const [mainCandidates, consumerVehicles, excludedItems] = await Promise.all([
      fetch(datasetMeta.mainCandidates.path).then((response) => response.json()),
      fetch(datasetMeta.consumerVehicles.path).then((response) => response.json()),
      fetch(datasetMeta.excludedItems.path).then((response) => response.json()),
    ]);
    state.datasets.mainCandidates = mainCandidates;
    state.datasets.consumerVehicles = consumerVehicles;
    state.datasets.excludedItems = excludedItems;

    searchInputEl.addEventListener("input", () => {
      state.search = searchInputEl.value;
      render({ preserveScroll: false });
    });
    sortSelectEl.addEventListener("change", () => {
      state.sort = sortSelectEl.value;
      render({ preserveScroll: true });
    });
    batchVisibleButtonEl.addEventListener("click", () => runBatchEnrichment("visible"));
    batchPursuedButtonEl.addEventListener("click", () => runBatchEnrichment("pursued"));
    batchStopButtonEl.addEventListener("click", requestBatchStop);
    exportButtonEl.addEventListener("click", openExportDialog);
    settingsButtonEl.addEventListener("click", () => openSettingsDialog());
    saveSettingsButtonEl.addEventListener("click", saveSettings);
    clearSettingsButtonEl.addEventListener("click", clearSettings);
    copyExportButtonEl.addEventListener("click", copyExportText);
    downloadExportButtonEl.addEventListener("click", downloadExportText);

    await render();
  } catch (error) {
    datasetStatusEl.textContent = "Failed to load app bundle.";
    listStatsEl.textContent = String(error);
  }
}

initialize();
