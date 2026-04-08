const STORAGE_KEYS = {
  reviewed: "govdeals-reviewed-ids",
  pursued: "govdeals-pursued-ids",
  enrichments: "govdeals-enrichments",
  apiKey: "govdeals-openai-api-key",
  rememberKey: "govdeals-openai-remember-key",
  model: "govdeals-openai-model",
};

const state = {
  manifest: null,
  datasets: {},
  activeTab: "mainCandidates",
  reviewedOnly: false,
  pursuedOnly: false,
  search: "",
  sort: "score",
  reviewedIds: loadArray(STORAGE_KEYS.reviewed),
  pursuedIds: loadArray(STORAGE_KEYS.pursued),
  enrichments: loadObject(STORAGE_KEYS.enrichments),
  rememberKey: localStorage.getItem(STORAGE_KEYS.rememberKey) === "true",
  model: localStorage.getItem(STORAGE_KEYS.model) || "gpt-5-mini",
  sessionApiKey: "",
  loadingEnrichmentIds: [],
};

const tabs = [
  { key: "mainCandidates", label: "Main Candidates" },
  { key: "consumerVehicles", label: "Vehicles" },
  { key: "excludedItems", label: "Excluded" },
];

const cardsEl = document.getElementById("cards");
const tabsEl = document.getElementById("tabs");
const datasetStatusEl = document.getElementById("dataset-status");
const listStatsEl = document.getElementById("list-stats");
const searchInputEl = document.getElementById("search-input");
const sortSelectEl = document.getElementById("sort-select");
const reviewedFilterEl = document.getElementById("reviewed-filter");
const pursuedFilterEl = document.getElementById("pursued-filter");
const exportButtonEl = document.getElementById("export-button");
const settingsButtonEl = document.getElementById("settings-button");
const detailDialogEl = document.getElementById("detail-dialog");
const detailContentEl = document.getElementById("detail-content");
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
const cardTemplate = document.getElementById("card-template");

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
  if (state.rememberKey) {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  }
  return state.sessionApiKey;
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
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  localStorage.removeItem(STORAGE_KEYS.rememberKey);
  state.rememberKey = false;
}

function hasApiKey() {
  return Boolean(getApiKey());
}

function toggleId(collection, id) {
  const index = collection.indexOf(id);
  if (index >= 0) {
    collection.splice(index, 1);
  } else {
    collection.push(id);
  }
}

function toggleReviewed(id) {
  toggleId(state.reviewedIds, id);
  saveArray(STORAGE_KEYS.reviewed, state.reviewedIds);
  render();
}

function togglePursued(id) {
  toggleId(state.pursuedIds, id);
  saveArray(STORAGE_KEYS.pursued, state.pursuedIds);
  render();
}

function setLoading(id, loading) {
  const hasId = state.loadingEnrichmentIds.includes(id);
  if (loading && !hasId) {
    state.loadingEnrichmentIds.push(id);
  }
  if (!loading && hasId) {
    state.loadingEnrichmentIds = state.loadingEnrichmentIds.filter((entry) => entry !== id);
  }
  render();
}

function isLoading(id) {
  return state.loadingEnrichmentIds.includes(id);
}

async function loadManifest() {
  const response = await fetch("data/manifest.json");
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  state.manifest = await response.json();
}

