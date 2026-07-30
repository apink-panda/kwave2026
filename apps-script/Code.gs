const RESPONSE_SHEET_NAME = 'Responses';
const WINNER_SHEET_NAME = 'Winners';
const SETTING_SHEET_NAME = 'Settings';
const WINNER_DRAW_OPEN_KEY = 'winner_draw_open';
const SERIAL_PREFIX = 'APINK-KWAVE';
const WINNER_COUNT = 10;
const PUBLIC_POOL_LIMIT = 36;
const SETTING_HEADERS = ['key', 'value', 'note'];
const WINNER_HEADERS = [
  'drawn_at',
  'serial',
  'nickname',
  'contact',
  'favorite_song',
  'entry_time',
  'support_moment',
  'fan_type',
  'support_group',
  'apink_member_card',
  'discovery_stage',
  'discovery_song'
];
const TEXT_LIMITS = {
  CONTACT: 120,
  FAVORITE_SONG: 80,
  ENTRY_TIME: 80,
  SUPPORT_MOMENT: 120,
  MESSAGE: 180,
  USER_AGENT: 400,
  SUPPORT_GROUP: 80,
  APINK_MEMBER_CARD: 120,
  DISCOVERY_STAGE: 160,
  DISCOVERY_SONG: 120
};

const RESPONSE_HEADERS = [
  'created_at',
  'serial',
  'nickname',
  'contact',
  'favorite_song',
  'entry_time',
  'support_moment',
  'message',
  'support_energy',
  'consent',
  'status',
  'user_agent',
  'fan_type',
  'support_group',
  'apink_member_card',
  'discovery_stage',
  'discovery_song'
];

function setup() {
  const sheet = getResponsesSheet_();
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, RESPONSE_HEADERS.length);
  ensureSettingsSheet_();
}

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (String(params.action || '').trim() === 'pool') {
    const limit = Math.min(Number(params.limit) || PUBLIC_POOL_LIMIT, PUBLIC_POOL_LIMIT);
    return publicResponse_({
      ok: true,
      entries: getPublicPoolEntries_(limit)
    }, params.callback);
  }

  if (String(params.action || '').trim() === 'stats') {
    return publicResponse_({
      ok: true,
      stats: getPublicStats_()
    }, params.callback);
  }

  if (String(params.action || '').trim() === 'winners') {
    if (!isWinnerDrawOpen_()) {
      return publicResponse_({
        ok: true,
        drawOpen: false,
        winners: []
      }, params.callback);
    }

    return publicResponse_({
      ok: true,
      drawOpen: true,
      winners: getPublicWinners_()
    }, params.callback);
  }

  if (String(params.action || '').trim() === 'draw-winners') {
    return publicResponse_(drawWinnersForRequest_(), params.callback);
  }

  return publicResponse_({ ok: true, service: 'apink-kwave' }, params.callback);
}

function doPost(e) {
  try {
    const data = JSON.parse((e.parameter && e.parameter.payload) || '{}');
    validatePayload_(data);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getResponsesSheet_();
      ensureHeaders_(sheet);

      const existingSerial = findExistingSerial_(sheet, data.contact);
      if (existingSerial) {
        return htmlResponse_({ ok: true, serial: existingSerial, duplicate: true });
      }

      const isGuestRoute = String(data.fanType || '').trim() === 'no';
      const serial = createSerial_(sheet);
      sheet.appendRow([
        new Date(),
        serial,
        clean_(data.nickname, 80),
        clean_(data.contact, TEXT_LIMITS.CONTACT),
        isGuestRoute ? '' : clean_(data.favoriteSong, TEXT_LIMITS.FAVORITE_SONG),
        isGuestRoute ? '' : clean_(data.entryTime, TEXT_LIMITS.ENTRY_TIME),
        isGuestRoute ? '' : clean_(data.supportMoment, TEXT_LIMITS.SUPPORT_MOMENT),
        isGuestRoute ? '' : clean_(data.message, TEXT_LIMITS.MESSAGE),
        Number(data.supportEnergy) || '',
        data.consent === true ? 'yes' : 'no',
        'eligible',
        clean_(data.userAgent, TEXT_LIMITS.USER_AGENT),
        clean_(data.fanType, 20),
        clean_(data.supportGroup, TEXT_LIMITS.SUPPORT_GROUP),
        clean_(data.apinkMemberCard, TEXT_LIMITS.APINK_MEMBER_CARD),
        clean_(data.discoveryStage, TEXT_LIMITS.DISCOVERY_STAGE),
        clean_(data.discoverySong, TEXT_LIMITS.DISCOVERY_SONG)
      ]);

      return htmlResponse_({ ok: true, serial });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return htmlResponse_({ ok: false, error: error.message || '送出失敗' });
  }
}

