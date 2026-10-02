// =====================================================
// "NGƯỜI GIỮ KHO" (Service Worker)
// Chạy ngầm, cất sẵn các file của app vào máy để:
//  - mở app nhanh, kể cả khi mất mạng
//  - hiện thông báo nhắc việc
// Mỗi lần sửa code, hãy tăng số phiên bản bên dưới (v1 → v2...)
// để điện thoại biết mà tải bản mới.
// =====================================================

const PHIEN_BAN = "viec-hom-nay-v9";

const CAC_FILE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./thu-chi.js",
  "./may-chu.js",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Lần đầu cài: cất các file vào kho
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PHIEN_BAN).then((kho) => kho.addAll(CAC_FILE)));
  self.skipWaiting();
});

// Dọn kho cũ khi có phiên bản mới
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ds) =>
      Promise.all(ds.filter((ten) => ten !== PHIEN_BAN).map((ten) => caches.delete(ten)))
    )
  );
  self.clients.claim();
});

// Khi app cần file: ưu tiên lấy bản mới trên mạng, mất mạng thì lấy trong kho
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((ketQua) => {
        const banSao = ketQua.clone();
        caches.open(PHIEN_BAN).then((kho) => kho.put(e.request, banSao));
        return ketQua;
      })
      .catch(() => caches.match(e.request))
  );
});

// Máy chủ nhắc giờ gửi thông báo tới (kể cả khi app đang tắt) → hiện lên điện thoại
self.addEventListener("push", (e) => {
  let tin = {};
  try {
    tin = e.data ? e.data.json() : {};
  } catch (loi) {}
  e.waitUntil(
    self.registration.showNotification(tin.tieuDe || "PHAHA", {
      body: tin.noiDung || "",
      icon: "icons/icon-192.png",
      tag: tin.the,
    })
  );
});

// Bấm vào thông báo nhắc việc thì mở app lên
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((ds) =>
      ds.length ? ds[0].focus() : self.clients.openWindow("./")
    )
  );
});
