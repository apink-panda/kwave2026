const flipCard = document.querySelector("#flip-card");
const flipHint = document.querySelector("#flip-hint");
const currentSide = document.querySelector("#current-side");
const sideDots = document.querySelectorAll("[data-side]");

const fanSides = {
  front: {
    label: "INFINITY NIGHT",
    aria: "翻轉扇面，目前顯示夢幻晚霞款",
  },
  back: {
    label: "SUNNY BEACH",
    aria: "翻轉扇面，目前顯示晴空海灘款",
  },
};

function updateFanSide(nextSide) {
  if (!flipCard || !fanSides[nextSide]) return;

  const isBack = nextSide === "back";
  flipCard.classList.toggle("is-flipped", isBack);
  flipCard.setAttribute("aria-pressed", String(isBack));
  flipCard.setAttribute("aria-label", fanSides[nextSide].aria);

  if (currentSide) currentSide.textContent = fanSides[nextSide].label;

  sideDots.forEach((dot) => {
    const isActive = dot.dataset.side === nextSide;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", String(isActive));
  });
}

if (flipCard) {
  const toggleFanSide = () => {
    updateFanSide(flipCard.classList.contains("is-flipped") ? "front" : "back");
  };

  flipCard.addEventListener("click", toggleFanSide);
  if (flipHint) flipHint.addEventListener("click", toggleFanSide);

  sideDots.forEach((dot) => {
    dot.addEventListener("click", () => updateFanSide(dot.dataset.side));
  });

  updateFanSide("front");
}

const heroScene = document.querySelector("#hero-scene");
const currentScene = document.querySelector("#current-scene");
const sceneButtons = document.querySelectorAll("[data-scene-choice]");

if (heroScene && currentScene && sceneButtons.length) {
  const scenes = {
    night: {
      label: "INFINITY NIGHT",
      aria: "目前顯示夜晚主視覺",
    },
    day: {
      label: "SUNNY BEACH",
      aria: "目前顯示白天主視覺",
    },
  };

  function updateScene(nextScene) {
    const scene = scenes[nextScene] ? nextScene : "night";

    heroScene.dataset.scene = scene;
    heroScene.setAttribute("aria-label", scenes[scene].aria);
    currentScene.textContent = scenes[scene].label;

    sceneButtons.forEach((button) => {
      const isActive = button.dataset.sceneChoice === scene;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      button.setAttribute("aria-current", String(isActive));
    });
  }

  sceneButtons.forEach((button) => {
    button.addEventListener("click", () => {
      updateScene(button.dataset.sceneChoice);
    });
  });

  updateScene(Math.random() < 0.5 ? "night" : "day");
}

const raffleConfig = window.KWAVE_CONFIG || {};
const raffleRoot = document.querySelector("#raffle-root");
const raffleStepLabel = document.querySelector("#raffle-step-label");
const raffleProgressFill = document.querySelector("#raffle-progress-fill");
const bridgeForm = document.querySelector("#surveyBridgeForm");
const payloadInput = document.querySelector("#surveyPayload");
const supportPool = document.querySelector("#support-pool");
const supportPoolStage = document.querySelector("#support-pool-stage");
const supportPoolCard = document.querySelector("#support-pool-card");
const supportPoolSong = document.querySelector("#support-pool-song");
const supportPoolReason = document.querySelector("#support-pool-reason");
const supportPoolMessage = document.querySelector("#support-pool-message");
const supportPoolStatus = document.querySelector("#support-pool-status");
let raffleSubmitTimer = null;
let supportPoolTimer = null;
let supportPoolIndex = -1;
let supportPoolLoading = false;

const SUPPORT_POOL_ROTATION_MS = 5000;
const SUPPORT_POOL_REQUEST_TIMEOUT_MS = 9000;
const SUPPORT_POOL_LIMIT = 36;

const supportPoolFallbackEntry = {
  song: "Love Me More",
  reason: "Mission 回答累積中，送出後會匿名出現在這裡。",
  message: "Panda 的應援訊息會在這裡漂浮登場。",
};

const supportPoolAccents = ["pink", "blue", "violet", "sun"];
let supportPoolEntries = [supportPoolFallbackEntry];
const hasRaffle = Boolean(raffleRoot && raffleStepLabel && raffleProgressFill && bridgeForm && payloadInput);

const raffleState = {
  stepIndex: 0,
  fanType: "",
  nickname: "",
  contact: "",
  favoriteSong: "",
  favoriteSongCustom: "",
  entryTime: "",
  entryTimeCustom: "",
  supportMoment: "",
  supportMomentCustom: "",
  supportGroup: "",
  apinkMemberCard: "",
  discoveryStage: "",
  discoverySong: "",
  message: "",
  supportEnergy: 4,
  consent: false,
  website: "",
  submitting: false,
  error: "",
  serial: "",
  duplicate: false,
};

const CUSTOM_CHOICE_VALUE = "__custom__";

const supportGroupOptions = ["HIGHLIGHT", "CRAVITY", "NEWBEAT", "FLARE U", "都不是，我是來湊熱鬧的"];

const apinkTitleTrackOptions = [
  "I Don't Know（Seven Springs of Apink）",
  "My My（Snow Pink）",
  "Hush（Une Année）",
  "NoNoNo（Secret Garden）",
  "Mr. Chu（Pink Blossom）",
  "LUV（Pink Luv）",
  "Remember（Pink Memory）",
  "Only One（Pink Revolution）",
  "Cause You're My Star（Dear）",
  "Five（Pink Up）",
  "I'm So Sick / 1點也沒有（One & Six）",
  "%%（Percent）",
  "Dumhdurum（LOOK）",
  "Dilemma（HORN）",
  "D N D（SELF）",
  "Love Me More（RE:LOVE）",
  { label: "自己填寫喜歡的歌", value: CUSTOM_CHOICE_VALUE, custom: true },
];

