// TransKeep — trang web: chọn ảnh → gửi máy chủ → theo dõi tiến trình → xem, sửa, tải về
const $ = (id) => document.getElementById(id);
const FONT_NAMES = { sans: "Không chân (Be Vietnam Pro)", serif: "Có chân (Noto Serif)", handwriting: "Viết tay", display: "Tiêu đề đậm (Anton)" };
const PROVIDER_NAMES = { gemini: "Gemini (Google AI)", openai: "OpenAI (ChatGPT)", deepl: "DeepL", google: "Google Dịch" };

let info = null;     // thông tin máy chủ
let job = null;      // việc đang xem
let regions = [];    // các vùng chữ

// ---------- Lưu cài đặt trên máy người dùng ----------
const store = {
  get(k, d = "") { try { return localStorage.getItem("tk_" + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tk_" + k, v); } catch {} },
};

function headers() {
  return { "x-app-password": $("password").value };
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Lỗi máy chủ (${res.status})`);
  return data;
}

function fillSelect(sel, items, names, value) {
  sel.innerHTML = items.map((v) => `<option value="${v}">${names[v] || v}</option>`).join("");
  if (value && items.includes(value)) sel.value = value;
}

// ---------- Khởi động ----------
async function init() {
  info = await api("/api/info");
  $("pw-row").hidden = !info.need_password;
  $("password").value = store.get("password");
  fillSelect($("provider"), info.providers, PROVIDER_NAMES, store.get("provider", "gemini"));
  fillSelect($("domain"), Object.keys(info.domains), info.domains, store.get("domain", "general"));
  fillSelect($("font"), info.fonts, FONT_NAMES, store.get("font", "sans"));
  onProviderChange();
  if (info.need_password && !$("password").value) $("settings").open = true;

  $("provider").onchange = () => { store.set("provider", $("provider").value); onProviderChange(); };
  $("api-key").oninput = () => store.set("key_" + $("provider").value, $("api-key").value);
  $("domain").onchange = () => store.set("domain", $("domain").value);
  $("font").onchange = () => store.set("font", $("font").value);
  $("password").oninput = () => store.set("password", $("password").value);
}

function onProviderChange() {
  const p = $("provider").value;
  $("api-key").value = store.get("key_" + p);
  const onServer = info.server_keys.includes(p);
  $("key-hint").textContent = onServer ? "Máy chủ đã có sẵn chìa khóa — có thể để trống." : "Cần nhập chìa khóa của bạn.";
  if (!onServer && !$("api-key").value) $("settings").open = true;
}

// ---------- Chọn / kéo thả file ----------
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
});
$("file").onchange = () => { if ($("file").files[0]) upload($("file").files[0]); };

async function upload(file) {
  $("result-box").hidden = true;
  drop.hidden = true;
  showProgress(0, `Đang gửi ${file.name}…`);
  const form = new FormData();
  form.append("file", file);
  form.append("options", JSON.stringify({
    provider: $("provider").value,
    api_key: $("api-key").value,
    domain: $("domain").value,
    font: $("font").value,
  }));
  try {
    job = await api("/api/jobs", { method: "POST", body: form });
    poll();
  } catch (e) {
    showError(e.message);
  }
}

// Hỏi máy chủ mỗi giây xem xử lý tới đâu
async function poll() {
  try {
    job = await api(`/api/jobs/${job.id}`);
  } catch (e) {
    return showError(e.message);
  }
  if (job.status === "error") return showError(job.message);
  showProgress(job.progress, job.message);
  if (job.status === "done") return showResult();
  setTimeout(poll, 1000);
}

function showProgress(value, msg) {
  $("progress-box").hidden = false;
  $("bar-fill").style.width = `${Math.round(value * 100)}%`;
  const p = $("progress-msg");
  p.className = "";
  p.textContent = msg;
}

function showError(msg) {
  showProgress(0, "");
  const p = $("progress-msg");
  p.className = "error";
  p.textContent = "⚠️ " + msg;
  drop.hidden = false;
}

// ---------- Kết quả ----------
function fileUrl(name) {
  return `/api/jobs/${job.id}/files/${name}?t=${Date.now()}`;
}

function showResult() {
  $("progress-box").hidden = job.regions?.length > 0;
  regions = job.regions || [];
  $("img-before").src = fileUrl("original.png");
  $("img-after").src = fileUrl("result.png");
  $("download").href = fileUrl("result.png");
  $("download").download = (job.filename || "anh").replace(/\.[^.]+$/, "") + "-tieng-viet.png";
  $("result-box").hidden = false;
  renderRegions();
}

$("slider").oninput = () => {
  const v = $("slider").value;
  $("img-before").style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  $("divider").style.left = `${v}%`;
};

$("again").onclick = () => {
  $("result-box").hidden = true;
  $("progress-box").hidden = true;
  drop.hidden = false;
  $("file").value = "";
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderRegions() {
  const fontOpts = (cur) => info.fonts.map((f) => `<option value="${f}" ${f === cur ? "selected" : ""}>${FONT_NAMES[f] || f}</option>`).join("");
  $("regions").innerHTML = regions.length ? regions.map((r, i) => `
    <div class="region" data-i="${i}">
      <div class="src">${i + 1}. ${esc(r.src)}</div>
      <textarea rows="1" data-k="text">${esc(r.text)}</textarea>
      <div class="tools">
        <label><input type="checkbox" data-k="enabled" ${r.enabled ? "checked" : ""}> Dịch vùng này</label>
        <label>Màu <input type="color" data-k="color" value="${r.color}"></label>
        <label>Viền <input type="checkbox" data-k="has_stroke" ${r.stroke_color ? "checked" : ""}>
          <input type="color" data-k="stroke_color" value="${r.stroke_color || "#000000"}"></label>
        <label><input type="checkbox" data-k="bold" ${r.bold ? "checked" : ""}> Đậm</label>
        <select data-k="font">${fontOpts(r.font)}</select>
      </div>
    </div>`).join("") : "<p class='hint'>Không có vùng chữ Trung nào.</p>";
}

// Đọc lại các ô người dùng đã sửa
function collectRegions() {
  document.querySelectorAll(".region").forEach((el) => {
    const r = regions[+el.dataset.i];
    const v = (k) => el.querySelector(`[data-k=${k}]`);
    r.text = v("text").value;
    r.enabled = v("enabled").checked;
    r.color = v("color").value;
    r.bold = v("bold").checked;
    r.font = v("font").value;
    r.stroke_color = v("has_stroke").checked ? v("stroke_color").value : null;
    if (r.stroke_color && !r.stroke_width) r.stroke_width = 2;
  });
}

$("apply").onclick = async () => {
  collectRegions();
  const btn = $("apply");
  btn.disabled = true;
  btn.textContent = "Đang vẽ…";
  try {
    const data = await api(`/api/jobs/${job.id}/regions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regions }),
    });
    regions = data.regions;
    $("img-after").src = fileUrl("result.png");
    $("download").href = fileUrl("result.png");
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Vẽ lại";
  }
};

init().catch((e) => showError("Không kết nối được máy chủ: " + e.message));
