const statsConfig = window.KWAVE_CONFIG || {};
const statsStatus = document.querySelector("#stats-status");
const statsTotal = document.querySelector("#stats-total");
const statsUpdated = document.querySelector("#stats-updated");

const STATS_REQUEST_TIMEOUT_MS = 12000;
const STATS_RANK_LIMIT = 12;
const STATS_SECTIONS = [
  {
    key: "favoriteSong",
    title: "最多人喜愛的歌曲",
    emptyText: "目前尚無歌曲統計資料。",
    maxLength: 80,
  },
  {
    key: "entryTime",
    title: "最多人入坑時間",
    emptyText: "目前尚無入坑時間統計資料。",
    maxLength: 80,
  },
  {
    key: "supportMoment",
    title: "入坑理由排行",
    emptyText: "目前尚無入坑理由統計資料。",
    maxLength: 120,
  },
];

initStatsPage();

function initStatsPage() {
  if (!statsStatus || !statsTotal || !statsUpdated) {
    return;
  }

  loadStats();
}

async function loadStats() {
  try {
    setStatsStatus("連線中，讀取統計排行。");
    const payload = await requestStatsApi();

    if (!payload.ok) {
      throw new Error(payload.error || "暫時無法讀取統計排行。");
    }

    renderStats(normalizeStats(payload.stats));
  } catch (error) {
    showStatsError(error.message || "暫時無法讀取統計排行。");
  }
}

function requestStatsApi() {
  const appsScriptUrl = String(statsConfig.appsScriptUrl || "").trim();
  if (!appsScriptUrl) {
    return Promise.reject(new Error("統計系統尚未設定。"));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `__kwaveStats${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const separator = appsScriptUrl.includes("?") ? "&" : "?";
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete window[callbackName];
    };

    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };

    const timeoutId = window.setTimeout(() => {
      settle(reject, new Error("統計系統連線逾時。"));
    }, STATS_REQUEST_TIMEOUT_MS);

    window[callbackName] = (payload) => {
      settle(resolve, payload || {});
    };

    script.src = `${appsScriptUrl}${separator}action=stats&callback=${encodeURIComponent(callbackName)}`;
    script.async = true;
    script.onerror = () => {
      settle(reject, new Error("暫時無法連線統計系統。"));
    };

    document.head.appendChild(script);
  });
}

function normalizeStats(stats) {
  const rawStats = stats && typeof stats === "object" ? stats : {};
  const sectionMap = new Map();

  if (Array.isArray(rawStats.sections)) {
    rawStats.sections.forEach((section) => {
      const normalizedSection = normalizeStatsSection(section);
      if (normalizedSection) {
        sectionMap.set(normalizedSection.key, normalizedSection);
      }
    });
  }

  return {
    totalEligible: normalizeCount(rawStats.totalEligible),
    generatedAt: sanitizeStatsText(rawStats.generatedAt, 40),
    sections: STATS_SECTIONS.map((fallback) => sectionMap.get(fallback.key) || {
      ...fallback,
      total: 0,
      items: [],
    }),
  };
}

function normalizeStatsSection(section) {
  if (!section || typeof section !== "object") {
    return null;
  }

  const fallback = STATS_SECTIONS.find((item) => item.key === section.key);
  if (!fallback) {
    return null;
  }

  const items = Array.isArray(section.items)
    ? section.items.map((item, index) => normalizeRankItem(item, index, fallback.maxLength)).filter(Boolean)
    : [];

  return {
    ...fallback,
    total: normalizeCount(section.total),
    items: items.slice(0, STATS_RANK_LIMIT),
  };
}

function normalizeRankItem(item, index, maxLength) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const label = sanitizeStatsText(item.label, maxLength);
  const count = normalizeCount(item.count);
  if (!label || !count) {
    return null;
  }

  return {
    rank: normalizeCount(item.rank) || index + 1,
    label,
    count,
    percent: clampPercent(item.percent),
  };
}

function renderStats(stats) {
  statsTotal.textContent = `${stats.totalEligible} 筆有效回覆`;
  statsUpdated.textContent = stats.generatedAt ? `更新 ${stats.generatedAt}` : "已更新";

  stats.sections.forEach(renderStatsSection);
  setStatsStatus("統計排行已更新。");
}

function renderStatsSection(section) {
  const sectionElement = document.querySelector(`[data-stats-section="${section.key}"]`);
  const titleElement = sectionElement ? sectionElement.querySelector("h2") : null;
  const listElement = document.querySelector(`[data-stats-list="${section.key}"]`);
  if (!listElement) return;

  if (titleElement) {
    titleElement.textContent = section.title;
  }

  listElement.replaceChildren();
  if (!section.items.length) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = section.emptyText;
    listElement.appendChild(empty);
    return;
  }

  section.items.forEach((item) => {
    listElement.appendChild(createRankElement(item));
  });
}

function createRankElement(item) {
  const rank = document.createElement("div");
  rank.className = "stats-rank";

  const number = document.createElement("span");
  number.className = "stats-rank__number";
  number.textContent = String(item.rank).padStart(2, "0");

  const body = document.createElement("div");
  body.className = "stats-rank__body";

  const label = document.createElement("strong");
  label.textContent = item.label;
  label.title = item.label;

  const bar = document.createElement("div");
  bar.className = "stats-rank__bar";

  const fill = document.createElement("span");
  fill.style.width = `${Math.max(6, item.percent)}%`;
  bar.appendChild(fill);

  body.append(label, bar);

  const count = document.createElement("em");
  count.textContent = `${item.count} 票 · ${formatPercent(item.percent)}%`;

  rank.append(number, body, count);
  return rank;
}

function showStatsError(message) {
  statsTotal.textContent = "--";
  statsUpdated.textContent = "讀取失敗";
  STATS_SECTIONS.forEach((section) => {
    const listElement = document.querySelector(`[data-stats-list="${section.key}"]`);
    if (!listElement) return;

    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = message;
    listElement.replaceChildren(empty);
  });
  setStatsStatus(message);
}

function setStatsStatus(message) {
  statsStatus.textContent = message;
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.min(100, Math.round(number * 10) / 10);
}

function formatPercent(value) {
  const rounded = clampPercent(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function sanitizeStatsText(value, maxLength = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