const pandaEntryTimeOptions = [
  "出道初期（MY MY 之前）",
  "MY MY / Hush 時期",
  "NoNoNo / Mr. Chu 時期",
  "LUV / Remember 時期",
  "1點也沒有 / %% 轉型時期",
  "Dumhdurum / D N D 後近期入坑",
  "一直都在補進度",
  { label: "自己填寫是什麼時候", value: CUSTOM_CHOICE_VALUE, custom: true },
];

const pandaJoinReasonOptions = [
  "歌曲好聽",
  "某位成員入坑",
  "長太好看",
  { label: "自己填寫入坑原因", value: CUSTOM_CHOICE_VALUE, custom: true },
];

const pandaMessageTemplates = [
  "謝謝 APINK 一直用歌曲陪著我們，今天也會用力應援。",
  "不管過了多久，Panda 都會在這裡替 APINK 留一盞粉紅色的光。",
  "希望成員們健康、開心，舞台上台下都被很多愛包圍。",
  "祝福十五週年快樂，一起再留下更多美麗的回憶。",
];

const guestDefaultSongPreview = {
  title: "Killing Voice",
  album: "Dingo Music",
  youtubeUrl: "https://www.youtube.com/watch?v=tJGunpmi2wo",
};

const guestSongRecommendations = [
  { title: "My My", album: "Snow Pink", value: "My My（Snow Pink）", youtubeUrl: "https://www.youtube.com/watch?v=yVI_XykcxlA" },
  { title: "NoNoNo", album: "Secret Garden", value: "NoNoNo（Secret Garden）", youtubeUrl: "https://www.youtube.com/watch?v=U5Ts1vUjTLo" },
  { title: "Mr. Chu", album: "Pink Blossom", value: "Mr. Chu（Pink Blossom）", youtubeUrl: "https://www.youtube.com/watch?v=fS9xABgSk_g" },
  { title: "LUV", album: "Pink Luv", value: "LUV（Pink Luv）", youtubeUrl: "https://www.youtube.com/watch?v=oNUSji2TWok" },
  { title: "Remember", album: "Pink Memory", value: "Remember（Pink Memory）", youtubeUrl: "https://www.youtube.com/watch?v=bXlrqQKbjSM" },
  { title: "I'm So Sick", album: "One & Six", value: "I'm So Sick（One & Six）", youtubeUrl: "https://www.youtube.com/watch?v=xkqtnuCGdHA" },
  { title: "Dumhdurum", album: "LOOK", value: "Dumhdurum（LOOK）", youtubeUrl: "https://www.youtube.com/watch?v=WqzTRK5GPWQ" },
  { title: "Love Me More", album: "RE:LOVE", value: "Love Me More（RE:LOVE）", youtubeUrl: "https://www.youtube.com/watch?v=iL0jeKQqQNk" },
];

const guestFollowupLinks = [
  {
    label: "今年推坑網站",
    title: "The Origin : APINK 演唱會推坑整理",
    href: "https://apink-panda.com/apink_8th_concert/",
    description: "從今年演唱會與舞台片段開始認識 APINK。",
  },
  {
    label: "專輯連結",
    title: "RE:LOVE / Love Me More",
    href: "https://apink-panda.com/mini_11_relove/",
    description: "補一下第 11 張迷你專輯與新歌 Love Me More。",
  },
];

const guestFollowupOptions = [
  "我會考慮之後參加ＡＰＩＮＫ活動",
  "繼續支持我的團體",
];

const apinkMemberCards = [
  {
    key: "yellow",
    color: "黃色",
    member: "吳夏榮",
    intro: "Apink 的忙內，清亮氣質和穩定舞台感像夏日陽光，適合從她的直拍開始入門。",
  },
  {
    key: "pink",
    color: "粉紅",
    member: "朴初瓏",
    intro: "Apink 隊長，溫柔但很有核心感，也常參與文字與故事感的表達。",
  },
  {
    key: "orange",
    color: "橘色",
    member: "尹普美",
    intro: "舞台能量和綜藝感都很鮮明，適合想先認識 Apink 可愛又會玩的那一面。",
  },
  {
    key: "blue",
    color: "藍色",
    member: "鄭恩地",
    intro: "主唱擔當，歌聲很有辨識度，也有音樂劇、戲劇與 Solo 作品可以延伸認識。",
  },
  {
    key: "purple",
    color: "紫色",
    member: "金南珠",
    intro: "舞台表情和爆發力很抓眼，適合從現場表演感受 Apink 的成熟魅力。",
  },
];

