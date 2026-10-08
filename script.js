// ============================================================
// 學會網站 — 共用腳本 / Shared script
// 功能：中 / 英 語言切換（記住選擇）、手機版選單開關
// Handles: ZH/EN language toggle (remembers choice), mobile nav
// ============================================================

document.addEventListener("DOMContentLoaded", function () {
  var root = document.documentElement; // <html> 標籤
  var langToggle = document.getElementById("lang-toggle");
  var navToggle = document.getElementById("nav-toggle");
  var mainNav = document.getElementById("main-nav");

  // --- 語言切換 / Language toggle -----------------------------------
  // 用 data-lang 屬性記錄目前語言，避免跟文字用的 .lang-en class 同名衝突
  var saved = null;
  try {
    saved = window.localStorage.getItem("site-lang");
  } catch (e) {
    // 若瀏覽器封鎖 localStorage（例如無痕模式），忽略即可，不影響切換功能
  }
  if (saved === "en") {
    root.setAttribute("data-lang", "en");
  }

  function updateToggleLabel() {
    if (!langToggle) return;
    langToggle.textContent = root.getAttribute("data-lang") === "en" ? "中文" : "EN";
  }
  updateToggleLabel();

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      var isEn = root.getAttribute("data-lang") === "en";
      root.setAttribute("data-lang", isEn ? "zh" : "en");
      try {
        window.localStorage.setItem("site-lang", isEn ? "zh" : "en");
      } catch (e) {
        // 忽略儲存失敗，切換本身仍然有效
      }
      updateToggleLabel();
    });
  }

  // --- 手機版選單 / Mobile nav toggle ---------------------------------
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      mainNav.classList.toggle("open");
      var expanded = mainNav.classList.contains("open");
      navToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }
});