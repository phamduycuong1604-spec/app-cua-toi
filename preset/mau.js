/* Dựng trang bán 1 bộ màu từ bo-mau.json. Tên bộ màu lấy theo tên thư mục (vd: /preset/kodak/ -> "kodak"). */
(function () {
  var id = location.pathname.split("/").filter(Boolean).filter(function (p) { return !/\.html?$/.test(p); }).pop();
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function loi(msg) {
    var b = el("p", "hop phu", msg);
    b.style.padding = "40px 16px";
    document.body.appendChild(b);
  }
  fetch("../bo-mau.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (cfg) {
    var d = cfg.bo_mau[id];
    if (!d) return loi("Không tìm thấy bộ màu này.");
    document.title = d.ten;
    var link = "https://m.me/" + cfg.ten_trang_facebook + "?text=" + encodeURIComponent(d.tin_nhan);
    function nutMua(text) {
      var a = el("a", "nut", text);
      a.href = link;
      a.addEventListener("click", function () { try { navigator.clipboard.writeText(d.tin_nhan); } catch (e) {} });
      return a;
    }
    var body = document.body;

    var dau = el("header", "hop");
    dau.appendChild(el("h1", null, d.ten));
    var img = el("img", "bia");
    img.src = /^https?:/.test(d.anh) ? d.anh : "../" + d.anh;
    img.alt = d.ten;
    dau.appendChild(img);
    var gia = el("div", "gia"); gia.appendChild(el("b", null, d.gia)); dau.appendChild(gia);
    dau.appendChild(nutMua("Mua ngay qua Messenger"));
    dau.appendChild(el("p", "phu ghichu", "Cần có ứng dụng Messenger để nhắn tin"));
    body.appendChild(dau);

    if (d.gom && d.gom.length) {
      var s1 = el("section", "hop"); s1.appendChild(el("h2", null, "Trong bộ có gì?"));
      var lu = el("div", "luoi");
      d.gom.forEach(function (g) { var o = el("div", "o", g[1]); o.insertBefore(el("b", null, g[0]), o.firstChild); lu.appendChild(o); });
      s1.appendChild(lu); body.appendChild(s1);
    }
    if (d.dung_duoc_tren && d.dung_duoc_tren.length) {
      var s2 = el("section", "hop"); s2.appendChild(el("h2", null, "Dùng được trên"));
      var ul = el("ul", "ds");
      d.dung_duoc_tren.forEach(function (t) {
        var li = el("li"), i = t.indexOf(":");
        if (i > 0) { li.appendChild(el("b", null, t.slice(0, i + 1))); li.appendChild(document.createTextNode(t.slice(i + 1))); }
        else li.textContent = t;
        ul.appendChild(li);
      });
      s2.appendChild(ul); body.appendChild(s2);
    }
    if (d.hay_hoi && d.hay_hoi.length) {
      var s3 = el("section", "hop"); s3.appendChild(el("h2", null, "Hay hỏi"));
      d.hay_hoi.forEach(function (q) {
        var de = el("details"); de.appendChild(el("summary", null, q[0])); de.appendChild(el("p", null, q[1])); s3.appendChild(de);
      });
      body.appendChild(s3);
    }
    var cuoi = el("footer", "hop cuoi"); cuoi.appendChild(nutMua("Mua ngay qua Messenger")); body.appendChild(cuoi);
    var dinh = el("div", "dinh"); dinh.appendChild(nutMua("Mua ngay – " + d.gia)); body.appendChild(dinh);
  }).catch(function () { loi("Trang đang tải lỗi, bạn thử lại sau nhé."); });
})();