const raffleSteps = [
  {
    id: "fanType",
    label: "PANDA CHECK",
    render: renderRaffleFanType,
    validate: () => raffleState.fanType ? "" : "請選擇你是不是 Panda",
  },
  {
    id: "profile",
    label: "FAN BADGE",
    render: renderRaffleProfile,
    validate() {
      if (!raffleState.contact.trim()) return "請填寫 Threads 或 IG 帳號";
      if (!raffleState.consent) return "請勾選聲明";
      return "";
    },
  },
  {
    id: "favoriteSong",
    label: "TITLE TRACK",
    render: () => renderRaffleChoice({
      field: "favoriteSong",
      title: "選一首最能代表你 APINK 回憶的主打歌",
      options: apinkTitleTrackOptions,
      customField: "favoriteSongCustom",
      customLabel: "喜歡的歌",
      customPlaceholder: "輸入你最喜歡的 APINK 歌曲",
      compact: true,
    }),
    validate: () => validateChoiceAnswer("favoriteSong", "favoriteSongCustom", "請選擇或填寫一首歌"),
  },
  {
    id: "entryTime",
    label: "PANDA ERA",
    render: () => renderRaffleChoice({
      field: "entryTime",
      title: "你大概是什麼時候開始喜歡 APINK？",
      options: pandaEntryTimeOptions,
      customField: "entryTimeCustom",
      customLabel: "入坑時間",
      customPlaceholder: "例如：某個演唱會、某支直拍、某一年開始",
    }),
    validate: () => validateChoiceAnswer("entryTime", "entryTimeCustom", "請選擇或填寫入坑時間"),
  },
  {
    id: "supportMoment",
    label: "JOIN REASON",
    render: () => renderRaffleChoice({
      field: "supportMoment",
      title: "你是因為什麼原因入坑 APINK？",
      options: pandaJoinReasonOptions,
      customField: "supportMomentCustom",
      customLabel: "入坑原因",
      customPlaceholder: "寫下讓你入坑的那個瞬間",
    }),
    validate: () => validateChoiceAnswer("supportMoment", "supportMomentCustom", "請選擇或填寫入坑原因"),
  },
  {
    id: "supportGroup",
    label: "GUEST BADGE",
    render: () => renderRaffleChoice({
      field: "supportGroup",
      title: "今天你主要支持哪一個團體？",
      options: supportGroupOptions,
    }),
    validate: () => raffleState.supportGroup ? "" : "請選擇支持團體",
  },
  {
    id: "memberCard",
    label: "COLOR CARD",
    render: renderRaffleMemberCard,
    validate: () => raffleState.apinkMemberCard ? "" : "請抽一張 APINK 色卡",
  },
  {
    id: "discoveryStage",
    label: "APINK LINKS",
    render: renderRaffleGuestFollowup,
    validate: () => raffleState.discoveryStage ? "" : "請選擇參考後的想法",
  },
  {
    id: "discoverySong",
    label: "APINK PLAYER",
    render: renderRaffleGuestSong,
    validate: () => raffleState.discoverySong ? "" : "請選擇一首試聽後喜歡的歌",
  },
  {
    id: "message",
    label: "PINK MESSAGE",
    render: renderRaffleMessage,
    validate() {
      if (!raffleState.message.trim()) return "請寫下一句想說的話";
      if (raffleState.message.trim().length > 180) return "訊息請控制在 180 字以內";
      return "";
    },
  },
  {
    id: "energy",
    label: "ENERGY",
    render: renderRaffleEnergy,
    validate: () => "",
  },
  {
    id: "review",
    label: "FINAL CHECK",
    render: renderRaffleReview,
    validate: validateAllRaffleSteps,
  },
  {
    id: "result",
    label: "SERIAL READY",
    render: renderRaffleResult,
    validate: () => "",
  },
];

if (hasRaffle) {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "apink-kwave") return;

    window.clearTimeout(raffleSubmitTimer);
    raffleSubmitTimer = null;
    raffleState.submitting = false;

    if (data.ok) {
      raffleState.serial = data.serial || "";
      raffleState.duplicate = Boolean(data.duplicate);
      raffleState.stepIndex = getResultStepIndex();
      addCurrentAnswerToSupportPool();
    } else {
      raffleState.error = data.error || "送出失敗，請稍後再試";
    }

    renderRaffle();
  });

  renderRaffle();
}
initSupportPool();

function renderRaffle() {
  const activeSteps = getActiveRaffleSteps();
  if (raffleState.stepIndex > activeSteps.length - 1) {
    raffleState.stepIndex = activeSteps.length - 1;
  }

  const step = activeSteps[raffleState.stepIndex];
  const visibleStepCount = activeSteps.length - 1;
  const progress = step.id === "result"
    ? 100
    : Math.round((raffleState.stepIndex / (visibleStepCount - 1)) * 100);

  raffleStepLabel.textContent = step.label;
  raffleProgressFill.style.width = `${Math.max(8, progress)}%`;
  raffleRoot.innerHTML = step.render();
  bindRaffleEvents(step.id);
}

function getActiveRaffleSteps() {
  const routeIds = raffleState.fanType === "no"
    ? ["fanType", "supportGroup", "discoverySong", "discoveryStage", "energy", "profile", "review", "result"]
    : ["fanType", "favoriteSong", "entryTime", "supportMoment", "message", "energy", "profile", "review", "result"];

  return routeIds.map((id) => raffleSteps.find((step) => step.id === id));
}

function getResultStepIndex() {
  return getActiveRaffleSteps().findIndex((step) => step.id === "result");
}

function getMissionNumber() {
  return String(raffleState.stepIndex + 1).padStart(2, "0");
}

function initSupportPool() {
  if (!supportPool || !supportPoolCard || !supportPoolSong || !supportPoolReason) return;

  renderSupportPoolEntry(supportPoolEntries[0], 0);
  loadSupportPoolEntries();
  startSupportPoolRotation();
}

