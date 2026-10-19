/* ============================================================
   最新消息資料 / News data
   首頁「最新消息及活動」與 news.html 列表都讀這個檔案。
   新增一則消息：複製下面的 { ... } 區塊，貼在陣列裡（順序不拘，網頁會依 date 由新到舊排序）。

   date     列表上顯示的日期，格式 'YYYY.MM.DD'（也用來排序）
   url      該則消息的介紹頁（複製 news-20260920.html 修改即可）
   poster   列表右側的海報縮圖；檔案不存在時會顯示漸層佔位
   title / summary   zh = 中文、en = English
   album    （選填）活動相片的路徑清單。填了之後，活動日期一過，
            列表上會自動出現「回顧」標籤，連到活動頁底部的相冊；
            活動日期之前即使有填，也不會顯示。沒有相片就整個不要寫 album。
   ============================================================ */
window.MMPA_NEWS = [
  {
    date: '2026.09.20',
    url: 'news-20260920.html',
    poster: 'images/news/20260920_poster.jpg',
    // 相片放在 images/news/20260920/ 資料夾，檔名依下面填寫（以下 8 張只是示範，請換成實際檔名與數量）
    album: [
      'images/news/20260920/01.jpg',
      'images/news/20260920/02.jpg',
      'images/news/20260920/03.jpg',
      'images/news/20260920/04.jpg',
      'images/news/20260920/05.jpg',
      'images/news/20260920/06.jpg',
      'images/news/20260920/07.jpg',
      'images/news/20260920/08.jpg',
      'images/news/20260920/09.jpg',
      'images/news/20260920/10.jpg'

    ],
    title: {
      zh: '澳門醫學物理學會成立典禮',
      en: 'Inauguration Ceremony of the Macau Medical Physics Association'
    },
    summary: {
      zh: '澳門醫學物理學會於 2024 年 9 月 19 日登記成立，謹訂於 2026 年 9 月 20 日（星期日）下午三時假澳門旅遊塔會議中心舉行成立典禮，特邀北京、澳門及香港三地專家學者及相關專業學會代表出席。',
      en: 'Registered on 19 September 2024, the Association holds its inaugural ceremony on Sunday, 20 September 2026 at 3:00 PM at the Macau Tower Convention Centre, with invited experts and society representatives from Beijing, Macau and Hong Kong.'
    }
  }
];