function drawWinners() {
  const result = drawWinnersForRequest_();
  Logger.log(JSON.stringify(result));
  return result;
}

function drawWinnersForRequest_() {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    if (!isWinnerDrawOpen_()) {
      return {
        ok: false,
        drawOpen: false,
        error: '尚未開放中獎名單'
      };
    }

    const existingWinners = getPublicWinners_();
    if (existingWinners.length) {
      return {
        ok: true,
        drawOpen: true,
        existing: true,
        winners: existingWinners
      };
    }

    return drawAndStoreWinners_();
  } catch (error) {
    return {
      ok: false,
      error: error.message || '抽獎失敗，請稍後再試'
    };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function drawAndStoreWinners_() {
  const responseSheet = getResponsesSheet_();
  ensureHeaders_(responseSheet);

  const values = responseSheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('目前沒有可抽獎的有效名單。');

  const headers = values[0].map((header) => String(header || '').trim());
  const eligibleRows = values.slice(1).filter((row) => {
    const serial = cleanPublicText_(getRowValue_(headers, row, 'serial'), 80);
    const status = String(getRowValue_(headers, row, 'status') || '').trim().toLowerCase();
    return serial && status === 'eligible';
  });

  if (eligibleRows.length < WINNER_COUNT) {
    throw new Error(`目前有效名單不足 ${WINNER_COUNT} 位，尚未抽出中獎者。`);
  }

  shuffle_(eligibleRows);

  const now = new Date();
  const winnerRows = eligibleRows.slice(0, WINNER_COUNT).map((row) => ([
    now,
    clean_(getRowValue_(headers, row, 'serial'), 80),
    clean_(getRowValue_(headers, row, 'nickname'), 80),
    clean_(getRowValue_(headers, row, 'contact'), TEXT_LIMITS.CONTACT),
    clean_(getRowValue_(headers, row, 'favorite_song'), TEXT_LIMITS.FAVORITE_SONG),
    clean_(getRowValue_(headers, row, 'entry_time'), TEXT_LIMITS.ENTRY_TIME),
    clean_(getRowValue_(headers, row, 'support_moment'), TEXT_LIMITS.SUPPORT_MOMENT),
    clean_(getRowValue_(headers, row, 'fan_type'), 20),
    clean_(getRowValue_(headers, row, 'support_group'), TEXT_LIMITS.SUPPORT_GROUP),
    clean_(getRowValue_(headers, row, 'apink_member_card'), TEXT_LIMITS.APINK_MEMBER_CARD),
    clean_(getRowValue_(headers, row, 'discovery_stage'), TEXT_LIMITS.DISCOVERY_STAGE),
    clean_(getRowValue_(headers, row, 'discovery_song'), TEXT_LIMITS.DISCOVERY_SONG)
  ]));

  const winnerSheet = getWinnerSheet_(true);
  winnerSheet.clearContents();
  winnerSheet.getRange(1, 1, 1, WINNER_HEADERS.length).setValues([WINNER_HEADERS]);
  winnerSheet.getRange(2, 1, winnerRows.length, WINNER_HEADERS.length).setValues(winnerRows);
  winnerSheet.setFrozenRows(1);
  winnerSheet.autoResizeColumns(1, WINNER_HEADERS.length);

  return {
    ok: true,
    drawOpen: true,
    existing: false,
    poolCount: eligibleRows.length,
    winners: getPublicWinners_()
  };
}

function getPublicWinners_() {
  const winnerSheet = getWinnerSheet_(false);
  if (!winnerSheet || winnerSheet.getLastRow() < 2) return [];

  const values = winnerSheet.getDataRange().getValues();
  const headers = values[0].map((header) => String(header || '').trim());
  const serialIndex = headers.indexOf('serial');
  if (serialIndex < 0) return [];

  return values.slice(1).map((row) => {
    const serial = cleanPublicText_(row[serialIndex], 80);
    if (!serial) return null;

    return {
      serial,
      drawnAt: formatPublicDate_(getRowValue_(headers, row, 'drawn_at'))
    };
  }).filter(Boolean).slice(0, WINNER_COUNT);
}

function validatePayload_(data) {
  if (data.website) throw new Error('送出失敗');
  requireText_(data.contact, TEXT_LIMITS.CONTACT, '請填寫 Threads 或 IG 帳號', '聯絡帳號請控制在 120 字以內');
  if (!['yes', 'no'].includes(String(data.fanType || '').trim())) throw new Error('請選擇你是不是 Panda');

  if (String(data.fanType || '').trim() === 'no') {
    requireText_(data.supportGroup, TEXT_LIMITS.SUPPORT_GROUP, '請選擇支持團體', '支持團體請控制在 80 字以內');
    requireText_(data.discoverySong, TEXT_LIMITS.DISCOVERY_SONG, '請選擇一首試聽後喜歡的 APINK 歌曲', '歌曲名稱請控制在 120 字以內');
    requireText_(data.discoveryStage, TEXT_LIMITS.DISCOVERY_STAGE, '請選擇參考後的想法', '參考後想法請控制在 160 字以內');
  } else {
    requireText_(data.favoriteSong, TEXT_LIMITS.FAVORITE_SONG, '請選擇主打歌或喜歡的歌', '歌名請控制在 80 字以內');
    requireText_(data.entryTime, TEXT_LIMITS.ENTRY_TIME, '請選擇入坑時間', '入坑時間請控制在 80 字以內');
    requireText_(data.supportMoment, TEXT_LIMITS.SUPPORT_MOMENT, '請選擇入坑原因', '入坑原因請控制在 120 字以內');
    requireText_(data.message, TEXT_LIMITS.MESSAGE, '請填寫應援訊息', '應援訊息過長');
  }

  validateTextLength_(data.message, TEXT_LIMITS.MESSAGE, '應援訊息過長');
  if (data.consent !== true) throw new Error('請勾選聲明');

  const energy = Number(data.supportEnergy);
  if (!energy || energy < 1 || energy > 5) throw new Error('請選擇應援能量');
}

function getPublicPoolEntries_(limit) {
  const sheet = getResponsesSheet_();
  ensureHeaders_(sheet);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map((header) => String(header || '').trim());
  const favoriteSongIndex = headers.indexOf('favorite_song');
  const supportMomentIndex = headers.indexOf('support_moment');
  const messageIndex = headers.indexOf('message');
  const statusIndex = headers.indexOf('status');
  const fanTypeIndex = headers.indexOf('fan_type');

  if (favoriteSongIndex < 0 || supportMomentIndex < 0 || messageIndex < 0) return [];

  const entries = values.slice(1).map((row) => {
    const status = statusIndex >= 0 ? String(row[statusIndex] || '').trim().toLowerCase() : 'eligible';
    const fanType = fanTypeIndex >= 0 ? String(row[fanTypeIndex] || '').trim() : 'yes';
    const song = cleanPublicText_(row[favoriteSongIndex], TEXT_LIMITS.FAVORITE_SONG);
    const reason = cleanPublicText_(row[supportMomentIndex], TEXT_LIMITS.SUPPORT_MOMENT);
    const message = cleanPublicText_(row[messageIndex], TEXT_LIMITS.MESSAGE);

    if (status && status !== 'eligible') return null;
    if (fanType && fanType !== 'yes') return null;
    if (!song || !reason || !message) return null;

    return { song, reason, message };
  }).filter(Boolean);

  shuffle_(entries);
  return entries.slice(0, Math.max(0, limit));
}

function getPublicStats_() {
  const sheet = getResponsesSheet_();
  ensureHeaders_(sheet);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return {
      totalEligible: 0,
      sections: []
    };
  }

  const headers = values[0].map((header) => String(header || '').trim());
  const rows = values.slice(1).filter((row) => {
    const serial = cleanPublicText_(getRowValue_(headers, row, 'serial'), 80);
    const status = String(getRowValue_(headers, row, 'status') || '').trim().toLowerCase();
    return serial && status === 'eligible';
  });

  return {
    totalEligible: rows.length,
    generatedAt: formatPublicDate_(new Date()),
    sections: [
      createRankingSection_(headers, rows, {
        key: 'favoriteSong',
        field: 'favorite_song',
        title: '最多人喜愛的歌曲',
        emptyText: '目前尚無歌曲統計資料。',
        maxLength: TEXT_LIMITS.FAVORITE_SONG
      }),
      createRankingSection_(headers, rows, {
        key: 'entryTime',
        field: 'entry_time',
        title: '最多人入坑時間',
        emptyText: '目前尚無入坑時間統計資料。',
        maxLength: TEXT_LIMITS.ENTRY_TIME
      }),
      createRankingSection_(headers, rows, {
        key: 'supportMoment',
        fields: ['support_moment', 'support_monent'],
        title: '入坑理由排行',
        emptyText: '目前尚無入坑理由統計資料。',
        maxLength: TEXT_LIMITS.SUPPORT_MOMENT
      })
    ]
  };
}