function loadSupportPoolEntries(options = {}) {
  const { quiet = false, renderOnSuccess = true } = options;
  const appsScriptUrl = String(raffleConfig.appsScriptUrl || "").trim();
  if (!appsScriptUrl) {
    setSupportPoolStatus("匿名顯示 Mission 回答，不會顯示帳號。");
    return;
  }
  if (supportPoolLoading) return;

  supportPoolLoading = true;
  if (!quiet) {
    setSupportPoolStatus("正在讀取 Google Sheet 回答...");
  }

  const callbackName = `__kwaveSupportPool${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const script = document.createElement("script");
  const separator = appsScriptUrl.includes("?") ? "&" : "?";

  const finishRequest = () => {
    window.clearTimeout(timeoutId);
    cleanupSupportPoolJsonp(script, callbackName);
    supportPoolLoading = false;
  };

  const timeoutId = window.setTimeout(() => {
    finishRequest();
    setSupportPoolStatus("目前無法讀取 Google Sheet，大眾池會先顯示預設內容。");
  }, SUPPORT_POOL_REQUEST_TIMEOUT_MS);

  window[callbackName] = (payload) => {
    finishRequest();
    const entries = Array.isArray(payload && payload.entries)
      ? payload.entries.map(normalizeSupportPoolEntry).filter(Boolean)
      : [];

    if (entries.length) {
      supportPoolEntries = shuffleSupportPoolEntries(entries);
      supportPoolIndex = -1;
      setSupportPoolStatus("匿名顯示 Mission 回答，不會顯示帳號。");
      if (renderOnSuccess) {
        showNextSupportPoolEntry();
      }
    } else {
      setSupportPoolStatus("目前 Google Sheet 尚無可公開的 Panda 回答。");
    }
  };

  script.src = `${appsScriptUrl}${separator}action=pool&limit=${SUPPORT_POOL_LIMIT}&callback=${encodeURIComponent(callbackName)}`;
  script.async = true;
  script.onerror = () => {
    finishRequest();
    setSupportPoolStatus("目前無法讀取 Google Sheet，大眾池會先顯示預設內容。");
  };
  document.head.appendChild(script);
}

function cleanupSupportPoolJsonp(script, callbackName) {
  if (script.parentNode) {
    script.parentNode.removeChild(script);
  }
  delete window[callbackName];
}

function startSupportPoolRotation() {
  window.clearInterval(supportPoolTimer);
  supportPoolTimer = window.setInterval(() => {
    showNextSupportPoolEntry();
    loadSupportPoolEntries({ quiet: true, renderOnSuccess: false });
  }, SUPPORT_POOL_ROTATION_MS);
}

function showNextSupportPoolEntry() {
  if (!supportPoolEntries.length) return;

  const nextIndex = supportPoolEntries.length === 1
    ? 0
    : (supportPoolIndex + 1 + Math.floor(Math.random() * (supportPoolEntries.length - 1))) % supportPoolEntries.length;

  supportPoolIndex = nextIndex;
  renderSupportPoolEntry(supportPoolEntries[supportPoolIndex], supportPoolIndex);
}

function renderSupportPoolEntry(entry, index) {
  if (!entry || !supportPoolCard || !supportPoolSong || !supportPoolReason) return;

  supportPoolSong.textContent = entry.song || supportPoolFallbackEntry.song;
  supportPoolReason.textContent = entry.reason || supportPoolFallbackEntry.reason;
  if (supportPoolMessage) {
    supportPoolMessage.textContent = entry.message || supportPoolFallbackEntry.message;
  }
  if (supportPoolStage) {
    supportPoolStage.dataset.accent = supportPoolAccents[index % supportPoolAccents.length];
  }

  supportPoolCard.classList.remove("is-switching");
  const replayAnimation = () => {
    supportPoolCard.classList.add("is-switching");
  };

  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(replayAnimation);
  } else {
    replayAnimation();
  }
}

function addCurrentAnswerToSupportPool() {
  if (raffleState.fanType !== "yes") return;

  const entry = normalizeSupportPoolEntry({
    song: getChoiceAnswer("favoriteSong", "favoriteSongCustom"),
    reason: getChoiceAnswer("supportMoment", "supportMomentCustom"),
    message: raffleState.message,
  });

  if (!entry) return;

  const hasSameEntry = supportPoolEntries.some((item) => (
    item.song === entry.song && item.reason === entry.reason && item.message === entry.message
  ));
  if (!hasSameEntry) {
    const isFallbackOnly = supportPoolEntries.length === 1 && supportPoolEntries[0] === supportPoolFallbackEntry;
    supportPoolEntries = isFallbackOnly
      ? [entry]
      : [entry, ...supportPoolEntries.filter((item) => item !== supportPoolFallbackEntry)];
  }

  supportPoolIndex = 0;
  setSupportPoolStatus("你的回答已匿名加入應援大眾池。");
  renderSupportPoolEntry(entry, 0);
}

function normalizeSupportPoolEntry(entry) {
  const song = String(entry && entry.song || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const reason = String(entry && entry.reason || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const message = String(entry && entry.message || "").replace(/\s+/g, " ").trim().slice(0, 180);

  if (!song || !reason || !message) return null;
  return { song, reason, message };
}

function shuffleSupportPoolEntries(entries) {
  return entries
    .map((entry) => ({ entry, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.entry);
}

function setSupportPoolStatus(message) {
  if (supportPoolStatus) {
    supportPoolStatus.textContent = message;
  }
}

function renderRaffleFanType() {
  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>你是 Panda 嗎？</h3>
    </div>
    <div class="raffle-choice-grid" data-field="fanType">
      <button class="raffle-choice ${raffleState.fanType === "yes" ? "is-selected" : ""}" type="button" data-value="yes">
        是，我是 Panda
      </button>
      <button class="raffle-choice ${raffleState.fanType === "no" ? "is-selected" : ""}" type="button" data-value="no">
        還不是，但想更認識 APINK
      </button>
    </div>
    ${raffleErrorMarkup()}
    ${raffleNavMarkup({ back: false, nextLabel: "下一步" })}
  `;
}

