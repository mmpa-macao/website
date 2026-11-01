/**
 * 澳門醫學物理學會網站 — 表單後端（Google Apps Script）
 *
 * 功能（存檔＋記錄到試算表＋寄信）：
 *   1. 入會申請：申請內容與證明文件存進雲端硬碟「MMPA 入會申請」資料夾，
 *      同時在試算表「MMPA 入會申請名單」的「入會申請」分頁新增一列。
 *   2. 聯絡表單：訊息存成文字檔（「MMPA 入會申請 / 查詢」資料夾），
 *      同時記到同一份試算表的「查詢」分頁。
 *   3. 寄信：每份入會申請會寄一封通知給學會（含證明文件附件），並寄一封確認信給申請人。
 *
 * 部署方式見 README（Extensions → Apps Script，貼上本檔，執行一次 authorize，再部署為「網頁應用程式」）。
 * 請用 medicalphysics.macau@gmail.com 這個帳號建立並部署：檔案會存在這個帳號的雲端硬碟，
 * 通知信也是從這個帳號寄出。
 */

var CONFIG = {
  NOTIFY_TO: 'medicalphysics.macau@gmail.com',   // 通知信收件人（可填多個，用逗號分隔）
  FOLDER_NAME: 'MMPA 入會申請',                    // 雲端硬碟裡的根資料夾（不存在會自動建立）
  SHEET_NAME: 'MMPA 入會申請名單',                 // 試算表名稱（第一次寫入時自動建立在根資料夾裡）
  CONFIRM_APPLICANT: true,                        // 是否寄確認信給申請人（false = 只通知學會）
  STATUS_OPTIONS: ['待審', '已批准', '已繳費', '婉拒'],   // 「審批狀態」欄的下拉選項
  TIMEZONE: 'Asia/Macau',

  MAX_FILES: 3,                                   // 每份申請最多幾個檔案
  MAX_FILE_BYTES: 5 * 1024 * 1024,                // 每個檔案上限 5 MB
  ALLOWED_TYPES: {                                // 允許的檔案類型
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png'
  },

  MIN_FILL_MS: 3000,                              // 填寫時間少於 3 秒 → 視為機器人
  COOLDOWN_SEC: 60,                               // 同一電郵 60 秒內只接受一次
  MAX_TEXT: 20000                                 // 申請內容／訊息長度上限（字元）
};

/* ---------- 入口 ---------- */

function doPost(e) {
  var cache = CacheService.getScriptCache();
  var rateKey = null;
  try {
    var data = JSON.parse(e.postData.contents);
    var problem = validate_(data);
    if (problem === 'bot') return json_({ ok: true });          // 機器人：假裝成功，不處理
    if (problem) return json_({ ok: false, error: problem });

    rateKey = 'rate:' + data.email.toLowerCase();
    if (cache.get(rateKey)) return json_({ ok: false, error: 'rate' });
    cache.put(rateKey, '1', CONFIG.COOLDOWN_SEC);

    if (data.kind === 'join') handleJoin_(data);
    else handleContact_(data);
    return json_({ ok: true });
  } catch (err) {
    if (rateKey) cache.remove(rateKey);                         // 失敗的不計入冷卻，讓使用者可重試
    if (err && err.message === 'file_too_large') return json_({ ok: false, error: 'file_too_large' });
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'server' });
  }
}

// 用瀏覽器打開部署網址（GET）時，確認服務有在運作
function doGet() {
  return ContentService.createTextOutput('MMPA form endpoint v4 (sheet+mail) is running.');
}

/* ---------- 驗證 ---------- */

