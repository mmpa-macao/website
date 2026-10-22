/**
 * 澳門醫學物理學會網站 — 表單後端（Google Apps Script）
 *
 * 功能（目前為「僅存檔」模式，尚未啟用寄信）：
 *   1. 入會申請：把申請內容與證明文件存進雲端硬碟「MMPA 入會申請」資料夾。
 *   2. 聯絡表單：把訊息存成文字檔，放在雲端硬碟「MMPA 入會申請 / 查詢」資料夾。
 *   寄信通知（MailApp）已先註解掉，所以授權時不會要求「寄送電子郵件」的權限。
 *   流程確認無誤後，要開啟自動寄信：見檔案下方「啟用寄信通知」的說明。
 *
 * 部署方式見 README（Extensions → Apps Script，貼上本檔，執行一次 authorize，再部署為「網頁應用程式」）。
 * 請用 medicalphysics.macau@gmail.com 這個帳號建立並部署：檔案會存在這個帳號的雲端硬碟，
 * 通知信也是從這個帳號寄出。
 */

var CONFIG = {
  NOTIFY_TO: 'medicalphysics.macau@gmail.com',   // 通知信收件人（可填多個，用逗號分隔）
  FOLDER_NAME: 'MMPA 入會申請',                    // 雲端硬碟裡的根資料夾（不存在會自動建立）
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
  return ContentService.createTextOutput('MMPA form endpoint is running.');
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

  notify_(oneLine_(d.subject), d.message + '\n\n——\n雲端硬碟資料夾：' + folder.getUrl(), d.email, blobs);   // 目前不會寄信，見 notify_
}

function handleContact_(d) {
  // 寄信停用期間：把查詢存成文字檔，學會到雲端硬碟查看
  var stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HHmm');
  var body = oneLine_(d.subject) + '\n姓名：' + d.name + '\n電郵：' + d.email + '\n\n' + d.message;
  getInbox_().createFile(stamp + '_' + safeName_(d.name) + '.txt', body, MimeType.PLAIN_TEXT);
  notify_(oneLine_(d.subject), d.message + '\n\n——\n' + d.name + '\n' + d.email, d.email, []);   // 目前不會寄信，見 notify_
}

// 目前：不寄信（只留一行紀錄）。這樣部署時不會要求「寄送電子郵件」的授權。
function notify_(subject, body, replyTo, blobs) {
  console.log('notify skipped (mail disabled): ' + subject);
}

/* ========== 啟用寄信通知（流程確認後再做）==========
 * 1. 把上面整個 notify_ 函式換成下面這個（不含這行說明）：
 *
 * function notify_(subject, body, replyTo, blobs) {
 *   try {
 *     MailApp.sendEmail({
 *       to: CONFIG.NOTIFY_TO,
 *       subject: subject,
 *       body: body,
 *       replyTo: replyTo,
 *       name: '澳門醫學物理學會網站',
 *       attachments: blobs
 *     });
 *   } catch (err) {
 *     // 寄信失敗（例如超過每日配額）不算申請失敗：資料已存進雲端硬碟
 *     console.error('mail failed: ' + err);
 *   }
 * }
 *
 * 2. 在 authorize() 裡加回一行：
 *    MailApp.sendEmail(CONFIG.NOTIFY_TO, '[MMPA] 表單後端設定成功', '授權成功。');
 * 3. 選 authorize 按「執行」，同意新增的「寄送電子郵件」權限。
 * 4. 「部署」→「管理部署作業」→ 鉛筆 → 版本選「新版本」→ 部署（網址不變，網頁不用改）。
 * ================================================== */

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
 * 會跳出授權視窗（只需要雲端硬碟），並建立資料夾。
 */
function authorize() {
  getRoot_();
  getInbox_();
}