function createRankingSection_(headers, rows, options) {
  const fields = options.fields || [options.field];
  const counts = {};
  rows.forEach((row) => {
    const value = getFirstPublicValue_(headers, row, fields, options.maxLength);
    if (!value) return;
    counts[value] = (counts[value] || 0) + 1;
  });

  const total = Object.keys(counts).reduce((sum, key) => sum + counts[key], 0);
  const items = Object.keys(counts)
    .map((label) => ({
      label,
      count: counts[label],
      percent: total ? Math.round((counts[label] / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hant'))
    .slice(0, 12)
    .map((item, index) => ({
      rank: index + 1,
      label: item.label,
      count: item.count,
      percent: item.percent
    }));

  return {
    key: options.key,
    title: options.title,
    emptyText: options.emptyText,
    total,
    items
  };
}

function getFirstPublicValue_(headers, row, fields, maxLength) {
  for (let i = 0; i < fields.length; i++) {
    const value = cleanPublicText_(getRowValue_(headers, row, fields[i]), maxLength);
    if (value) return value;
  }

  return '';
}

function getResponsesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(RESPONSE_SHEET_NAME) || ss.insertSheet(RESPONSE_SHEET_NAME);
}

function getWinnerSheet_(createIfMissing) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(WINNER_SHEET_NAME) || (createIfMissing ? ss.insertSheet(WINNER_SHEET_NAME) : null);
}

function getSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SETTING_SHEET_NAME) || ss.insertSheet(SETTING_SHEET_NAME);
}

function ensureSettingsSheet_() {
  const sheet = getSettingsSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SETTING_HEADERS.length).setValues([SETTING_HEADERS]);
    sheet.appendRow([
      WINNER_DRAW_OPEN_KEY,
      'FALSE',
      'TRUE 時開放 winners.html 抽選與顯示中獎名單；FALSE 時顯示尚未開放中獎名單。'
    ]);
  } else {
    const values = sheet.getDataRange().getValues();
    const hasWinnerSwitch = values.slice(1).some((row) => String(row[0] || '').trim() === WINNER_DRAW_OPEN_KEY);
    if (!hasWinnerSwitch) {
      sheet.appendRow([
        WINNER_DRAW_OPEN_KEY,
        'FALSE',
        'TRUE 時開放 winners.html 抽選與顯示中獎名單；FALSE 時顯示尚未開放中獎名單。'
      ]);
    }
  }

  const currentValues = sheet.getDataRange().getValues();
  const switchRowIndex = currentValues.findIndex((row) => String(row[0] || '').trim() === WINNER_DRAW_OPEN_KEY);
  if (switchRowIndex >= 1) {
    sheet.getRange(switchRowIndex + 1, 2).insertCheckboxes();
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, SETTING_HEADERS.length);
  return sheet;
}