function validate_(d) {
  if (!d || typeof d !== 'object') return 'bad_request';
  if (d.kind !== 'join' && d.kind !== 'contact') return 'bad_request';

  // 機器人陷阱：隱藏欄位被填了，或填得太快
  if (d.website) return 'bot';
  if (typeof d.t === 'number' && d.t < CONFIG.MIN_FILL_MS) return 'bot';

  if (!isText_(d.name, 1, 100)) return 'bad_name';
  if (!isText_(d.email, 3, 200) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'bad_email';
  if (!isText_(d.message, 1, CONFIG.MAX_TEXT)) return 'bad_message';
  if (!isText_(d.subject, 1, 200)) return 'bad_subject';

  // fields：{欄位名稱: 值}，用來填試算表；可有可無（沒有時只是不記到試算表）
  if (d.fields !== undefined) {
    if (!d.fields || typeof d.fields !== 'object' || Array.isArray(d.fields)) return 'bad_fields';
    var keys = Object.keys(d.fields);
    if (keys.length > 40) return 'bad_fields';
    for (var k = 0; k < keys.length; k++) {
      if (typeof d.fields[keys[k]] !== 'string' || d.fields[keys[k]].length > 5000) return 'bad_fields';
    }
  }

  var files = d.files || [];
  if (!Array.isArray(files)) return 'bad_files';
  if (d.kind === 'contact' && files.length) return 'bad_files';
  if (files.length > CONFIG.MAX_FILES) return 'too_many_files';
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || typeof f.data !== 'string' || typeof f.name !== 'string') return 'bad_files';
    if (!CONFIG.ALLOWED_TYPES[f.type]) return 'bad_file_type';
    // base64 長度約為原檔的 4/3；先粗略擋掉過大的，避免白白解碼
    if (f.data.length > CONFIG.MAX_FILE_BYTES * 1.4) return 'file_too_large';
  }
  return '';
}

function isText_(v, min, max) {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

/* ---------- 處理 ---------- */

function handleJoin_(d) {
  // 先解碼並檢查實際大小，通過了才建資料夾（避免留下空資料夾）
  var blobs = (d.files || []).map(function (f, i) {
    var bytes = Utilities.base64Decode(f.data);
    if (bytes.length > CONFIG.MAX_FILE_BYTES) throw new Error('file_too_large');
    var ext = CONFIG.ALLOWED_TYPES[f.type];
    var name = (i + 1) + '_' + safeName_(f.name.replace(/\.[^.]*$/, '')) + '.' + ext;
    return Utilities.newBlob(bytes, f.type, name);
  });

  var stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HHmm');
  var folder = getRoot_().createFolder(stamp + '_' + safeName_(d.name));
  blobs.forEach(function (b) { folder.createFile(b); });
  folder.createFile('application.txt', d.message, MimeType.PLAIN_TEXT);

  addJoinRow_(d, folder.getUrl());
  notify_(oneLine_(d.subject), d.message + '\n\n——\n雲端硬碟資料夾：' + folder.getUrl(), d.email, blobs);
  confirmApplicant_(d, blobs.map(function (b) { return b.getName(); }));
}

function handleContact_(d) {
  // 存成文字檔備查，並記到試算表「查詢」分頁，再通知學會
  var stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HHmm');
  var body = oneLine_(d.subject) + '\n姓名：' + d.name + '\n電郵：' + d.email + '\n\n' + d.message;
  getInbox_().createFile(stamp + '_' + safeName_(d.name) + '.txt', body, MimeType.PLAIN_TEXT);
  addRow_(SHEET_INQUIRY, [now_(), d.name, d.email, d.message]);
  notify_(oneLine_(d.subject), d.message + '\n\n——\n' + d.name + '\n' + d.email, d.email, []);
}

/* ---------- 試算表 ---------- */

var SHEET_JOIN = '入會申請';
var SHEET_INQUIRY = '查詢';

// 「入會申請」分頁的欄位。名稱要與網頁表單 data-label 一致；沒對到的欄位留空，內容仍在 application.txt
var JOIN_COLUMNS = ['會員類別', '姓名（中文）', '姓名（英文／葡文）', '電郵', '聯絡電話', '通訊地址',
  '團體名稱', '贊助意向／說明', '最高學歷', '專業／科目', '畢業院校', '畢業年份',
  '現職機構', '職位', '相關工作年資（年）', '相關工作經歷', '附件'];
var HEADERS = {};
HEADERS[SHEET_JOIN] = ['提交時間'].concat(JOIN_COLUMNS, ['資料夾連結', '審批狀態', '備註']);
HEADERS[SHEET_INQUIRY] = ['提交時間', '姓名', '電郵', '訊息'];

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}

