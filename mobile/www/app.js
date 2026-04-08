const state = {
  manifest: null,
  datasets: {},
  activeTab: "mainCandidates",
  reviewedOnly: false,
  search: "",
  sort: "score",
  reviewedIds: loadReviewedIds(),
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
const detailDialogEl = document.getElementById("detail-dialog");
const detailContentEl = document.getElementById("detail-content");
const cardTemplate = document.getElementById("card-template");

function loadReviewedIds() {
  try {
    return JSON.parse(localStorage.getItem("govdeals-reviewed-ids") || "[]");
  } catch {
    return [];
  }
}

function saveReviewedIds() {
  localStorage.setItem("govdeals-reviewed-ids", JSON.stringify(state.reviewedIds));
}

function toggleReviewed(id) {
  const index = state.reviewedIds.indexOf(id);
  if (index >= 0) {
    state.reviewedIds.splice(index, 1);
  } else {
    state.reviewedIds.push(id);
  }
  saveReviewedIds();
  render();
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
  if (typeof value !== "number") {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMiles(value) {
  if (typeof value !== "number") {
    return "Unknown";
  }
  return `${Math.round(value)} mi`;
}

function formatHours(value) {
  if (typeof value !== "number") {
    return "Unknown";
  }
  if (value < 24) {
    return `${Math.max(0, Math.round(value))} h`;
  }
  return `${(value / 24).toFixed(1)} d`;
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
      return left.title.localeCompare(right.title);
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
    if (!term) {
      return true;
    }
    const haystack = [
      row.title,
      row.category,
      row.state,
      row.brand,
      row.model,
      row.company,
      row.location,
      ...(row.flags || []),
    ]
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

function openListing(url) {
  if (!url) {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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
    <p>Bid ${escapeHtml(formatCurrency(row.currentBid))} | Score ${escapeHtml(String(row.score ?? "N/A"))}</p>
  `;
  wrapper.appendChild(overview);

  const logistics = document.createElement("section");
  logistics.className = "detail-block";
  logistics.innerHTML = `
    <h3>Logistics</h3>
    <p>Distance: ${escapeHtml(formatMiles(row.distanceMiles))}</p>
    <p>Weight: ${escapeHtml(typeof row.weightLbs === "number" ? `${Math.round(row.weightLbs)} lb` : "Unknown")}</p>
    <p>Ends: ${escapeHtml(row.auctionEndDisplay || row.auctionEndUtc || "Unknown")}</p>
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

  const meta = document.createElement("section");
  meta.className = "detail-block";
  meta.innerHTML = `
    <h3>Metadata</h3>
    <p>Brand/Model: ${escapeHtml([row.brand, row.model, row.modelYear].filter(Boolean).join(" ") || "Unknown")}</p>
    <p>Flags: ${escapeHtml((row.flags || []).join(", ") || "None")}</p>
    <p>Exclusion reason: ${escapeHtml(row.exclusionReason || "N/A")}</p>
  `;
  wrapper.appendChild(meta);

  const actions = document.createElement("section");
  actions.className = "detail-block";
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "details-button";
  openButton.textContent = "Open GovDeals Listing";
  openButton.addEventListener("click", () => openListing(row.itemUrl));
  actions.innerHTML = "<h3>Actions</h3>";
  actions.appendChild(openButton);
  wrapper.appendChild(actions);

  detailContentEl.appendChild(wrapper);
  detailDialogEl.showModal();
}

function renderCards(rows) {
  cardsEl.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items match the current search and review filters.";
    cardsEl.appendChild(empty);
    return;
  }

  rows.slice(0, 500).forEach((row) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const category = fragment.querySelector(".category");
    const title = fragment.querySelector(".title");
    const reviewToggle = fragment.querySelector(".review-toggle");
    const metrics = fragment.querySelector(".metrics");
    const reasons = fragment.querySelector(".reasons");
    const detailsButton = fragment.querySelector(".details-button");
    const linkButton = fragment.querySelector(".link-button");

    category.textContent = row.category || "Uncategorized";
    title.textContent = row.title || "Untitled item";

    const isReviewed = state.reviewedIds.includes(row.id);
    reviewToggle.className = `review-toggle${isReviewed ? " reviewed" : ""}`;
    reviewToggle.textContent = isReviewed ? "Reviewed" : "Mark Reviewed";
    reviewToggle.addEventListener("click", () => toggleReviewed(row.id));

    [
      `Score ${row.score ?? "N/A"}`,
      `Bid ${formatCurrency(row.currentBid)}`,
      `Distance ${formatMiles(row.distanceMiles)}`,
      `Ends ${formatHours(row.hoursToEnd)}`,
    ].forEach((text) => metrics.appendChild(metricPill(text)));

    (row.positiveReasons || []).slice(0, 2).forEach((reason) => {
      reasons.appendChild(reasonPill(reason, "positive"));
    });
    (row.negativeReasons || []).slice(0, 1).forEach((reason) => {
      reasons.appendChild(reasonPill(reason, "negative"));
    });

    detailsButton.addEventListener("click", () => renderDetail(row));
    linkButton.href = row.itemUrl || "#";
    linkButton.addEventListener("click", (event) => {
      event.preventDefault();
      openListing(row.itemUrl);
    });

    cardsEl.appendChild(fragment);
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function render() {
  if (!state.manifest) {
    return;
  }
  renderTabs();
  reviewedFilterEl.textContent = state.reviewedOnly ? "Reviewed Only" : "All Items";
  reviewedFilterEl.classList.toggle("active", state.reviewedOnly);

  const rows = await loadDataset(state.activeTab);
  const filtered = sortRows(filterRows(rows));
  const reviewedCount = rows.filter((row) => state.reviewedIds.includes(row.id)).length;
  const tabLabel = tabs.find((tab) => tab.key === state.activeTab)?.label || state.activeTab;
  datasetStatusEl.textContent = `Bundle generated ${state.manifest.generatedAt}`;
  listStatsEl.textContent = `${tabLabel}: ${filtered.length} shown of ${rows.length} | Reviewed ${reviewedCount}`;
  renderCards(filtered);
}

async function initialize() {
  try {
    await loadManifest();
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
    await render();
  } catch (error) {
    datasetStatusEl.textContent = "Failed to load mobile bundle.";
    listStatsEl.textContent = String(error);
  }
}

initialize();