function isWinnerDrawOpen_() {
  const sheet = ensureSettingsSheet_();
  const values = sheet.getDataRange().getValues();
  const settingRow = values.slice(1).find((row) => String(row[0] || '').trim() === WINNER_DRAW_OPEN_KEY);
  const rawValue = settingRow ? String(settingRow[1] || '').trim().toLowerCase() : '';
  return ['true', 'yes', 'y', '1', 'on', 'open', 'opened', '開', '開啟', '開放', '是'].includes(rawValue);
}

function getRowValue_(headers, row, name) {
  const index = headers.indexOf(name);
  return index >= 0 ? row[index] : '';
}

function formatPublicDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
  }

  return cleanPublicText_(value, 40);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RESPONSE_HEADERS);
    return;
  }

  const lastColumn = sheet.getLastColumn();
  const currentHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((header) => String(header || '').trim())
    : [];
  const missingHeaders = RESPONSE_HEADERS.filter((header) => !currentHeaders.includes(header));

  if (!missingHeaders.length) return;

  sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
}

function createSerial_(sheet) {
  const nextNumber = Math.max(1, sheet.getLastRow());
  let serial = '';

  do {
    const number = String(nextNumber).padStart(6, '0');
    const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    serial = `${SERIAL_PREFIX}-${number}-${suffix}`;
  } while (serialExists_(sheet, serial));

  return serial;
}

