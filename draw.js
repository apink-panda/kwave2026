const drawConfig = window.KWAVE_CONFIG || {};
const winnerStatus = document.querySelector("#winner-status");
const winnerButton = document.querySelector("#winner-draw-button");
const winnerResultButton = document.querySelector("#winner-result-button");
const winnerCount = document.querySelector("#winner-count");
const winnerReel = document.querySelector("#winner-reel");
const winnerReelCode = document.querySelector("#winner-reel-code");
const winnerPicks = document.querySelector("#winner-picks");
const winnerResults = document.querySelector("#winner-results");
const winnerResultBody = document.querySelector("#winner-result-body");
const winnerDrawnAt = document.querySelector("#winner-drawn-at");

const WINNER_COUNT = 10;
const DRAW_REQUEST_TIMEOUT_MS = 12000;
const DRAW_REEL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let winnerLoading = false;
let storedWinners = [];

initWinnerPage();

function initWinnerPage() {
  if (!winnerStatus || !winnerButton || !winnerResultButton || !winnerCount || !winnerReel || !winnerReelCode || !winnerPicks || !winnerResults || !winnerResultBody) {
    return;
  }

  winnerButton.addEventListener("click", () => revealWinners({ animate: true }));
  winnerResultButton.addEventListener("click", () => revealWinners({ animate: false }));
  loadStoredWinners();
}

async function loadStoredWinners() {
  try {
    setWinnerStatus("連線中，讀取中獎結果。");
    const payload = await requestWinnerApi("winners");
    if (payload.drawOpen === false) {
      showWinnerClosedState();
      return;
    }
    if (!payload.ok) {
      throw new Error(payload.error || "暫時無法讀取中獎結果。");
    }

    const winners = normalizeWinners(payload.winners);

    if (winners.length) {
      storedWinners = winners;
      showWinnerActionState("中獎名單已產生。");
      return;
    }

    storedWinners = [];
    showWinnerActionState("中獎名單已開放。");
  } catch (error) {
    setWinnerStatus(error.message || "暫時無法讀取中獎結果。");
  }
}

async function revealWinners({ animate }) {
  if (winnerLoading) return;

  winnerLoading = true;
  setWinnerButtonsDisabled(true);
  setWinnerButtonsHidden(true);
  winnerPicks.innerHTML = "";
  winnerResults.hidden = true;
  setWinnerCount(0);
  setWinnerStatus("抽獎系統準備中。");

  try {
    let existing = Boolean(storedWinners.length);
    let winners = storedWinners;

    if (!winners.length) {
      const payload = await requestWinnerApi("draw-winners");
      if (payload.drawOpen === false) {
        showWinnerClosedState();
        return;
      }

      if (!payload.ok) {
        throw new Error(payload.error || "抽獎失敗，請稍後再試。");
      }

      winners = normalizeWinners(payload.winners);
      storedWinners = winners;
      existing = Boolean(payload.existing);
    }

    if (!winners.length) {
      throw new Error("目前沒有可顯示的中獎名單。");
    }

    if (animate) {
      await animateWinnerDraw(winners);
    }

    showWinnerResults(winners, { existing });
  } catch (error) {
    setWinnerButtonsDisabled(false);
    setWinnerButtonsHidden(false);
    setWinnerStatus(error.message || "抽獎失敗，請稍後再試。");
  } finally {
    winnerLoading = false;
  }
}

function showWinnerClosedState() {
  storedWinners = [];
  setWinnerButtonsHidden(true);
  setWinnerButtonsDisabled(false);
  winnerResults.hidden = true;
  winnerPicks.innerHTML = "";
  winnerReel.classList.remove("is-spinning", "is-hit");
  winnerReelCode.textContent = "APINK-KWAVE";
  setWinnerCount(0);
  setWinnerStatus("尚未開放中獎名單");
}

function showWinnerActionState(message) {
  setWinnerButtonsHidden(false);
  setWinnerButtonsDisabled(false);
  winnerResults.hidden = true;
  winnerPicks.innerHTML = "";
  winnerReel.classList.remove("is-spinning", "is-hit");
  winnerReelCode.textContent = "APINK-KWAVE";
  setWinnerCount(storedWinners.length);
  setWinnerStatus(message);
}

async function animateWinnerDraw(winners) {
  winnerReel.classList.add("is-spinning");
  setWinnerStatus("中獎序號抽選中。");

  for (let index = 0; index < winners.length; index += 1) {
    await spinToWinner(winners[index], index);
    appendWinnerPick(winners[index], index);
    setWinnerCount(index + 1);
  }

  winnerReel.classList.remove("is-spinning");
  setWinnerStatus("10 位中獎序號已抽出。");
}

function spinToWinner(winner, index) {
  const duration = prefersReducedMotion ? 120 : 1100 + (index % 3) * 120;
  const tickMs = prefersReducedMotion ? 90 : 58;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const tick = window.setInterval(() => {
      winnerReelCode.textContent = randomSerialPreview();
    }, tickMs);

    window.setTimeout(() => {
      window.clearInterval(tick);
      winnerReelCode.textContent = winner.serial;
      winnerReel.classList.remove("is-hit");
      window.requestAnimationFrame(() => {
        winnerReel.classList.add("is-hit");
      });

      const elapsed = Date.now() - startedAt;
      window.setTimeout(resolve, Math.max(220, 520 - elapsed / 8));
    }, duration);
  });
}

function appendWinnerPick(winner, index) {
  const item = document.createElement("div");
  item.className = "winner-pick";
  item.innerHTML = `
    <span>${String(index + 1).padStart(2, "0")}</span>
    <strong>${escapeHtml(winner.serial)}</strong>
  `;
  winnerPicks.appendChild(item);
}

function showWinnerResults(winners, { existing }) {
  setWinnerButtonsHidden(true);
  setWinnerButtonsDisabled(false);
  winnerPicks.innerHTML = "";
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

  if (winners[0]) {
    winnerReelCode.textContent = winners[0].serial;
  }

  setWinnerCount(winners.length);
  setWinnerStatus(existing ? "已讀取固定中獎名單。" : "中獎名單已固定保存。");
  winnerResults.hidden = false;
  winnerResults.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
}

function setWinnerButtonsHidden(hidden) {
  winnerButton.hidden = hidden;
  winnerResultButton.hidden = hidden;
}

function setWinnerButtonsDisabled(disabled) {
  winnerButton.disabled = disabled;
  winnerResultButton.disabled = disabled;
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

function randomSerialPreview() {
  const number = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  let suffix = "";

  for (let index = 0; index < 6; index += 1) {
    suffix += DRAW_REEL_CHARS[Math.floor(Math.random() * DRAW_REEL_CHARS.length)];
  }

  return `APINK-KWAVE-${number}-${suffix}`;
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