function renderRaffleProfile() {
  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>登記你的粉絲名牌</h3>
    </div>
    <div class="raffle-form-grid">
      ${raffleFieldMarkup("contact", "Threads 或 IG 帳號", raffleState.contact, "中獎聯繫用")}
      <label class="raffle-check">
        <input id="consent" type="checkbox" ${raffleState.consent ? "checked" : ""} />
        <span>我了解此為粉絲自製趣味調查，與主辦官方無任何關聯，以上資料僅用於抽獎、聯繫與中獎名單核對，不會儲存任何敏感資料，留言或調查結果會公開在展示頁面，但不會顯示帳號，但介意者請勿參加。</span>
      </label>
      <input id="website" class="raffle-honeypot" type="text" value="${escapeHtml(raffleState.website)}" tabindex="-1" autocomplete="off" />
    </div>
    ${raffleErrorMarkup()}
    ${raffleNavMarkup({ nextLabel: "下一題" })}
  `;
}

function renderRaffleChoice({
  field,
  title,
  options,
  customField = "",
  customLabel = "",
  customPlaceholder = "",
  compact = false,
}) {
  const normalizedOptions = options.map(normalizeChoiceOption);
  const customInput = customField && raffleState[field] === CUSTOM_CHOICE_VALUE
    ? `
      <label class="raffle-field raffle-field--custom" for="${customField}">
        <span>${escapeHtml(customLabel || "自己填寫")}</span>
        <input id="${customField}" type="text" value="${escapeHtml(raffleState[customField])}" placeholder="${escapeHtml(customPlaceholder)}" autocomplete="off" />
      </label>
    `
    : "";

  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>${title}</h3>
    </div>
    <div class="raffle-choice-grid ${compact ? "raffle-choice-grid--compact" : ""}" data-field="${field}" ${customField ? `data-custom-field="${customField}"` : ""}>
      ${normalizedOptions.map((option) => `
        <button class="raffle-choice ${compact ? "raffle-choice--compact" : ""} ${raffleState[field] === option.value ? "is-selected" : ""}" type="button" data-value="${escapeHtml(option.value)}" data-custom-choice="${option.custom ? "true" : "false"}">
          ${escapeHtml(option.label)}
        </button>
      `).join("")}
    </div>
    ${customInput}
    ${raffleErrorMarkup()}
    ${raffleNavMarkup()}
  `;
}

function renderRaffleMemberCard() {
  const selectedCard = getSelectedMemberCard();

  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>抽一張 APINK 代表色卡</h3>
    </div>
    <div class="raffle-member-grid" aria-label="APINK 代表色色卡">
      ${apinkMemberCards.map((card) => `
        <button class="raffle-member-card raffle-member-card--${card.key} ${raffleState.apinkMemberCard === card.key ? "is-selected" : ""}" type="button" data-member-card="${card.key}">
          <span>${card.color}</span>
          <strong>${raffleState.apinkMemberCard === card.key ? escapeHtml(card.member) : "抽卡"}</strong>
        </button>
      `).join("")}
    </div>
    ${selectedCard ? `
      <div class="raffle-member-result">
        <p>${escapeHtml(selectedCard.color)}代表隊員</p>
        <h4>${escapeHtml(selectedCard.member)}</h4>
        <span>${escapeHtml(selectedCard.intro)}</span>
      </div>
    ` : ""}
    ${raffleErrorMarkup()}
    ${raffleNavMarkup()}
  `;
}

function renderRaffleGuestSong() {
  const activeSong = guestSongRecommendations.find((song) => song.value === raffleState.discoverySong)
    || guestDefaultSongPreview;

  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>從 Panda 歌單試聽 APINK 主打歌</h3>
    </div>
    <div class="raffle-youtube-card">
      <div class="raffle-youtube-frame">
        <iframe
          src="${escapeHtml(getGuestSongEmbedUrl(activeSong))}"
          title="APINK ${escapeHtml(activeSong.title)} YouTube preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen>
        </iframe>
      </div>
      <div>
        <strong>${escapeHtml(activeSong.title)}</strong>
        <span>${escapeHtml(activeSong.album)} · 先試聽，再選出你最喜歡的一首</span>
        <a class="raffle-youtube-link" href="${escapeHtml(getGuestSongListenUrl(activeSong))}" target="_blank" rel="noopener noreferrer">
          在 YouTube 試聽這首歌
        </a>
      </div>
    </div>
    <div class="raffle-song-grid" aria-label="選擇試聽後喜歡的 APINK 歌曲">
      ${guestSongRecommendations.map((song) => `
        <div class="raffle-song-card ${raffleState.discoverySong === song.value ? "is-selected" : ""}">
          <button class="raffle-song-pick" type="button" data-guest-song="${escapeHtml(song.value)}">
            <span>${escapeHtml(song.album)}</span>
            <strong>${escapeHtml(song.title)}</strong>
            <em>${raffleState.discoverySong === song.value ? "已選為最喜歡" : "點卡片選最喜歡"}</em>
          </button>
          <a class="raffle-song-listen" href="${escapeHtml(getGuestSongListenUrl(song))}" target="_blank" rel="noopener noreferrer">
            YouTube 試聽
          </a>
        </div>
      `).join("")}
    </div>
    ${raffleErrorMarkup()}
    ${raffleNavMarkup()}
  `;
}

function renderRaffleGuestFollowup() {
  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>聽完之後，你會想怎麼支持？</h3>
    </div>
    <div class="raffle-choice-grid" data-field="discoveryStage">
      ${guestFollowupOptions.map((option) => `
        <button class="raffle-choice ${raffleState.discoveryStage === option ? "is-selected" : ""}" type="button" data-value="${escapeHtml(option)}">
          ${escapeHtml(option)}
        </button>
      `).join("")}
    </div>
    ${raffleState.discoveryStage ? `
      <p class="raffle-resource-heading">以下是應援主整理今年的活動：歡迎拜訪來參觀：</p>
      <div class="raffle-resource-grid">
        ${guestFollowupLinks.map((link) => `
          <a class="raffle-resource-card" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">
            <span>${escapeHtml(link.label)}</span>
            <strong>${escapeHtml(link.title)}</strong>
            <p>${escapeHtml(link.description)}</p>
          </a>
        `).join("")}
      </div>
    ` : ""}
    ${raffleErrorMarkup()}
    ${raffleNavMarkup()}
  `;
}

function renderRaffleMessage() {
  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>選一句應援模板，或寫下自己的話</h3>
    </div>
    <div class="raffle-template-grid" aria-label="應援訊息模板">
      ${pandaMessageTemplates.map((template, index) => `
          <button class="raffle-template ${raffleState.message === template ? "is-selected" : ""}" type="button" data-message-template="${index}">
            ${escapeHtml(template)}
          </button>
        `).join("")}
    </div>
    <label class="raffle-textarea">
      <span>自己填寫應援訊息</span>
      <textarea id="message" maxlength="180" rows="5" placeholder="今天也一起把粉紅波浪推到最亮。">${escapeHtml(raffleState.message)}</textarea>
    </label>
    <p class="raffle-count"><span id="messageCount">${raffleState.message.length}</span>/180</p>
    ${raffleErrorMarkup()}
    ${raffleNavMarkup()}
  `;
}