function serialExists_(sheet, serial) {
  const values = sheet.getDataRange().getValues();
  return values.some((row, index) => index > 0 && String(row[1]) === serial);
}

function findExistingSerial_(sheet, contact) {
  const normalized = normalizeContact_(contact);
  if (!normalized) return '';

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizeContact_(values[i][3]) === normalized) {
      return String(values[i][1] || '');
    }
  }

  return '';
}

function normalizeContact_(value) {
  return String(value || '').trim().toLowerCase();
}

function clean_(value, maxLength) {
  const text = sanitizeText_(value, maxLength);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function cleanPublicText_(value, maxLength) {
  return sanitizeText_(value, maxLength).replace(/^'(?=[=+\-@])/, '');
}

function sanitizeText_(value, maxLength) {
  return String(value || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 500);
}

function requireText_(value, maxLength, emptyMessage, tooLongMessage) {
  const text = sanitizeText_(value, maxLength + 1);
  if (!text) throw new Error(emptyMessage);
  if (text.length > maxLength) throw new Error(tooLongMessage);
  return text;
}

function validateTextLength_(value, maxLength, tooLongMessage) {
  if (sanitizeText_(value, maxLength + 1).length > maxLength) {
    throw new Error(tooLongMessage);
  }
}

function publicResponse_(payload, callback) {
  const json = JSON.stringify({
    source: 'apink-kwave',
    ...payload
  }).replace(/</g, '\\u003c');

  if (/^[A-Za-z_$][\w.$]*$/.test(String(callback || ''))) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlResponse_(payload) {
  const json = JSON.stringify({
    source: 'apink-kwave',
    ...payload
  }).replace(/</g, '\\u003c');

  return HtmlService
    .createHtmlOutput(`<script>
      (function () {
        var payload = ${json};
        window.top.postMessage(payload, '*');
      }());
    </script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function shuffle_(rows) {
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = rows[i];
    rows[i] = rows[j];
    rows[j] = temp;
  }
}
