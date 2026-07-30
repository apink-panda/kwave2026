const drawConfig = window.KWAVE_CONFIG || {};
const winnerStatus = document.querySelector("#winner-status");
const winnerCount = document.querySelector("#winner-count");
const winnerReel = document.querySelector("#winner-reel");
const winnerReelCode = document.querySelector("#winner-reel-code");
const winnerResults = document.querySelector("#winner-results");
const winnerResultBody = document.querySelector("#winner-result-body");
const winnerDrawnAt = document.querySelector("#winner-drawn-at");

const WINNER_COUNT = 10;
const DRAW_REQUEST_TIMEOUT_MS = 12000;

initWinnerPage();

function initWinnerPage() {
  if (!winnerStatus || !winnerCount || !winnerReel || !winnerReelCode || !winnerResults || !winnerResultBody) {
    return;
  }

  loadWinnerResults();
}

async function loadWinnerResults() {
  try {
    setWinnerStatus("連線中，讀取中獎結果。");
    let payload = await requestWinnerApi("winners");

    if (payload.drawOpen === false) {
      showWinnerClosedState();
      return;
    }
    if (!payload.ok) {
      throw new Error(payload.error || "暫時無法讀取中獎結果。");
    }

    let winners = normalizeWinners(payload.winners);
    let existing = true;

    if (!winners.length) {
      setWinnerStatus("中獎名單產生中。");
      payload = await requestWinnerApi("draw-winners");

      if (payload.drawOpen === false) {
        showWinnerClosedState();
        return;
      }
      if (!payload.ok) {
        throw new Error(payload.error || "抽獎失敗，請稍後再試。");
      }

      winners = normalizeWinners(payload.winners);
      existing = Boolean(payload.existing);
    }

    if (!winners.length) {
      throw new Error("目前沒有可顯示的中獎名單。");
    }

    showWinnerResults(winners, { existing });
  } catch (error) {
    showWinnerError(error.message || "暫時無法讀取中獎結果。");
  }
}

function showWinnerClosedState() {
  winnerResults.hidden = true;
  winnerReelCode.textContent = "APINK-KWAVE";
  setWinnerCount(0);
  setWinnerStatus("尚未開放中獎名單");
}

function showWinnerError(message) {
  winnerResults.hidden = true;
  winnerReelCode.textContent = "APINK-KWAVE";
  setWinnerCount(0);
  setWinnerStatus(message);
}

function showWinnerResults(winners, { existing }) {
  winnerResultBody.innerHTML = winners.map((winner, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(winner.serial)}</strong></td>
      <td>中獎</td>
    </tr>
  `).join("");

  const firstDrawnAt = winners.find((winner) => winner.drawnAt)?.drawnAt || "";
  if (winnerDrawnAt) {
    winnerDrawnAt.textContent = firstDrawnAt ? `抽出時間 ${firstDrawnAt}` : "";
  }

  winnerReelCode.textContent = "中獎結果";
  setWinnerCount(winners.length);
  setWinnerStatus(existing ? "已讀取固定中獎名單。" : "中獎名單已固定保存。");
  winnerResults.hidden = false;
  winnerResults.scrollIntoView({ behavior: "auto", block: "start" });
}

function requestWinnerApi(action) {
  const appsScriptUrl = String(drawConfig.appsScriptUrl || "").trim();
  if (!appsScriptUrl) {
    return Promise.reject(new Error("抽獎系統尚未設定。"));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `__kwaveWinner${Date.now()}${Math.floor(Math.random() * 1000)}`;
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
      settle(reject, new Error("抽獎系統連線逾時。"));
    }, DRAW_REQUEST_TIMEOUT_MS);

    window[callbackName] = (payload) => {
      settle(resolve, payload || {});
    };

    script.src = `${appsScriptUrl}${separator}action=${encodeURIComponent(action)}&callback=${encodeURIComponent(callbackName)}`;
    script.async = true;
    script.onerror = () => {
      settle(reject, new Error("暫時無法連線抽獎系統。"));
    };

    document.head.appendChild(script);
  });
}

function normalizeWinners(winners) {
  return Array.isArray(winners)
    ? winners.map((winner) => ({
      serial: sanitizeWinnerText(winner && winner.serial, 80),
      drawnAt: sanitizeWinnerText(winner && winner.drawnAt, 40),
    })).filter((winner) => winner.serial).slice(0, WINNER_COUNT)
    : [];
}

function setWinnerStatus(message) {
  winnerStatus.textContent = message;
}

function setWinnerCount(count) {
  winnerCount.textContent = `${Math.min(count, WINNER_COUNT)}/${WINNER_COUNT}`;
}

function sanitizeWinnerText(value, maxLength = 80) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