function renderRaffleEnergy() {
  const labels = ["安靜守護", "微微心動", "穩定應援", "火力全開", "全場沸騰"];
  return `
    <div class="raffle-screen-copy">
      <p>Mission ${getMissionNumber()}</p>
      <h3>今天的應援能量有多高？</h3>
    </div>
    <div class="raffle-energy">
      <strong id="energyValue">${raffleState.supportEnergy}</strong>
      <span id="energyLabel">${labels[raffleState.supportEnergy - 1]}</span>
      <input id="supportEnergy" type="range" min="1" max="5" step="1" value="${raffleState.supportEnergy}" aria-label="應援能量" />
      <div aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
    </div>
    ${raffleNavMarkup()}
  `;
}

function renderRaffleReview() {
  const routeItems = raffleState.fanType === "no"
    ? [
      raffleReviewItem("支持團體", raffleState.supportGroup),
      raffleReviewItem("試聽後喜歡的歌", raffleState.discoverySong),
      raffleReviewItem("參考後想法", raffleState.discoveryStage),
    ]
    : [
      raffleReviewItem("主打歌 / 喜歡的歌", getChoiceAnswer("favoriteSong", "favoriteSongCustom")),
      raffleReviewItem("入坑時間", getChoiceAnswer("entryTime", "entryTimeCustom")),
      raffleReviewItem("入坑原因", getChoiceAnswer("supportMoment", "supportMomentCustom")),
    ];

  return `
    <div class="raffle-screen-copy">
      <p>Final Mission</p>
      <h3>確認後取得抽獎序號</h3>
    </div>
    <dl class="raffle-review">
      ${raffleReviewItem("聯絡方式", raffleState.contact)}
      ${raffleReviewItem("是否 Panda", raffleState.fanType === "no" ? "還不是，想更認識 APINK" : "是，我是 Panda")}
      ${routeItems.join("")}
      ${raffleReviewItem("應援能量", `${raffleState.supportEnergy} / 5`)}
      ${raffleState.fanType === "no" ? "" : raffleReviewItem("訊息", raffleState.message)}
    </dl>
    ${raffleErrorMarkup()}
    <div class="raffle-nav">
      <button class="raffle-secondary" type="button" data-raffle-action="back">返回修改</button>
      <button class="raffle-primary" type="button" data-raffle-action="submit" ${raffleState.submitting ? "disabled" : ""}>
        ${raffleState.submitting ? "送出中" : "取得序號"}
      </button>
    </div>
  `;
}

function renderRaffleResult() {
  return `
    <div class="raffle-result">
      <p>SERIAL READY</p>
      <h3>你的抽獎序號</h3>
      <strong id="raffle-serial-code">${escapeHtml(raffleState.serial)}</strong>
      <span>${raffleState.duplicate ? "此聯絡方式已完成登記，序號已重新顯示。" : "已完成登記，請保存此序號等待中獎名單公布。"}</span>
      <div class="raffle-result-actions">
        <button class="raffle-primary" type="button" data-raffle-action="copySerial">複製序號</button>
        <button class="raffle-secondary" type="button" data-raffle-action="saveSerialImage">儲存序號圖</button>
      </div>
      <span class="serial-action-status" id="serial-action-status" aria-live="polite"></span>
      <button class="raffle-secondary" type="button" data-raffle-action="restart">再看一次任務</button>
    </div>
  `;
}

function bindRaffleEvents(stepId) {
  document.querySelectorAll("[data-raffle-action='next']").forEach((button) => {
    button.addEventListener("click", goNextRaffleStep);
  });

  document.querySelectorAll("[data-raffle-action='back']").forEach((button) => {
    button.addEventListener("click", goBackRaffleStep);
  });

  const submitButton = document.querySelector("[data-raffle-action='submit']");
  if (submitButton) submitButton.addEventListener("click", submitRaffleSurvey);

  const restartButton = document.querySelector("[data-raffle-action='restart']");
  if (restartButton) {
    restartButton.addEventListener("click", () => {
      raffleState.stepIndex = 0;
      raffleState.error = "";
      renderRaffle();
    });
  }

  const copySerialButton = document.querySelector("[data-raffle-action='copySerial']");
  if (copySerialButton) copySerialButton.addEventListener("click", copyRaffleSerial);

  const saveSerialButton = document.querySelector("[data-raffle-action='saveSerialImage']");
  if (saveSerialButton) saveSerialButton.addEventListener("click", saveRaffleSerialImage);

  if (stepId === "profile") {
    bindRaffleInput("contact");
    bindRaffleInput("website");

    document.querySelector("#consent").addEventListener("change", (event) => {
      raffleState.consent = event.target.checked;
    });
  }

  bindRaffleInput("favoriteSongCustom");
  bindRaffleInput("entryTimeCustom");
  bindRaffleInput("supportMomentCustom");

  document.querySelectorAll(".raffle-choice-grid").forEach((grid) => {
    grid.addEventListener("click", (event) => {
      const button = event.target.closest(".raffle-choice");
      if (!button) return;

      if (grid.dataset.field === "fanType") {
        setFanType(button.dataset.value);
      } else if (button.dataset.customChoice === "true") {
        raffleState[grid.dataset.field] = CUSTOM_CHOICE_VALUE;
      } else {
        raffleState[grid.dataset.field] = button.dataset.value;
        if (grid.dataset.customField) {
          raffleState[grid.dataset.customField] = "";
        }
      }

      raffleState.error = "";
      renderRaffle();
    });
  });

  document.querySelectorAll("[data-message-template]").forEach((button) => {
    button.addEventListener("click", () => {
      raffleState.message = pandaMessageTemplates[Number(button.dataset.messageTemplate)] || "";
      raffleState.error = "";
      renderRaffle();
    });
  });

  document.querySelectorAll("[data-member-card]").forEach((button) => {
    button.addEventListener("click", () => {
      raffleState.apinkMemberCard = button.dataset.memberCard;
      raffleState.error = "";
      renderRaffle();
    });
  });

  document.querySelectorAll("[data-guest-song]").forEach((button) => {
    button.addEventListener("click", () => {
      raffleState.discoverySong = button.dataset.guestSong;
      raffleState.error = "";
      renderRaffle();
    });
  });

  const message = document.querySelector("#message");
  if (message) {
    message.addEventListener("input", (event) => {
      raffleState.message = event.target.value;
      document.querySelector("#messageCount").textContent = raffleState.message.length;
    });
  }

  const energy = document.querySelector("#supportEnergy");
  if (energy) {
    const labels = ["安靜守護", "微微心動", "穩定應援", "火力全開", "全場沸騰"];
    energy.addEventListener("input", (event) => {
      raffleState.supportEnergy = Number(event.target.value);
      document.querySelector("#energyValue").textContent = raffleState.supportEnergy;
      document.querySelector("#energyLabel").textContent = labels[raffleState.supportEnergy - 1];
    });
  }
}

