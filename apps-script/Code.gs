const RESPONSE_SHEET_NAME = 'Responses';
const WINNER_SHEET_NAME = 'Winners';
const SERIAL_PREFIX = 'APINK-KWAVE';
const WINNER_COUNT = 10;
const PUBLIC_POOL_LIMIT = 36;

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
        clean_(data.contact, 120),
        isGuestRoute ? '' : clean_(data.favoriteSong, 80),
        isGuestRoute ? '' : clean_(data.entryTime, 80),
        isGuestRoute ? '' : clean_(data.supportMoment, 120),
        isGuestRoute ? '' : clean_(data.message, 220),
        Number(data.supportEnergy) || '',
        data.consent === true ? 'yes' : 'no',
        'eligible',
        clean_(data.userAgent, 400),
        clean_(data.fanType, 20),
        clean_(data.supportGroup, 80),
        clean_(data.apinkMemberCard, 120),
        clean_(data.discoveryStage, 160),
        clean_(data.discoverySong, 120)
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = getResponsesSheet_();
  ensureHeaders_(responseSheet);

  const values = responseSheet.getDataRange().getValues();
  const rows = values.slice(1).filter((row) => {
    const serial = String(row[1] || '').trim();
    const status = String(row[10] || '').trim().toLowerCase();
    return serial && status === 'eligible';
  });

  shuffle_(rows);

  const winners = rows.slice(0, Math.min(WINNER_COUNT, rows.length));
  const winnerSheet = ss.getSheetByName(WINNER_SHEET_NAME) || ss.insertSheet(WINNER_SHEET_NAME);
  winnerSheet.clearContents();
  winnerSheet.appendRow([
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
  ]);

  const now = new Date();
  winners.forEach((row) => {
    winnerSheet.appendRow([
      now,
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
      row[6],
      row[12],
      row[13],
      row[14],
      row[15],
      row[16]
    ]);
  });

  winnerSheet.setFrozenRows(1);
  winnerSheet.autoResizeColumns(1, 12);
}

function validatePayload_(data) {
  if (data.website) throw new Error('送出失敗');
  if (!String(data.nickname || '').trim()) throw new Error('請填寫暱稱');
  if (!String(data.contact || '').trim()) throw new Error('請填寫 Threads 或 IG 帳號');
  if (!['yes', 'no'].includes(String(data.fanType || '').trim())) throw new Error('請選擇你是不是 Panda');

  if (String(data.fanType || '').trim() === 'no') {
    if (!String(data.supportGroup || '').trim()) throw new Error('請選擇支持團體');
    if (!String(data.discoverySong || '').trim()) throw new Error('請選擇一首試聽後喜歡的 APINK 歌曲');
    if (!String(data.discoveryStage || '').trim()) throw new Error('請選擇參考後的想法');
  } else {
    if (!String(data.favoriteSong || '').trim()) throw new Error('請選擇主打歌或喜歡的歌');
    if (!String(data.entryTime || '').trim()) throw new Error('請選擇入坑時間');
    if (!String(data.supportMoment || '').trim()) throw new Error('請選擇入坑原因');
    if (!String(data.message || '').trim()) throw new Error('請填寫應援訊息');
  }

  if (String(data.message || '').trim().length > 180) throw new Error('應援訊息過長');
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
    const song = cleanPublicText_(row[favoriteSongIndex], 80);
    const reason = cleanPublicText_(row[supportMomentIndex], 120);
    const message = cleanPublicText_(row[messageIndex], 180);

    if (status && status !== 'eligible') return null;
    if (fanType && fanType !== 'yes') return null;
    if (!song || !reason || !message) return null;

    return { song, reason, message };
  }).filter(Boolean);

  shuffle_(entries);
  return entries.slice(0, Math.max(0, limit));
}

function getResponsesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(RESPONSE_SHEET_NAME) || ss.insertSheet(RESPONSE_SHEET_NAME);
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
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function cleanPublicText_(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
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
