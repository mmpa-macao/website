/* ============================================================
   出版刊物資料 / Publications data
   publications.html 讀這個檔案，依期號由新到舊排列。
   新增一期：複製下面的 { ... } 區塊，貼在陣列裡，改期號、日期、檔名與標題。

   issue    期號（數字）
   date     出版日期，格式 'YYYY.MM.DD'
   cover    封面圖片路徑（建議 JPG，寬約 900 px、檔案 300 KB 以下）；檔案不存在時會顯示漸層佔位
   pdf      該期 PDF 的路徑；點擊封面會在新分頁開啟
   title    zh = 中文、en = English
   檔案放在 publications/ 資料夾（見 publications/README.md）。
   ============================================================ */
window.MMPA_PUBS = [
  {
    issue: 0,
    date: 'YYYY.MM.DD',
    cover: 'publications/template-cover.jpg',
    pdf: 'publications/template.pdf',
    title: {
      zh: '範例刊物',
      en: 'template publication'
    }
  },
  {
    issue: 1,
    date: '2026.12.01',   // TODO: 暫定日期，上線前請改成實際出版日期
    cover: 'publications/yearbook-01-cover.jpg',
    pdf: 'publications/yearbook-01.pdf',
    title: {
      zh: '《追光》第 1 期',
      en: 'Yearbook — Issue 1'
    }
  }
];