function bindRaffleInput(field) {
  const input = document.querySelector(`#${field}`);
  if (!input) return;

  input.addEventListener("input", (event) => {
    raffleState[field] = event.target.value;
  });
}

function goNextRaffleStep() {
  const activeSteps = getActiveRaffleSteps();
  const error = activeSteps[raffleState.stepIndex].validate();
  if (error) {
    raffleState.error = error;
    renderRaffle();
    return;
  }

  raffleState.error = "";
  raffleState.stepIndex = Math.min(raffleState.stepIndex + 1, activeSteps.length - 1);
  renderRaffle();
}

function goBackRaffleStep() {
  raffleState.error = "";
  raffleState.stepIndex = Math.max(raffleState.stepIndex - 1, 0);
  renderRaffle();
}

function submitRaffleSurvey() {
  const error = validateAllRaffleSteps();
  if (error) {
    raffleState.error = error;
    renderRaffle();
    return;
  }

  const appsScriptUrl = String(raffleConfig.appsScriptUrl || "").trim();
  if (!appsScriptUrl) {
    raffleState.error = "抽獎系統尚未設定，請稍後再試";
    renderRaffle();
    return;
  }

  raffleState.submitting = true;
  raffleState.error = "";
  renderRaffle();
  window.clearTimeout(raffleSubmitTimer);
  raffleSubmitTimer = window.setTimeout(() => {
    if (!raffleState.submitting) return;

    raffleState.submitting = false;
    raffleState.error = "送出沒有收到回應，請確認 Apps Script 已重新部署後再試。";
    renderRaffle();
  }, 20000);

  bridgeForm.action = appsScriptUrl;
  const selectedCard = getSelectedMemberCard();
  const isGuestRoute = raffleState.fanType === "no";
  const guestSystemMessage = "非 Panda 路線未填寫感想";

  payloadInput.value = JSON.stringify({
    nickname: "",
    contact: raffleState.contact,
    fanType: raffleState.fanType,
    favoriteSong: isGuestRoute ? raffleState.discoverySong : getChoiceAnswer("favoriteSong", "favoriteSongCustom"),
    entryTime: isGuestRoute ? raffleState.supportGroup : getChoiceAnswer("entryTime", "entryTimeCustom"),
    supportMoment: isGuestRoute ? raffleState.discoveryStage : getChoiceAnswer("supportMoment", "supportMomentCustom"),
    supportGroup: raffleState.supportGroup,
    apinkMemberCard: selectedCard ? `${selectedCard.color}：${selectedCard.member}` : "",
    discoveryStage: raffleState.discoveryStage,
    discoverySong: raffleState.discoverySong,
    message: isGuestRoute ? guestSystemMessage : raffleState.message,
    supportEnergy: raffleState.supportEnergy,
    consent: raffleState.consent,
    website: raffleState.website,
    userAgent: navigator.userAgent,
  });
  bridgeForm.submit();
}

