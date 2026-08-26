/* 我的預購商品清單 — Service Worker
   改版時把 VERSION 加一，舊快取就會被清掉，頁面上也會跳出更新提示。 */
const VERSION = "v2";
const CACHE = "preorder-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-32.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // 個別加入，單一檔案失敗不會讓整個安裝掛掉
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 只管自己網域的東西；Google 的登入與 API 一律直接走網路
  if (url.origin !== self.location.origin) return;

  // HTML 走「先網路後快取」，這樣改版後一連網就會拿到新版，
  // 沒網路時才退回快取。其餘靜態檔走「先快取」，開啟才會快。
  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML){
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        // 兩個位址都要更新。網址是 .../fluffy-guide/ 時瀏覽器要的是 "./"，
        // 只更新 "./index.html" 的話，離線時撈到的會是安裝當下那份舊頁面。
        await c.put("./index.html", fresh.clone());
        await c.put("./", fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req) ||
                       await caches.match("./index.html") ||
                       await caches.match("./");
        return cached || new Response("離線中，而且還沒有快取。請先連一次網路。", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === "basic"){
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
