/* ============================================================
   學會網站 — 共用腳本 / Shared script
   語言切換、手機選單、站內搜尋、首頁輪播、關於我們分頁籤、
   新聞列表與分頁、聯絡表單。各功能只在頁面上有對應元素時才啟動。
   需先載入 news-data.js（window.MMPA_NEWS）。
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 雙語文字：{zh, en} → 兩個 span，由 CSS 依 data-lang 顯示其一
  function bi(o) {
    return '<span class="lang-zh">' + esc(o.zh) + '</span><span class="lang-en">' + esc(o.en) + '</span>';
  }
  function lang() { return root.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 隱私模式等情況 */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  root.classList.add('js');

  /* ---------- 語言切換 ---------- */
  function setLang(l) {
    if (l === 'en') root.setAttribute('data-lang', 'en');
    else root.removeAttribute('data-lang');
    root.setAttribute('lang', l === 'en' ? 'en' : 'zh-Hant');
    $$('[data-ph-zh]').forEach(function (el) {
      el.placeholder = el.getAttribute(l === 'en' ? 'data-ph-en' : 'data-ph-zh');
    });
    var btn = $('#lang-toggle');
    if (btn) btn.setAttribute('aria-label', l === 'en' ? '切換為中文' : 'Switch to English');
  }

  function initLang() {
    setLang(load('mmpa-lang') === 'en' ? 'en' : 'zh');
    var btn = $('#lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = lang() === 'en' ? 'zh' : 'en';
      save('mmpa-lang', next);
      setLang(next);
    });
  }

  /* ---------- 手機選單 ---------- */
  function initNav() {
    var btn = $('#nav-toggle');
    var nav = $('#main-nav');
    if (!btn || !nav) return;
    function setOpen(open) {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });

    // 「關於我們」下拉：點了子項目後讓它失焦（否則 :focus-within 會讓選單一直開著），
    // 手機版同時收起選單；按 Esc 也可關閉。
    $$('.subnav a').forEach(function (a) {
      a.addEventListener('click', function () { a.blur(); setOpen(false); });
    });
    $$('.nav-item').forEach(function (item) {
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && item.contains(document.activeElement)) document.activeElement.blur();
      });
    });
  }

  /* ---------- 圖片載入失敗 → 顯示佔位底色 ---------- */
  function bindFallback(img) {
    function mark() {
      img.hidden = true;
      if (img.parentElement) img.parentElement.classList.add('img-missing');
    }
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) mark();
    else img.addEventListener('error', mark, { once: true });
  }
  function initImages(ctx) {
    $$('img[data-fallback]', ctx).forEach(bindFallback);
  }

  /* ---------- 新聞資料 ---------- */
  var NEWS = (window.MMPA_NEWS || []).slice().sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  /* ---------- 活動回顧：已結束、且 news-data.js 有填 album 的活動 ---------- */
  var CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  function today() {
    var d = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }
  // 活動日期已過（不含當天）而且有相片，才算「有回顧」
  function hasReview(n) {
    return !!(n.album && n.album.length) && n.date < today();
  }
  function reviewTagHTML(n) {
    if (!hasReview(n)) return '';
    return '<a class="review-tag" href="' + esc(n.url) + '#album">' + CAMERA + bi({ zh: '回顧', en: 'Review' }) + '</a>';
  }

  function newsItemHTML(n, withThumb) {
    var thumb = '';
    if (withThumb) {
      thumb = '<a class="news-thumb ph ph--card" href="' + esc(n.url) + '" tabindex="-1" aria-hidden="true">' +
        '<span class="ph-label">' + bi({ zh: '海報', en: 'Poster' }) + '</span>' +
        (n.poster ? '<img src="' + esc(n.poster) + '" alt="" loading="lazy" data-fallback>' : '') +
        '</a>';
    }
    return '<article class="news-item' + (withThumb ? ' has-thumb' : '') + '">' +
      '<div class="news-body">' +
        '<div class="news-meta"><span class="news-date">' + esc(n.date) + '</span>' + reviewTagHTML(n) + '</div>' +
        '<a class="news-link" href="' + esc(n.url) + '"><h3>' + bi(n.title) + '</h3></a>' +
        '<p>' + bi(n.summary) + '</p>' +
      '</div>' + thumb +
      '</article>';
  }

  var EMPTY_NEWS = bi({ zh: '暫無消息。', en: 'No news yet.' });

  // 首頁：最新幾則（不含縮圖）
  function initHomeNews() {
    var box = $('#home-news');
    if (!box) return;
    var limit = parseInt(box.getAttribute('data-limit'), 10) || 3;
    var items = NEWS.slice(0, limit);
    box.innerHTML = items.length
      ? items.map(function (n) { return newsItemHTML(n, false); }).join('')
      : '<p>' + EMPTY_NEWS + '</p>';
  }

  // 消息頁：每頁 12 則 + 分頁器
  var PER_PAGE = 12;

  function pageNumbers(cur, total) {
    var set = {};
    [1, 2, total - 1, total, cur - 1, cur, cur + 1].forEach(function (p) {
      if (p >= 1 && p <= total) set[p] = true;
    });
    if (cur <= 2 && total >= 3) set[3] = true;
    var nums = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    nums.forEach(function (p, i) {
      if (i) {
        var gap = p - nums[i - 1];
        if (gap === 2) out.push(nums[i - 1] + 1);
        else if (gap > 2) out.push('…');
      }
      out.push(p);
    });
    return out;
  }

  function initNewsPage() {
    var list = $('#news-list');
    if (!list) return;
    var pager = $('#pager');
    var info = $('#pager-info');

    var total = Math.max(1, Math.ceil(NEWS.length / PER_PAGE));
    var cur = parseInt(new URLSearchParams(location.search).get('page'), 10);
    if (!cur || cur < 1) cur = 1;
    if (cur > total) cur = total;

    var start = (cur - 1) * PER_PAGE;
    var items = NEWS.slice(start, start + PER_PAGE);

    list.innerHTML = items.length
      ? items.map(function (n) { return newsItemHTML(n, true); }).join('')
      : '<p>' + EMPTY_NEWS + '</p>';
    initImages(list);

    if (pager) {
      var html = '';
      html += cur > 1
        ? '<a href="news.html?page=' + (cur - 1) + '" rel="prev">' + bi({ zh: '上一頁', en: 'Prev' }) + '</a>'
        : '<span class="is-disabled">' + bi({ zh: '上一頁', en: 'Prev' }) + '</span>';
      pageNumbers(cur, total).forEach(function (p) {
        if (p === '…') html += '<span class="gap" aria-hidden="true">…</span>';
        else if (p === cur) html += '<span class="is-current" aria-current="page">' + p + '</span>';
        else html += '<a href="news.html?page=' + p + '">' + p + '</a>';
      });
      html += cur < total
        ? '<a href="news.html?page=' + (cur + 1) + '" rel="next">' + bi({ zh: '下一頁', en: 'Next' }) + '</a>'
        : '<span class="is-disabled">' + bi({ zh: '下一頁', en: 'Next' }) + '</span>';
      pager.innerHTML = html;
    }

    if (info) {
      if (!NEWS.length) {
        info.innerHTML = '';
      } else {
        var a = start + 1;
        var b = start + items.length;
        info.innerHTML = bi({
          zh: '共 ' + total + ' 頁，當前 ' + a + '–' + b + ' 則',
          en: 'Page ' + cur + ' of ' + total + ' · showing ' + a + '–' + b + ' of ' + NEWS.length
        });
      }
    }
  }

  /* ---------- 活動頁：相冊 + 燈箱 ----------
     活動頁（例如 news-20260920.html）有 <div id="album"> 時才啟動。
     用「目前檔名 = news-data.js 裡的 url」找出對應活動；
     活動已結束且有 album 相片才顯示相冊與頂部的「回顧」標籤。 */
  function initEventPage() {
    var sec = $('#album');
    var grid = $('#album-grid');
    if (!sec || !grid) return;

    var file = location.pathname.split('/').pop();
    var ev = null;
    NEWS.forEach(function (n) { if (n.url === file) ev = n; });
    if (!ev || !hasReview(ev)) return;          // 不符合 → 相冊維持隱藏

    var tag = $('#detail-review');
    if (tag) { tag.innerHTML = reviewTagHTML(ev); tag.hidden = false; }

    grid.innerHTML = ev.album.map(function (p, i) {
      var src = typeof p === 'string' ? p : p.src;
      return '<a class="ph ph--card" href="' + esc(src) + '" data-i="' + i + '">' +
        '<span class="ph-label">' + (i + 1) + '</span>' +
        '<img src="' + esc(src) + '" alt="" loading="lazy" data-fallback></a>';
    }).join('');
    initImages(grid);
    sec.hidden = false;
    // 從列表按「回顧」過來時，相冊原本是隱藏的，瀏覽器不會自己捲過去
    if (location.hash === '#album' && sec.scrollIntoView) sec.scrollIntoView();

    /* --- 燈箱 --- */
    var lb = null, lbImg, lbCount, list = [], pos = 0, opener = null;

    function build() {
      if (lb) return;
      lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.hidden = true;
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Photos');
      lb.innerHTML =
        '<button type="button" class="lb-btn lb-close" aria-label="Close">×</button>' +
        '<button type="button" class="lb-btn lb-prev" aria-label="Previous">‹</button>' +
        '<button type="button" class="lb-btn lb-next" aria-label="Next">›</button>' +
        '<figure class="lb-figure"><img alt=""><figcaption class="lb-count"></figcaption></figure>';
      document.body.appendChild(lb);
      lbImg = $('img', lb);
      lbCount = $('.lb-count', lb);

      $('.lb-close', lb).addEventListener('click', close);
      $('.lb-prev', lb).addEventListener('click', function () { show(pos - 1); });
      $('.lb-next', lb).addEventListener('click', function () { show(pos + 1); });
      lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

      document.addEventListener('keydown', function (e) {
        if (lb.hidden) return;
        if (e.key === 'Escape') { close(); }
        else if (e.key === 'ArrowLeft') { show(pos - 1); }
        else if (e.key === 'ArrowRight') { show(pos + 1); }
        else if (e.key === 'Tab') {              // 焦點留在燈箱內
          var btns = $$('.lb-btn', lb);
          var i = btns.indexOf(document.activeElement);
          e.preventDefault();
          btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
      });

      var x0 = null;
      lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) show(pos + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }

    function show(k) {
      pos = (k + list.length) % list.length;
      lbImg.src = list[pos].getAttribute('href');
      lbCount.textContent = (pos + 1) + ' / ' + list.length;
      $('.lb-prev', lb).hidden = $('.lb-next', lb).hidden = list.length < 2;
    }

    function open(a) {
      // 只翻「真的載入成功」的相片；還沒放入的佔位格不算
      list = $$('a', grid).filter(function (x) { return !x.classList.contains('img-missing'); });
      pos = list.indexOf(a);
      if (pos < 0) return;
      build();
      opener = a;
      lb.hidden = false;
      document.body.classList.add('no-scroll');
      show(pos);
      $('.lb-close', lb).focus();
    }

    function close() {
      lb.hidden = true;
      document.body.classList.remove('no-scroll');
      if (opener) opener.focus();
    }

    grid.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a || !grid.contains(a)) return;
      e.preventDefault();
      if (!a.classList.contains('img-missing')) open(a);
    });
  }

  /* ---------- 站內搜尋 ---------- */
  // 靜態網站沒有後端，所以用一份頁面清單比對標題與關鍵字。
  var PAGES = [
    { zh: '首頁', en: 'Home', url: 'index.html', kw: '學會 格言 格物致知 mmpa' },
    { zh: '本會簡介', en: 'About the Association', url: 'about.html#intro',
      kw: '關於我們 簡介 歷史 成立宗旨 發展目標 主要會務 服務範圍 about mission history goals activities' },
    { zh: '章程', en: 'Constitution', url: 'about.html#constitution', kw: '章程 constitution bylaws' },
    { zh: '行政架構', en: 'Organization', url: 'about.html#structure',
      kw: '組織架構 成員 會員大會 主席團 理事會 監事會 會長 副會長 秘書長 理事長 監事長 ' +
          '李敏兒 廖偉霆 許正妍 李嘉浩 李凱彤 張浩澄 周雯 陳欣如 梁志強 麥敬樂 鄧穎 ' +
          'board directors supervisory general assembly members' },
    { zh: '最新消息', en: 'News', url: 'news.html', kw: '消息 活動 公告 news events' },
    { zh: '聯絡我們', en: 'Contact', url: 'contact.html', kw: '電郵 電話 email phone 查詢 contact' },
    { zh: '加入會員', en: 'Join us', url: 'contact.html?topic=join', kw: '入會 申請 會員 membership join' }
  ];

  function initSearch() {
    var form = $('#site-search');
    var input = $('#search-input');
    var box = $('#search-results');
    if (!form || !input || !box) return;

    var entries = PAGES.concat(NEWS.map(function (n) {
      return {
        zh: n.title.zh, en: n.title.en, url: n.url,
        kw: [n.date, n.summary.zh, n.summary.en].join(' '),
        type: { zh: '最新消息', en: 'News' }
      };
    }));
    var found = [];

    function find(q) {
      var tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.length) return [];
      return entries.filter(function (e) {
        var hay = (e.zh + ' ' + e.en + ' ' + (e.kw || '')).toLowerCase();
        return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
      }).slice(0, 6);
    }

    function render() {
      var q = input.value.trim();
      if (!q) { found = []; box.innerHTML = ''; box.hidden = true; return; }
      found = find(q);
      box.innerHTML = found.length
        ? found.map(function (e) {
            return '<li><a href="' + esc(e.url) + '">' + bi(e) +
              (e.type ? '<small>' + bi(e.type) + '</small>' : '') + '</a></li>';
          }).join('')
        : '<li class="empty">' + bi({ zh: '找不到相關內容', en: 'No results found' }) + '</li>';
      box.hidden = false;
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      render();
      if (found.length) location.href = found[0].url;
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) box.hidden = true;
    });
  }

  /* ---------- 首頁輪播 ---------- */
  function initCarousel() {
    var c = $('.carousel');
    if (!c) return;
    var slides = $$('.slide', c);
    var caps = $$('.cap', c);
    var dotsBox = $('.carousel-dots', c);
    if (!slides.length) return;

    var idx = 0;
    var timer = null;

    var dots = slides.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + ' / ' + slides.length);
      b.addEventListener('click', function () { go(i); restart(); });
      if (dotsBox) dotsBox.appendChild(b);
      return b;
    });

    function go(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        s.classList.toggle('is-active', k === idx);
        s.setAttribute('aria-hidden', k === idx ? 'false' : 'true');
      });
      caps.forEach(function (p, k) { p.classList.toggle('is-active', k === idx); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === idx);
        if (k === idx) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    var prev = $('.carousel-prev', c);
    var next = $('.carousel-next', c);
    if (prev) prev.addEventListener('click', function () { go(idx - 1); restart(); });
    if (next) next.addEventListener('click', function () { go(idx + 1); restart(); });

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function start() { if (!reduce && slides.length > 1 && !timer) timer = setInterval(function () { go(idx + 1); }, 6000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    c.addEventListener('mouseenter', stop);
    c.addEventListener('mouseleave', start);
    c.addEventListener('focusin', stop);
    c.addEventListener('focusout', start);
    c.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(idx - 1); }
      else if (e.key === 'ArrowRight') { go(idx + 1); }
    });

    // 觸控滑動
    var x0 = null;
    c.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    c.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) { go(idx + (dx < 0 ? 1 : -1)); restart(); }
    }, { passive: true });

    go(0);
    start();
  }

  /* ---------- 關於我們：分頁籤（網址 #intro / #constitution / #structure）---------- */
  function initTabs() {
    var tabs = $$('.tabs [role="tab"]');
    if (!tabs.length) return;
    var names = tabs.map(function (t) { return t.getAttribute('data-tab'); });

    // 更新網址的 #hash（不觸發捲動）。部分瀏覽器直接開 file:// 時不允許，略過即可。
    function setHash(n) {
      try { history.replaceState(null, '', '#' + n); } catch (e) { /* 網址不變，分頁籤照常切換 */ }
    }

    function show(name, focus) {
      if (names.indexOf(name) === -1) name = names[0];
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-tab') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
        if (on && focus) t.focus();
      });
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        var n = t.getAttribute('data-tab');
        show(n);
        setHash(n);
      });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = names[(i + d + names.length) % names.length];
        show(n, true);
        setHash(n);
      });
    });

    function fromHash() {
      var h = location.hash.replace('#', '');
      show(h);
      if (h && names.indexOf(h) !== -1) {
        var bar = $('.tabs');
        if (bar && bar.scrollIntoView) bar.scrollIntoView();
      }
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  /* ---------- 聯絡表單（沒有後端：整理內容後開啟使用者的郵件程式）---------- */
  var CONTACT_TO = 'medicalphysics.macau@gmail.com';

  function initContact() {
    var form = $('#contact-form');
    if (!form) return;
    var name = $('#c-name');
    var email = $('#c-email');
    var msg = $('#c-message');
    var note = $('#form-note-sent');

    // 首頁「加入會員」帶 ?topic=join 過來時，預填訊息
    if (new URLSearchParams(location.search).get('topic') === 'join' && !msg.value) {
      msg.value = lang() === 'en'
        ? 'Hello, I would like to learn more about joining the Association as a member.'
        : '您好，我想了解並申請加入學會成為會員。';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var en = lang() === 'en';
      var subject = (en ? '[Website inquiry] ' : '[網站查詢] ') + name.value.trim();
      var body = msg.value.trim() + '\n\n—\n' + name.value.trim() + '\n' + email.value.trim();
      location.href = 'mailto:' + CONTACT_TO +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      if (note) note.hidden = false;
    });
  }

  /* ---------- 啟動 ---------- */
  function init() {
    initLang();
    initNav();
    initImages();
    initHomeNews();
    initNewsPage();
    initEventPage();
    initSearch();
    initCarousel();
    initTabs();
    initContact();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