async function copyRaffleSerial() {
  const serial = String(raffleState.serial || "").trim();
  if (!serial) {
    setSerialActionStatus("目前沒有可複製的序號。");
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(serial);
    } else {
      copyTextFallback(serial);
    }
    setSerialActionStatus("已複製序號，可以貼到備忘錄保存。");
  } catch (error) {
    setSerialActionStatus("複製失敗，請手動長按序號保存。");
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function saveRaffleSerialImage() {
  const serial = String(raffleState.serial || "").trim();
  if (!serial) {
    setSerialActionStatus("目前沒有可儲存的序號。");
    return;
  }

  const canvas = createSerialReceiptCanvas(serial);
  const filename = `apink-kwave-${serial.replace(/[^a-z0-9-]/gi, "-")}.png`;

  const downloadBlob = (blob) => {
    if (!blob) {
      setSerialActionStatus("無法產生序號圖，請改用截圖保存。");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSerialActionStatus("已產生序號圖，請確認下載項目。");
  };

  if (canvas.toBlob) {
    canvas.toBlob(downloadBlob, "image/png");
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setSerialActionStatus("已產生序號圖，請確認下載項目。");
}

function createSerialReceiptCanvas(serial) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = 1080;
  const height = 1480;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#fff3f9");
  gradient.addColorStop(0.48, "#fef8ff");
  gradient.addColorStop(1, "#eaf8ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawReceiptGlow(ctx, 160, 190, 250, "rgba(243, 57, 145, 0.18)");
  drawReceiptGlow(ctx, 930, 360, 260, "rgba(91, 188, 229, 0.2)");
  drawReceiptGlow(ctx, 520, 1230, 320, "rgba(255, 208, 87, 0.16)");

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  drawRoundedRect(ctx, 80, 92, 920, 1288, 52);
  ctx.fill();
  ctx.strokeStyle = "rgba(53, 27, 76, 0.1)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#f33991";
  ctx.font = "700 34px Outfit, Arial, sans-serif";
  ctx.fillText("K-WAVE 2026 LUCKY DRAW", 132, 178);

  ctx.fillStyle = "#351b4c";
  ctx.font = "900 70px 'Noto Sans TC', sans-serif";
  ctx.fillText("抽獎序號保存卡", 132, 275);

  ctx.fillStyle = "rgba(53, 27, 76, 0.62)";
  ctx.font = "700 30px 'Noto Sans TC', sans-serif";
  ctx.fillText("請保存此序號，之後可用於中獎名單與現場領取核對。", 132, 335);

  ctx.fillStyle = "rgba(255, 239, 247, 0.95)";
  drawRoundedRect(ctx, 132, 420, 816, 226, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(243, 57, 145, 0.26)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#a2216a";
  ctx.font = "700 28px 'Noto Sans TC', sans-serif";
  ctx.fillText("你的抽獎序號", 172, 485);

  ctx.fillStyle = "#f33991";
  ctx.font = "800 46px Outfit, Arial, sans-serif";
  wrapCanvasText(ctx, serial, 172, 560, 740, 54);

  const rows = [
    ["聯絡帳號", raffleState.contact || "Threads / IG"],
    ["名單公布", "2026/8/2"],
    ["現場領取", "2026/8/8 找應援主領取"],
  ];

  let rowY = 750;
  rows.forEach(([label, value]) => {
    ctx.fillStyle = "rgba(53, 27, 76, 0.48)";
    ctx.font = "700 27px 'Noto Sans TC', sans-serif";
    ctx.fillText(label, 142, rowY);
    ctx.fillStyle = "#351b4c";
    ctx.font = "800 34px 'Noto Sans TC', sans-serif";
    wrapCanvasText(ctx, value, 142, rowY + 52, 790, 44);
    rowY += 150;
  });

  ctx.fillStyle = "rgba(53, 27, 76, 0.62)";
  ctx.font = "700 26px 'Noto Sans TC', sans-serif";
  wrapCanvasText(ctx, "本活動為粉絲自發性應援，所有應援周邊皆為自製且免費抽籤贈送，與官方主辦單位無關。", 132, 1200, 816, 42);

  ctx.fillStyle = "rgba(243, 57, 145, 0.82)";
  ctx.font = "800 28px Outfit, Arial, sans-serif";
  ctx.fillText("FOREVER WITH APINK", 132, 1315);

  return canvas;
}

function drawReceiptGlow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = String(text || "").split("");
  let line = "";
  let currentY = y;

  chars.forEach((char) => {
    const testLine = `${line}${char}`;
    if (line && ctx.measureText(testLine).width > maxWidth) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

function setSerialActionStatus(message) {
  const status = document.querySelector("#serial-action-status");
  if (status) {
    status.textContent = message;
  }
}

function validateAllRaffleSteps() {
  for (const step of getActiveRaffleSteps().filter((item) => item.id !== "review" && item.id !== "result")) {
    const error = step.validate();
    if (error) return error;
  }

  return "";
}

function setFanType(nextFanType) {
  if (raffleState.fanType === nextFanType) return;

  raffleState.fanType = nextFanType;
  raffleState.favoriteSong = "";
  raffleState.favoriteSongCustom = "";
  raffleState.entryTime = "";
  raffleState.entryTimeCustom = "";
  raffleState.supportMoment = "";
  raffleState.supportMomentCustom = "";
  raffleState.supportGroup = "";
  raffleState.apinkMemberCard = "";
  raffleState.discoveryStage = "";
  raffleState.discoverySong = "";
  raffleState.message = "";
}

function normalizeChoiceOption(option) {
  return typeof option === "string"
    ? { label: option, value: option, custom: false }
    : {
      label: option.label || option.value,
      value: option.value,
      custom: Boolean(option.custom),
    };
}

function getGuestSongListenUrl(song) {
  if (song.youtubeUrl) {
    return song.youtubeUrl;
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`APINK ${song.title} ${song.album}`)}`;
}

function getGuestSongEmbedUrl(song) {
  const videoId = getYouTubeVideoId(song.youtubeUrl);
  if (videoId) {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  }

  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(`APINK ${song.title} ${song.album}`)}`;
}

function getYouTubeVideoId(url) {
  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("youtu.be")) {
      return parsedUrl.pathname.slice(1);
    }

    return parsedUrl.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function getChoiceAnswer(field, customField) {
  if (raffleState[field] === CUSTOM_CHOICE_VALUE) {
    return String(raffleState[customField] || "").trim();
  }

  return String(raffleState[field] || "").trim();
}

function validateChoiceAnswer(field, customField, errorMessage) {
  return getChoiceAnswer(field, customField) ? "" : errorMessage;
}

function getSelectedMemberCard() {
  return apinkMemberCards.find((card) => card.key === raffleState.apinkMemberCard);
}

function raffleFieldMarkup(id, label, value, placeholder) {
  return `
    <label class="raffle-field" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="text" value="${escapeHtml(value)}" placeholder="${placeholder}" autocomplete="off" />
    </label>
  `;
}

function raffleNavMarkup({ back = true, nextLabel = "下一題" } = {}) {
  return `
    <div class="raffle-nav">
      ${back ? '<button class="raffle-secondary" type="button" data-raffle-action="back">上一題</button>' : "<span></span>"}
      <button class="raffle-primary" type="button" data-raffle-action="next">${nextLabel}</button>
    </div>
  `;
}

function raffleReviewItem(label, value) {
  return `
    <div>
      <dt>${label}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function raffleErrorMarkup() {
  return raffleState.error ? `<p class="raffle-error" role="alert">${escapeHtml(raffleState.error)}</p>` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