// 防止「=HYPERLINK(...)」之類的內容被試算表當成公式執行
function cell_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { /* 被刪掉了 → 重新建立 */ }
  }
  var ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(getRoot_());
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var first = ss.getSheets()[0];
  sh = (first.getLastRow() === 0 && first.getName() !== SHEET_JOIN && first.getName() !== SHEET_INQUIRY)
    ? first.setName(name) : ss.insertSheet(name);
  var head = HEADERS[name];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (name === SHEET_JOIN) {
    var col = head.indexOf('審批狀態') + 1;
    sh.getRange(2, col, 998, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUS_OPTIONS, true).setAllowInvalid(true).build());
  }
  return sh;
}

// 新增一列；失敗只記錄，不影響申請本身（資料已在雲端硬碟）
function addRow_(sheetName, values) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { getSheet_(sheetName).appendRow(values.map(cell_)); }
    finally { lock.releaseLock(); }
  } catch (err) {
    console.error('sheet failed: ' + err);
  }
}

function addJoinRow_(d, folderUrl) {
  var f = d.fields || {};
  var row = [now_()].concat(JOIN_COLUMNS.map(function (c) { return f[c] || ''; }), [folderUrl, '待審', '']);
  addRow_(SHEET_JOIN, row);
}

/* ---------- 寄信 ---------- */

// 通知學會：含申請內容與證明文件附件。回覆時直接按「回覆」就會回給申請人／提問者。
// 寄信失敗（例如超過每日配額）不算申請失敗：資料已存進雲端硬碟與試算表。
function notify_(subject, body, replyTo, blobs) {
  try {
    MailApp.sendEmail({
      to: CONFIG.NOTIFY_TO,
      subject: subject,
      body: body,
      replyTo: replyTo,
      name: '澳門醫學物理學會網站',
      attachments: blobs
    });
  } catch (err) {
    console.error('mail failed: ' + err);
  }
}

// 確認信給申請人（中英雙語）。只放最少的資料（姓名、類別、附件檔名），不放電話、地址等個人資料。
function confirmApplicant_(d, fileNames) {
  if (!CONFIG.CONFIRM_APPLICANT) return;
  try {
    var type = (d.fields && d.fields['會員類別']) || '';
    var list = fileNames.length ? fileNames.join('、') : '—';
    var bodyZh =
      d.name + ' 您好，\n\n' +
      '我們已收到您的入會申請' + (type ? '（' + type + '）' : '') + '，已收文件：' + list + '。\n' +
      '理事會審議後會以電郵通知您結果，請耐心等候。\n' +
      '如有任何疑問，直接回覆這封信即可。\n\n' +
      '澳門醫學物理學會';
    var bodyEn =
      'Dear ' + d.name + ',\n\n' +
      'We have received your membership application' + (type ? ' (' + type + ')' : '') + '. Documents received: ' + list + '.\n' +
      'The Board of Directors will review it and notify you of the result by email.\n' +
      'If you have any questions, simply reply to this email.\n\n' +
      'Macao Medical Physics Association\n\n' +
      '(This is an automatic confirmation. If you did not submit this application, please ignore this email.)';
    MailApp.sendEmail({
      to: d.email,
      subject: '【澳門醫學物理學會】已收到您的入會申請 / Application received',
      body: bodyZh + '\n\n————————————\n\n' + bodyEn,
      replyTo: CONFIG.NOTIFY_TO,
      name: '澳門醫學物理學會'
    });
  } catch (err) {
    console.error('confirm mail failed: ' + err);
  }
}

/* ---------- 工具 ---------- */

function getRoot_() {
  var it = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
}

function getInbox_() {
  var root = getRoot_();
  var it = root.getFoldersByName('查詢');
  return it.hasNext() ? it.next() : root.createFolder('查詢');
}

// 檔名／資料夾名：去掉會造成問題的字元，保留中文
function safeName_(s) {
  return String(s).replace(/[\\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 60) || 'file';
}

function oneLine_(s) {
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 第一次部署前，在編輯器選這個函式按「執行」一次：
 * 會跳出授權視窗（雲端硬碟、試算表、寄送電子郵件），建立資料夾與試算表，並寄一封測試信給 NOTIFY_TO。
 */
function authorize() {
  getRoot_();
  getInbox_();
  getSheet_(SHEET_JOIN);
  getSheet_(SHEET_INQUIRY);
  MailApp.sendEmail(CONFIG.NOTIFY_TO, '[MMPA] 表單後端設定成功', '如果你收到這封信，代表授權成功，可以部署新版本了。');
}