async function loadDataset(tabKey) {
  if (state.datasets[tabKey]) {
    return state.datasets[tabKey];
  }
  const datasetMeta = state.manifest.datasets[tabKey];
  const response = await fetch(datasetMeta.path);
  if (!response.ok) {
    throw new Error(`Failed to load dataset ${tabKey}: ${response.status}`);
  }
  const rows = await response.json();
  state.datasets[tabKey] = rows;
  return rows;
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

function getEnrichment(row) {
  return state.enrichments[row.id] || null;
}

function effectiveScore(row) {
  const enrichment = getEnrichment(row);
  if (enrichment && typeof enrichment.updatedScore === "number") {
    return enrichment.updatedScore;
  }
  if (enrichment && typeof enrichment.scoreAdjustment === "number" && typeof row.score === "number") {
    return row.score + enrichment.scoreAdjustment;
  }
  return row.score;
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

function filterRows(rows) {
  const term = state.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (state.reviewedOnly && !state.reviewedIds.includes(row.id)) {
      return false;
    }
    if (state.pursuedOnly && !state.pursuedIds.includes(row.id)) {
      return false;
    }
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
      ...(row.flags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function renderTabs() {
  tabsEl.replaceChildren();
  tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${state.activeTab === tab.key ? " active" : ""}`;
    const count = state.manifest?.counts?.[tab.key] ?? 0;
    button.textContent = `${tab.label} (${count})`;
    button.addEventListener("click", async () => {
      state.activeTab = tab.key;
      await render();
    });
    tabsEl.appendChild(button);
  });
}

function metricPill(text) {
  const el = document.createElement("span");
  el.className = "pill";
  el.textContent = text;
  return el;
}

function reasonPill(text, kind) {
  const el = document.createElement("span");
  el.className = `pill ${kind}`;
  el.textContent = text;
  return el;
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
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function openListing(url) {
  if (!url) {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function settingsSummaryText() {
  if (!hasApiKey()) {
    return "Codex enrichment is not configured yet.";
  }
  return `Codex ready with ${state.model}.`;
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
    if (key === "text" && typeof value === "string") {
      values.push(value);
      continue;
    }
    if (key === "output_text" && typeof value === "string") {
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
  const strings = collectStrings(payload, []).filter((entry) => entry.trim());
  return strings.join("\n").trim();
}

function sanitizeEnrichment(raw, row) {
  const currentBid = normalizeNumber(row.currentBid);
  const scoreAdjustment = normalizeNumber(raw.scoreAdjustment);
  const updatedScore = normalizeNumber(raw.updatedScore);
  const resaleLow = normalizeNumber(raw.estimatedResaleLow);
  const resaleHigh = normalizeNumber(raw.estimatedResaleHigh);
  const profitLow = normalizeNumber(raw.estimatedProfitLow);
  const profitHigh = normalizeNumber(raw.estimatedProfitHigh);

  return {
    enrichedAt: new Date().toISOString(),
    summary: String(raw.summary || "").trim(),
    listingSignals: Array.isArray(raw.listingSignals) ? raw.listingSignals.map(String) : [],
    compSignals: Array.isArray(raw.compSignals) ? raw.compSignals.map(String) : [],
    riskSignals: Array.isArray(raw.riskSignals) ? raw.riskSignals.map(String) : [],
    possibleSources: Array.isArray(raw.possibleSources) ? raw.possibleSources.map(String) : [],
    confidence: String(raw.confidence || "").trim(),
    recommendation: String(raw.recommendation || "").trim(),
    scoreAdjustment,
    updatedScore: updatedScore ?? (typeof currentBid === "number" && typeof scoreAdjustment === "number" && typeof row.score === "number"
      ? row.score + scoreAdjustment
      : null),
    estimatedResaleLow: resaleLow,
    estimatedResaleHigh: resaleHigh,
    estimatedProfitLow: profitLow,
    estimatedProfitHigh: profitHigh,
    rawText: String(raw.rawText || "").trim(),
  };
}

function buildEnrichmentPrompt(row) {
  const existing = getEnrichment(row);
  return `
You are helping evaluate a GovDeals listing for resale profit and ease of flip.

Return strict JSON only with these keys:
summary, listingSignals, compSignals, riskSignals, possibleSources, confidence, recommendation, scoreAdjustment, updatedScore, estimatedResaleLow, estimatedResaleHigh, estimatedProfitLow, estimatedProfitHigh, rawText

Rules:
- listingSignals, compSignals, riskSignals, possibleSources must be arrays of short strings
- scoreAdjustment should be between -30 and 30
- updatedScore should be the revised total score for this item
- estimate profit using current bid only, not taxes or transport fine-tuning
- use web search for comps when useful
- if exact comps are weak, say so and lower confidence
- rawText should be a concise plain-English note for the human reviewer
- do not include markdown fences

Listing data:
${JSON.stringify(
    {
      title: row.title,
      category: row.category,
      company: row.company,
      location: row.location,
      state: row.state,
      zip: row.zip,
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
      previousEnrichment: existing || null,
    },
    null,
    2,
  )}
`.trim();
}

async function runEnrichment(row) {
  if (!hasApiKey()) {
    openSettingsDialog("Enter an OpenAI API key before running Codex enrichment.");
    return;
  }

  setLoading(row.id, true);
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
    await render();

    if (detailDialogEl.open) {
      renderDetail(row);
    }
  } catch (error) {
    if (detailDialogEl.open) {
      const errorBlock = document.createElement("section");
      errorBlock.className = "detail-block";
      errorBlock.innerHTML = `<h3>Enrichment Error</h3><p>${escapeHtml(String(error))}</p>`;
      detailContentEl.prepend(errorBlock);
    } else {
      datasetStatusEl.textContent = `Enrichment failed: ${String(error)}`;
    }
  } finally {
    setLoading(row.id, false);
  }
}

function renderEnrichmentBlock(row) {
  const enrichment = getEnrichment(row);
  const section = document.createElement("section");
  section.className = "detail-block";
  const buttonLabel = hasApiKey() ? (isLoading(row.id) ? "Enriching..." : "Run Codex Enrichment") : "Configure Codex";
  section.innerHTML = `
    <div class="enrichment-header">
      <h3>Codex Enrichment</h3>
      <span class="supporting-text">${escapeHtml(settingsSummaryText())}</span>
    </div>
  `;

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = `enrich-button${isLoading(row.id) ? " loading" : ""}`;
  actionButton.textContent = buttonLabel;
  actionButton.disabled = isLoading(row.id);
  actionButton.addEventListener("click", () => {
    if (!hasApiKey()) {
      openSettingsDialog("Enter an OpenAI API key before running Codex enrichment.");
      return;
    }
    runEnrichment(row);
  });
  section.appendChild(actionButton);

  if (!enrichment) {
    const note = document.createElement("p");
    note.className = "supporting-text";
    note.textContent = "No enrichment saved for this item yet.";
    section.appendChild(note);
    return section;
  }

  const summary = document.createElement("p");
  summary.textContent = enrichment.summary || enrichment.rawText || "No summary returned.";
  section.appendChild(summary);

  const metrics = document.createElement("div");
  metrics.className = "metrics";
  metrics.appendChild(metricPill(`Updated Score ${enrichment.updatedScore ?? "N/A"}`));
  metrics.appendChild(metricPill(`Profit ${formatCurrency(enrichment.estimatedProfitLow)} to ${formatCurrency(enrichment.estimatedProfitHigh)}`));
  metrics.appendChild(metricPill(`Resale ${formatCurrency(enrichment.estimatedResaleLow)} to ${formatCurrency(enrichment.estimatedResaleHigh)}`));
  if (enrichment.confidence) {
    metrics.appendChild(metricPill(`Confidence ${enrichment.confidence}`));
  }
  section.appendChild(metrics);

  const reasons = document.createElement("div");
  reasons.className = "enrichment-reasons";
  enrichment.compSignals.slice(0, 3).forEach((reason) => reasons.appendChild(reasonPill(reason, "positive")));
  enrichment.riskSignals.slice(0, 2).forEach((reason) => reasons.appendChild(reasonPill(reason, "negative")));
  section.appendChild(reasons);

  const list = document.createElement("ul");
  const items = [
    ...enrichment.listingSignals.map((value) => `Listing: ${value}`),
    ...enrichment.possibleSources.map((value) => `Source: ${value}`),
  ];
  if (!items.length && enrichment.recommendation) {
    items.push(`Recommendation: ${enrichment.recommendation}`);
  }
  list.innerHTML = items.map((value) => `<li>${escapeHtml(value)}</li>`).join("") || "<li>No structured details returned.</li>";
  section.appendChild(list);
  return section;
}

function renderDetail(row) {
  detailContentEl.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "detail-grid";

  const overview = document.createElement("section");
  overview.className = "detail-block";
  overview.innerHTML = `
    <h3>Overview</h3>
    <p><strong>${escapeHtml(row.title)}</strong></p>
    <p>${escapeHtml(row.category || "Unknown category")}</p>
    <p>${escapeHtml(row.location || "Unknown location")}</p>
    <p>Bid ${escapeHtml(formatCurrency(row.currentBid))} | Score ${escapeHtml(String(row.score ?? "N/A"))} | Effective ${escapeHtml(String(effectiveScore(row) ?? "N/A"))}</p>
  `;
  wrapper.appendChild(overview);

  const logistics = document.createElement("section");
  logistics.className = "detail-block";
  logistics.innerHTML = `
    <h3>Logistics</h3>
    <p>Distance: ${escapeHtml(formatMiles(row.distanceMiles))}</p>
    <p>Weight: ${escapeHtml(typeof row.weightLbs === "number" ? `${Math.round(row.weightLbs)} lb` : "Unknown")}</p>
    <p>Ends: ${escapeHtml(row.auctionEndDisplay || row.auctionEndUtc || "Unknown")}</p>
    <p>Bid count: ${escapeHtml(String(row.bidCount ?? "Unknown"))}</p>
  `;
  wrapper.appendChild(logistics);

  const positive = document.createElement("section");
  positive.className = "detail-block";
  positive.innerHTML = `<h3>Positive Reasons</h3><ul>${(row.positiveReasons || [])
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("") || "<li>None</li>"}</ul>`;
  wrapper.appendChild(positive);

  const negative = document.createElement("section");
  negative.className = "detail-block";
  negative.innerHTML = `<h3>Negative Reasons</h3><ul>${(row.negativeReasons || [])
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("") || "<li>None</li>"}</ul>`;
  wrapper.appendChild(negative);

  const description = document.createElement("section");
  description.className = "detail-block";
  description.innerHTML = `
    <h3>Listing Description</h3>
    <pre>${escapeHtml(row.longDescription || "No long description in bundle.")}</pre>
  `;
  wrapper.appendChild(description);

  const meta = document.createElement("section");
  meta.className = "detail-block";
  meta.innerHTML = `
    <h3>Metadata</h3>
    <p>Brand/Model: ${escapeHtml([row.brand, row.model, row.modelYear].filter(Boolean).join(" ") || "Unknown")}</p>
    <p>Flags: ${escapeHtml((row.flags || []).join(", ") || "None")}</p>
    <p>Exclusion reason: ${escapeHtml(row.exclusionReason || "N/A")}</p>
  `;
  wrapper.appendChild(meta);

  wrapper.appendChild(renderEnrichmentBlock(row));

  const actions = document.createElement("section");
  actions.className = "detail-block";
  actions.innerHTML = "<h3>Actions</h3>";

  const actionRow = document.createElement("div");
  actionRow.className = "inline-actions";

  const pursueButton = document.createElement("button");
  pursueButton.type = "button";
  pursueButton.className = state.pursuedIds.includes(row.id) ? "pursue-toggle pursued" : "pursue-toggle";
  pursueButton.textContent = state.pursuedIds.includes(row.id) ? "Pursued" : "Pursue";
  pursueButton.addEventListener("click", () => {
    togglePursued(row.id);
    renderDetail(row);
  });
  actionRow.appendChild(pursueButton);

  const reviewButton = document.createElement("button");
  reviewButton.type = "button";
  reviewButton.className = state.reviewedIds.includes(row.id) ? "review-toggle reviewed" : "review-toggle";
  reviewButton.textContent = state.reviewedIds.includes(row.id) ? "Reviewed" : "Mark Reviewed";
  reviewButton.addEventListener("click", () => {
    toggleReviewed(row.id);
    renderDetail(row);
  });
  actionRow.appendChild(reviewButton);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "details-button";
  openButton.textContent = "Open GovDeals Listing";
  openButton.addEventListener("click", () => openListing(row.itemUrl));
  actionRow.appendChild(openButton);
  actions.appendChild(actionRow);
  wrapper.appendChild(actions);

  detailContentEl.appendChild(wrapper);
  detailDialogEl.showModal();
}

function renderCards(rows) {
  cardsEl.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items match the current search and filter state.";
    cardsEl.appendChild(empty);
    return;
  }

  rows.slice(0, 500).forEach((row) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const category = fragment.querySelector(".category");
    const title = fragment.querySelector(".title");
    const pursueToggle = fragment.querySelector(".pursue-toggle");
    const reviewToggle = fragment.querySelector(".review-toggle");
    const metrics = fragment.querySelector(".metrics");
    const reasons = fragment.querySelector(".reasons");
    const detailsButton = fragment.querySelector(".details-button");
    const enrichButton = fragment.querySelector(".enrich-button");
    const linkButton = fragment.querySelector(".link-button");

    category.textContent = row.category || "Uncategorized";
    title.textContent = row.title || "Untitled item";

    const pursued = state.pursuedIds.includes(row.id);
    pursueToggle.className = `pursue-toggle${pursued ? " pursued" : ""}`;
    pursueToggle.textContent = pursued ? "Pursued" : "Pursue";
    pursueToggle.addEventListener("click", () => togglePursued(row.id));

    const reviewed = state.reviewedIds.includes(row.id);
    reviewToggle.className = `review-toggle${reviewed ? " reviewed" : ""}`;
    reviewToggle.textContent = reviewed ? "Reviewed" : "Review";
    reviewToggle.addEventListener("click", () => toggleReviewed(row.id));

    const enrichment = getEnrichment(row);
    [
      `Score ${row.score ?? "N/A"}`,
      `Bid ${formatCurrency(row.currentBid)}`,
      `Distance ${formatMiles(row.distanceMiles)}`,
      `Ends ${formatHours(row.hoursToEnd)}`,
    ].forEach((text) => metrics.appendChild(metricPill(text)));
    if (enrichment) {
      metrics.appendChild(metricPill(`Codex ${effectiveScore(row) ?? "N/A"}`));
      if (typeof enrichment.estimatedProfitHigh === "number") {
        metrics.appendChild(metricPill(`Profit ${formatCurrency(enrichment.estimatedProfitHigh)}`));
      }
    }

    (row.positiveReasons || []).slice(0, 2).forEach((reason) => {
      reasons.appendChild(reasonPill(reason, "positive"));
    });
    if (enrichment?.summary) {
      reasons.appendChild(reasonPill(truncateText(enrichment.summary), "positive"));
    } else {
      (row.negativeReasons || []).slice(0, 1).forEach((reason) => {
        reasons.appendChild(reasonPill(reason, "negative"));
      });
    }

    detailsButton.addEventListener("click", () => renderDetail(row));
    enrichButton.className = `enrich-button ghost-button${isLoading(row.id) ? " loading" : ""}`;
    enrichButton.textContent = isLoading(row.id) ? "Enriching..." : enrichment ? "Re-enrich" : "Enrich";
    enrichButton.disabled = isLoading(row.id);
    enrichButton.addEventListener("click", () => runEnrichment(row));
    linkButton.href = row.itemUrl || "#";
    linkButton.addEventListener("click", (event) => {
      event.preventDefault();
      openListing(row.itemUrl);
    });

    cardsEl.appendChild(fragment);
  });
}

function getAllRowsSync() {
  return Object.values(state.datasets).flat();
}

function buildExportText() {
  const allRows = getAllRowsSync().filter((row) => state.pursuedIds.includes(row.id));
  const sorted = sortRows(allRows);
  const lines = [];
  lines.push(`GovDeals Helper Pursued Export`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Count: ${sorted.length}`);
  lines.push("");
  sorted.forEach((row, index) => {
    const enrichment = getEnrichment(row);
    lines.push(`${index + 1}. ${row.title}`);
    lines.push(`Bucket: ${row.bucket}`);
    lines.push(`URL: ${row.itemUrl || "N/A"}`);
    lines.push(`Bid: ${formatCurrency(row.currentBid)} | Base score: ${row.score ?? "N/A"} | Effective score: ${effectiveScore(row) ?? "N/A"}`);
    lines.push(`Location: ${row.location || "Unknown"} | Distance: ${formatMiles(row.distanceMiles)}`);
    lines.push(`Category: ${row.category || "Unknown"} | Brand/Model: ${[row.brand, row.model, row.modelYear].filter(Boolean).join(" ") || "Unknown"}`);
    if (enrichment) {
      lines.push(`Codex summary: ${enrichment.summary || enrichment.rawText || "N/A"}`);
      lines.push(`Profit estimate: ${formatCurrency(enrichment.estimatedProfitLow)} to ${formatCurrency(enrichment.estimatedProfitHigh)}`);
      lines.push(`Comp signals: ${(enrichment.compSignals || []).join("; ") || "None"}`);
      lines.push(`Risk signals: ${(enrichment.riskSignals || []).join("; ") || "None"}`);
      lines.push(`Sources: ${(enrichment.possibleSources || []).join("; ") || "None"}`);
    }
    lines.push(`Positive reasons: ${(row.positiveReasons || []).join("; ") || "None"}`);
    lines.push(`Negative reasons: ${(row.negativeReasons || []).join("; ") || "None"}`);
    lines.push("");
  });
  return lines.join("\n");
}

function openExportDialog() {
  exportTextEl.value = buildExportText();
  exportStatusEl.textContent = state.pursuedIds.length
    ? `${state.pursuedIds.length} pursued items included.`
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
  settingsStatusEl.textContent = apiKey
    ? `Saved. Using ${model}.`
    : "No API key saved.";
  render();
}

function clearSettings() {
  clearApiKey();
  state.model = "gpt-5-mini";
  localStorage.setItem(STORAGE_KEYS.model, state.model);
  apiKeyInputEl.value = "";
  rememberKeyCheckboxEl.checked = false;
  modelInputEl.value = state.model;
  settingsStatusEl.textContent = "Cleared stored API key.";
  render();
}

async function render() {
  if (!state.manifest) {
    return;
  }
  renderTabs();

  reviewedFilterEl.textContent = state.reviewedOnly ? "Reviewed Only" : "All Review State";
  reviewedFilterEl.classList.toggle("active", state.reviewedOnly);
  pursuedFilterEl.textContent = state.pursuedOnly ? "Pursued Only" : "All Results";
  pursuedFilterEl.classList.toggle("active", state.pursuedOnly);

  const rows = await loadDataset(state.activeTab);
  const filtered = sortRows(filterRows(rows));
  const reviewedCount = rows.filter((row) => state.reviewedIds.includes(row.id)).length;
  const pursuedCount = rows.filter((row) => state.pursuedIds.includes(row.id)).length;
  const enrichedCount = rows.filter((row) => Boolean(getEnrichment(row))).length;
  const tabLabel = tabs.find((tab) => tab.key === state.activeTab)?.label || state.activeTab;
  datasetStatusEl.textContent = `Bundle generated ${state.manifest.generatedAt} | ${settingsSummaryText()}`;
  listStatsEl.textContent = `${tabLabel}: ${filtered.length} shown of ${rows.length} | Reviewed ${reviewedCount} | Pursued ${pursuedCount} | Enriched ${enrichedCount}`;
  renderCards(filtered);
}

async function initialize() {
  try {
    await loadManifest();
    await Promise.all(tabs.map((tab) => loadDataset(tab.key)));
    renderTabs();
    searchInputEl.addEventListener("input", async (event) => {
      state.search = event.target.value;
      await render();
    });
    sortSelectEl.addEventListener("change", async (event) => {
      state.sort = event.target.value;
      await render();
    });
    reviewedFilterEl.addEventListener("click", async () => {
      state.reviewedOnly = !state.reviewedOnly;
      await render();
    });
    pursuedFilterEl.addEventListener("click", async () => {
      state.pursuedOnly = !state.pursuedOnly;
      await render();
    });
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
