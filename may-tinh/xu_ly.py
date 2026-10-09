"""Bộ não của tool: tải video → nghe & dịch → phụ đề → lồng tiếng → dựng video → viết content → lưu 1 thư mục.

Mỗi hàm ứng với 1 ô trong sơ đồ quy trình (1. Trigger … 7. Notification).
"""
import asyncio
import csv
import datetime
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import wave

import requests

API = "https://generativelanguage.googleapis.com/v1beta"
MO_HINH = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.0-flash"]
DOAN_GIAY = 300  # nghe mỗi lượt 5 phút cho mốc giờ chính xác
TAN_SO = 24000  # tần số âm thanh giọng đọc

GIONG_DOC = {
    "Nữ - Hoài My": "vi-VN-HoaiMyNeural",
    "Nam - Nam Minh": "vi-VN-NamMinhNeural",
}


class LoiXuLy(Exception):
    """Lỗi có lời giải thích dễ hiểu cho người dùng."""


class DaDung(Exception):
    """Người dùng bấm Dừng."""


# ---------------------------------------------------------------- ffmpeg

def tim_ffmpeg():
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        raise LoiXuLy("Không tìm thấy ffmpeg (công cụ xử lý video). Chạy lại file cài đặt để tự tải.")


def chay_lenh(lenh, cwd=None):
    kw = {}
    if sys.platform == "win32":
        kw["creationflags"] = 0x08000000  # không bật cửa sổ đen
    r = subprocess.run(lenh, cwd=cwd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", **kw)
    return r.returncode, r.stderr


def ffmpeg(*thamso, cwd=None):
    ma, loi = chay_lenh([tim_ffmpeg(), "-hide_banner", "-y", *thamso], cwd=cwd)
    if ma != 0:
        raise LoiXuLy("ffmpeg báo lỗi: " + loi.strip()[-400:])


def thong_tin_media(duong_dan):
    """Trả về (độ dài giây, có tiếng không)."""
    _, loi = chay_lenh([tim_ffmpeg(), "-hide_banner", "-i", duong_dan])
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", loi)
    dai = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    return dai, bool(re.search(r"Stream #.*Audio:", loi))


# ---------------------------------------------------------------- 1. Trigger & input

def link_csv_sheet(link):
    """Đổi link Google Sheet thường thành link tải CSV."""
    m = re.search(r"/spreadsheets/d/([\w-]+)", link)
    if not m:
        raise LoiXuLy("Link Google Sheet không đúng dạng docs.google.com/spreadsheets/d/...")
    gid = re.search(r"[#&?]gid=(\d+)", link)
    return (f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv"
            + (f"&gid={gid.group(1)}" if gid else ""))


def _cot(tieu_de, *tu_khoa):
    for i, t in enumerate(tieu_de):
        t = t.strip().lower()
        if any(k in t for k in tu_khoa):
            return i
    return None


def doc_bang(noi_dung_csv):
    """Đọc bảng (CSV) → danh sách việc. Chỉ lấy dòng trạng thái trống/NEW."""
    dong = list(csv.reader(io.StringIO(noi_dung_csv)))
    if not dong:
        return []
    td = dong[0]
    c_url = _cot(td, "url", "link")
    if c_url is None:
        raise LoiXuLy("Bảng cần có cột tên 'URL' hoặc 'Link'.")
    c_ten = _cot(td, "tên", "ten", "title", "tiêu đề")
    c_nen = _cot(td, "nền tảng", "nen tang", "platform")
    c_tt = _cot(td, "trạng thái", "trang thai", "status")
    c_nd = _cot(td, "nội dung", "noi dung", "content", "post")
    ra = []
    for d in dong[1:]:
        lay = lambda c: d[c].strip() if c is not None and c < len(d) else ""
        url = lay(c_url)
        if not url:
            continue
        tt = lay(c_tt).upper()
        if tt and tt not in ("NEW", "MỚI", "MOI"):
            continue
        ra.append({"url": url, "ten": lay(c_ten), "nen_tang": lay(c_nen), "noi_dung": lay(c_nd)})
    return ra


def tai_google_sheet(link):
    r = requests.get(link_csv_sheet(link), timeout=60)
    if r.status_code != 200 or "<html" in r.text[:200].lower():
        raise LoiXuLy("Không đọc được Sheet. Mở Sheet → Chia sẻ → 'Bất kỳ ai có đường liên kết' → Người xem.")
    r.encoding = "utf-8"
    return doc_bang(r.text)


# ---------------------------------------------------------------- 2. Get source

def tao_thu_muc(goc):
    ngay = os.path.join(goc, datetime.date.today().isoformat())
    os.makedirs(ngay, exist_ok=True)
    n = 1
    while os.path.exists(os.path.join(ngay, f"Video_{n:03d}")):
        n += 1
    tm = os.path.join(ngay, f"Video_{n:03d}")
    os.makedirs(tm)
    return tm


def tai_video(url, thu_muc, cai_dat, log):
    """Tải video về 01_original.*  → trả về (đường dẫn, thông tin bài viết)."""
    if os.path.isfile(url):
        duoi = os.path.splitext(url)[1] or ".mp4"
        dich = os.path.join(thu_muc, "01_original" + duoi)
        shutil.copy2(url, dich)
        return dich, {"title": os.path.basename(url)}
    try:
        import yt_dlp
    except ImportError:
        raise LoiXuLy("Thiếu bộ tải video yt-dlp. Chạy lại file cài đặt.")
    tuy_chon = {
        "outtmpl": os.path.join(thu_muc, "01_original.%(ext)s"),
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "ffmpeg_location": tim_ffmpeg(),
        "quiet": True, "no_warnings": True, "noplaylist": True,
    }
    if cai_dat.get("cookie_file"):
        tuy_chon["cookiefile"] = cai_dat["cookie_file"]
    elif cai_dat.get("cookie_trinh_duyet"):
        tuy_chon["cookiesfrombrowser"] = (cai_dat["cookie_trinh_duyet"],)
    try:
        with yt_dlp.YoutubeDL(tuy_chon) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:
        raise LoiXuLy("Không tải được video: " + str(e)[-300:]
                      + "\n→ Thử: ⚙️ Cài đặt → chọn trình duyệt đã đăng nhập trang đó, hoặc tải tay rồi chọn file trên máy.")
    for f in os.listdir(thu_muc):
        if f.startswith("01_original.") and not f.endswith((".part", ".ytdl")):
            return os.path.join(thu_muc, f), info or {}
    raise LoiXuLy("Tải xong nhưng không thấy file video.")


# ---------------------------------------------------------------- Gemini

def doc_json(chu):
    chu = chu.strip()
    chu = re.sub(r"^```(?:json)?|```$", "", chu, flags=re.M).strip()
    try:
        return json.loads(chu)
    except json.JSONDecodeError:
        m = re.search(r"[\[{].*[\]}]", chu, re.S)
        if m:
            return json.loads(m.group(0))
        raise


def goi_gemini(ma, cac_phan, dung=lambda: False):
    if not ma:
        raise LoiXuLy("Chưa có mã Gemini. Vào tab ⚙️ Cài đặt để dán mã (lấy tại aistudio.google.com/apikey).")
    loi_cuoi = ""
    for mh in MO_HINH:
        for lan in range(3):
            if dung():
                raise DaDung()
            try:
                r = requests.post(
                    f"{API}/models/{mh}:generateContent",
                    headers={"x-goog-api-key": ma},
                    json={"contents": [{"parts": cac_phan}],
                          "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}},
                    timeout=600)
            except requests.RequestException as e:
                loi_cuoi = f"mất mạng ({e.__class__.__name__})"
                time.sleep(5 * (lan + 1))
                continue
            if r.status_code == 200:
                try:
                    d = r.json()
                    chu = "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"])
                    return doc_json(chu)
                except Exception:
                    loi_cuoi = "Gemini trả lời sai dạng"
                    continue
            loi_cuoi = f"{r.status_code}: {r.text[:200]}"
            if r.status_code in (400, 401, 403) and "API_KEY" in r.text.upper():
                raise LoiXuLy("Mã Gemini không đúng hoặc đã bị khoá. Kiểm tra lại trong ⚙️ Cài đặt.")
            if r.status_code == 404:
                break  # mô hình này không còn → thử mô hình khác
            if r.status_code == 429:
                if "per day" in r.text.lower() or "PerDay" in r.text:
                    break  # hết lượt trong ngày của mô hình này
                time.sleep(20 * (lan + 1))
            else:
                time.sleep(5 * (lan + 1))
    raise LoiXuLy("Gemini không trả lời được (có thể hết lượt miễn phí). Chi tiết: " + loi_cuoi)


# ---------------------------------------------------------------- 3A. Video processing

def nghe_va_dich(video, thu_muc, cai_dat, log, dung):
    """Tách tiếng → chia đoạn 5 phút → Gemini nghe tiếng Trung và dịch Việt."""
    import base64
    dai, co_tieng = thong_tin_media(video)
    if not co_tieng:
        log("   Video không có tiếng → bỏ qua phụ đề.")
        return [], dai
    tam = os.path.join(thu_muc, "_tam")
    os.makedirs(tam, exist_ok=True)
    linh_vuc = cai_dat.get("linh_vuc", "").strip()
    cau = []
    bd = 0.0
    while bd < dai - 0.5:
        if dung():
            raise DaDung()
        dai_doan = min(DOAN_GIAY, dai - bd)
        f = os.path.join(tam, f"tieng_{int(bd)}.mp3")
        ffmpeg("-ss", str(bd), "-t", str(dai_doan), "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", f)
        log(f"   Đang nghe & dịch đoạn {int(bd // 60)}:{int(bd % 60):02d} …")
        with open(f, "rb") as fh:
            du_lieu = base64.b64encode(fh.read()).decode()
        loi_dan = (
            f"Đây là đoạn âm thanh dài {dai_doan:.1f} giây, người nói tiếng Trung.\n"
            "1) Nghe và chép lại lời nói thành các câu phụ đề ngắn (mỗi câu 1–6 giây, tối đa ~16 chữ Hán).\n"
            "2) Dịch từng câu sang tiếng Việt tự nhiên, sát nghĩa, ngắn gọn để làm phụ đề"
            + (f", dùng đúng thuật ngữ ngành {linh_vuc}" if linh_vuc else "") + ".\n"
            "Mốc giờ tính bằng giây tính từ đầu đoạn này, chính xác theo lúc người nói bắt đầu/kết thúc.\n"
            'Trả về JSON: {"cau":[{"bd":0.0,"kt":2.5,"zh":"…","vi":"…"}]}. '
            'Không có lời nói thì trả {"cau":[]}. Bỏ qua tiếng nhạc, tiếng động.')
        kq = goi_gemini(cai_dat.get("gemini"), [
            {"inline_data": {"mime_type": "audio/mp3", "data": du_lieu}}, {"text": loi_dan}], dung)
        for c in (kq.get("cau", []) if isinstance(kq, dict) else kq):
            try:
                cau.append({"bd": float(c["bd"]) + bd, "kt": float(c["kt"]) + bd,
                            "zh": str(c.get("zh", "")).strip(), "vi": str(c.get("vi", "")).strip()})
            except (KeyError, TypeError, ValueError):
                pass
        bd += dai_doan
    return cau, dai


def chuan_hoa_moc_gio(cau, dai):
    """Format transcript: sắp xếp, bỏ câu rỗng, không cho câu chồng lên nhau."""
    cau = sorted((c for c in cau if c["vi"]), key=lambda c: c["bd"])
    for i, c in enumerate(cau):
        c["bd"] = max(0.0, min(c["bd"], dai))
        tiep = cau[i + 1]["bd"] if i + 1 < len(cau) else dai
        if c["kt"] <= c["bd"] + 0.3:
            c["kt"] = c["bd"] + max(1.0, len(c["vi"].split()) * 0.3)
        c["kt"] = min(c["kt"], max(tiep, c["bd"] + 0.3), dai or c["kt"])
    return cau


# ---------------------------------------------------------------- 3B. Translate & subtitle

def kiem_tra_rut_gon(cau, cai_dat, log, dung):
    """QC: Gemini đọc lại cả bài, sửa câu dịch sai/dài cho vừa thời gian."""
    if not cau:
        return cau
    log("   Kiểm tra & rút gọn phụ đề …")
    ds = [{"i": i, "giay": round(c["kt"] - c["bd"], 1), "zh": c["zh"], "vi": c["vi"]} for i, c in enumerate(cau)]
    loi_dan = (
        "Đây là phụ đề video dịch từ tiếng Trung sang tiếng Việt. Hãy đọc cả bài để hiểu ngữ cảnh rồi sửa:\n"
        "- câu dịch sai nghĩa, xưng hô không thống nhất, tên riêng/thuật ngữ không đúng;\n"
        "- câu quá dài so với thời gian (đọc khoảng 4 từ/giây) thì rút gọn, giữ ý chính.\n"
        'Trả về JSON: {"cau":[{"i":0,"vi":"…"}]} với đủ mọi câu.\n\n' + json.dumps(ds, ensure_ascii=False))
    try:
        kq = goi_gemini(cai_dat.get("gemini"), [{"text": loi_dan}], dung)
        for c in (kq.get("cau", []) if isinstance(kq, dict) else kq):
            i = int(c.get("i", -1))
            if 0 <= i < len(cau) and str(c.get("vi", "")).strip():
                cau[i]["vi"] = str(c["vi"]).strip()
    except DaDung:
        raise
    except Exception as e:
        log(f"   (Bỏ qua bước kiểm tra: {e})")
    return cau


def _gio_srt(s):
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def ghi_srt(cau, duong_dan):
    with open(duong_dan, "w", encoding="utf-8") as f:
        for i, c in enumerate(cau, 1):
            f.write(f"{i}\n{_gio_srt(c['bd'])} --> {_gio_srt(c['kt'])}\n{c['vi']}\n\n")


# ---------------------------------------------------------------- 3C. Voice

def doc_giong(chu, giong, toc_do, duong_dan):
    import edge_tts

    async def _chay():
        await edge_tts.Communicate(chu, giong, rate=toc_do).save(duong_dan)

    loi = None
    for lan in range(3):
        try:
            asyncio.run(_chay())
            if os.path.getsize(duong_dan) > 0:
                return
        except Exception as e:
            loi = e
            time.sleep(2 * (lan + 1))
    raise LoiXuLy(f"Không tạo được giọng đọc (cần mạng): {loi}")


def tao_giong_viet(cau, dai, thu_muc, cai_dat, log, dung):
    """Split sentences → Text to speech → Merge audio thành 1 file khớp mốc giờ."""
    tam = os.path.join(thu_muc, "_tam")
    os.makedirs(tam, exist_ok=True)
    giong = cai_dat.get("giong", "vi-VN-HoaiMyNeural")
    toc_do = cai_dat.get("toc_do", "+10%")
    ra = os.path.join(tam, "giong_viet.wav")
    with wave.open(ra, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAN_SO)
        da_ghi = 0
        for i, c in enumerate(cau):
            if dung():
                raise DaDung()
            if i % 10 == 0:
                log(f"   Đọc giọng Việt câu {i + 1}/{len(cau)} …")
            mp3 = os.path.join(tam, f"cau_{i:04d}.mp3")
            doc_giong(c["vi"], giong, toc_do, mp3)
            dai_cau, _ = thong_tin_media(mp3)
            tiep = cau[i + 1]["bd"] if i + 1 < len(cau) else max(dai, c["kt"])
            cho = max(tiep - c["bd"], c["kt"] - c["bd"], 0.5)
            nhanh = min(max(dai_cau / cho, 1.0), 1.6)  # đọc nhanh hơn nếu không vừa chỗ
            wav = os.path.join(tam, f"cau_{i:04d}.wav")
            ffmpeg("-i", mp3, "-af", f"atempo={nhanh:.3f}", "-ar", str(TAN_SO), "-ac", "1", "-sample_fmt", "s16", wav)
            dich = int(c["bd"] * TAN_SO)
            if dich > da_ghi:
                w.writeframes(b"\x00\x00" * (dich - da_ghi))
                da_ghi = dich
            with wave.open(wav, "rb") as r:
                khung = r.readframes(r.getnframes())
            w.writeframes(khung)
            da_ghi += len(khung) // 2
        cuoi = int(dai * TAN_SO)
        if cuoi > da_ghi:
            w.writeframes(b"\x00\x00" * (cuoi - da_ghi))
    return ra


# ---------------------------------------------------------------- 3D. Render video

KIEU_CHU = ("FontName=Arial,FontSize={co},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
            "BorderStyle=1,Outline=1.6,Shadow=0,Bold=1,MarginV=28,Alignment=2")


def dung_video(video, srt, giong_wav, ra, cai_dat, log):
    """Add subtitle & audio → 02_video_vietnamese.mp4"""
    _, co_tieng = thong_tin_media(video)
    thu_muc = os.path.dirname(ra)
    goc = max(0.0, min(float(cai_dat.get("am_luong_goc", 0.15)), 1.0))

    def lenh(chen_chu):
        ts = ["-i", video]
        if giong_wav:
            ts += ["-i", giong_wav]
        if srt and not chen_chu:
            ts += ["-i", srt]
        loc = []
        if giong_wav and co_tieng:
            loc.append(f"[0:a]volume={goc}[a0];[a0][1:a]amix=inputs=2:duration=first:normalize=0[a]")
            ts += ["-filter_complex", ";".join(loc), "-map", "0:v:0", "-map", "[a]"]
        elif giong_wav:
            ts += ["-map", "0:v:0", "-map", "1:a", "-shortest"]
        else:
            ts += ["-map", "0:v:0"] + (["-map", "0:a?"] if co_tieng else [])
        if srt and chen_chu:
            co = int(cai_dat.get("co_chu", 14))
            ts += ["-vf", f"subtitles={os.path.basename(srt)}:force_style='{KIEU_CHU.format(co=co)}'",
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
        else:
            ts += ["-c:v", "copy"]
        if srt and not chen_chu:
            ts += ["-map", f"{2 if giong_wav else 1}:s", "-c:s", "mov_text", "-metadata:s:s:0", "language=vie"]
        ts += ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", os.path.basename(ra)]
        return ts

    chen_chu = bool(srt) and cai_dat.get("chen_phu_de", True)
    try:
        ffmpeg(*lenh(chen_chu), cwd=thu_muc)
    except LoiXuLy as e:
        if not chen_chu:
            raise
        log(f"   Không chèn chữ vào hình được ({str(e)[-120:]}) → gắn phụ đề dạng bật/tắt.")
        ffmpeg(*lenh(False), cwd=thu_muc)


# ---------------------------------------------------------------- 4. Content pipeline

def lam_sach(chu):
    chu = re.sub(r"https?://\S+", "", chu)
    chu = re.sub(r"(#\S+\s*){4,}", " ", chu)  # bỏ chuỗi hashtag dài thừa
    chu = re.sub(r"@\S+", "", chu)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", chu)).strip()


def viet_content(noi_dung_goc, cau, cai_dat, log, dung):
    goc = lam_sach(noi_dung_goc)
    loi_video = " ".join(c["vi"] for c in cau)[:4000]
    if not goc and not loi_video:
        return None
    log("   Dịch & viết 3 bản content …")
    linh_vuc = cai_dat.get("linh_vuc", "").strip()
    loi_dan = (
        "Bạn là người viết content mạng xã hội tiếng Việt" + (f" ngành {linh_vuc}" if linh_vuc else "") + ".\n"
        f"Bài viết gốc (tiếng Trung, có thể trống):\n{goc or '(trống)'}\n\n"
        f"Nội dung lời nói trong video (đã dịch):\n{loi_video or '(trống)'}\n\n"
        "Hãy trả về JSON với các khoá:\n"
        '"vi": bản dịch tiếng Việt sát nghĩa của bài viết gốc (nếu bài gốc trống thì tóm tắt video);\n'
        '"tiktok": caption TikTok ngắn gọn, có câu mở đầu gây tò mò, 3–5 hashtag tiếng Việt;\n'
        '"instagram": caption Instagram cảm xúc, có emoji vừa phải, 5–8 hashtag;\n'
        '"facebook": bài Facebook đầy đủ, chia đoạn dễ đọc, có lời kêu gọi tương tác cuối bài.')
    kq = goi_gemini(cai_dat.get("gemini"), [{"text": loi_dan}], dung)
    return {"goc": goc, **{k: str(kq.get(k, "")).strip() for k in ("vi", "tiktok", "instagram", "facebook")}}


# ---------------------------------------------------------------- 5–7. Save, sheet, notify

def ghi(thu_muc, ten, chu):
    with open(os.path.join(thu_muc, ten), "w", encoding="utf-8") as f:
        f.write(chu)


def bao_sheet(cai_dat, viec, trang_thai, thu_muc="", loi=""):
    url = cai_dat.get("sheet_webhook", "").strip()
    if not url:
        return
    try:
        requests.post(url, json={"url": viec["url"], "trang_thai": trang_thai,
                                 "thu_muc": thu_muc, "loi": loi}, timeout=30)
    except requests.RequestException:
        pass


def bao_telegram(cai_dat, chu):
    token, chat = cai_dat.get("tg_token", "").strip(), cai_dat.get("tg_chat", "").strip()
    if not token or not chat:
        return
    try:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat, "text": chu}, timeout=30)
    except requests.RequestException:
        pass


# ---------------------------------------------------------------- Chạy cả quy trình cho 1 video

def xu_ly_mot(viec, cai_dat, log, dung=lambda: False):
    """Chạy toàn bộ quy trình cho 1 video. Trả về đường dẫn thư mục kết quả."""
    bat_dau = time.time()
    goc = cai_dat.get("thu_muc_luu") or os.path.join(os.path.expanduser("~"), "PhaHa-ket-qua")
    thu_muc = tao_thu_muc(goc)
    log(f"📁 {thu_muc}")
    meta = {"url": viec["url"], "ten": viec.get("ten", ""), "nen_tang": viec.get("nen_tang", ""),
            "bat_dau": datetime.datetime.now().isoformat(timespec="seconds"), "buoc": []}
    try:
        log("⬇️  Tải video …")
        video, info = tai_video(viec["url"], thu_muc, cai_dat, log)
        meta["buoc"].append("tai_video")
        meta["tieu_de_goc"] = info.get("title", "")
        if dung():
            raise DaDung()

        log("🎧 Nghe tiếng Trung & dịch …")
        cau, dai = nghe_va_dich(video, thu_muc, cai_dat, log, dung)
        cau = chuan_hoa_moc_gio(cau, dai)
        cau = kiem_tra_rut_gon(cau, cai_dat, log, dung)
        srt = None
        if cau:
            srt = os.path.join(thu_muc, "03_subtitle_vi.srt")
            ghi_srt(cau, srt)
            ghi(thu_muc, "03_subtitle_song_ngu.json", json.dumps(cau, ensure_ascii=False, indent=1))
        meta["so_cau"] = len(cau)
        meta["do_dai_giay"] = round(dai, 1)
        meta["buoc"].append("phu_de")

        giong = None
        if cai_dat.get("long_tieng", True) and cau:
            log("🗣️  Lồng tiếng Việt …")
            giong = tao_giong_viet(cau, dai, thu_muc, cai_dat, log, dung)
            meta["buoc"].append("long_tieng")

        if srt or giong:
            log("🎬 Dựng video tiếng Việt …")
            dung_video(video, srt if cai_dat.get("phu_de", True) else None, giong,
                       os.path.join(thu_muc, "02_video_vietnamese.mp4"), cai_dat, log)
            meta["buoc"].append("dung_video")

        if cai_dat.get("viet_content", True):
            noi_dung = viec.get("noi_dung") or info.get("description") or info.get("title") or ""
            ct = viet_content(noi_dung, cau, cai_dat, log, dung)
            if ct:
                ghi(thu_muc, "04_content_original.txt", ct["goc"])
                ghi(thu_muc, "04b_content_vi.txt", ct["vi"])
                ghi(thu_muc, "05_content_vi_tiktok.txt", ct["tiktok"])
                ghi(thu_muc, "06_content_vi_instagram.txt", ct["instagram"])
                ghi(thu_muc, "07_content_vi_facebook.txt", ct["facebook"])
                meta["buoc"].append("content")

        meta["trang_thai"] = "DONE"
        log(f"✅ Xong sau {int(time.time() - bat_dau)} giây.")
        bao_sheet(cai_dat, viec, "DONE", thu_muc)
        bao_telegram(cai_dat, f"✅ Xong: {viec.get('ten') or viec['url']}\n📁 {thu_muc}")
        return thu_muc
    except DaDung:
        meta["trang_thai"] = "ĐÃ DỪNG"
        raise
    except Exception as e:
        meta["trang_thai"] = "ERROR"
        meta["loi"] = str(e)
        bao_sheet(cai_dat, viec, "ERROR", thu_muc, str(e))
        bao_telegram(cai_dat, f"❌ Lỗi: {viec.get('ten') or viec['url']}\n{str(e)[:500]}")
        raise
    finally:
        meta["ket_thuc"] = datetime.datetime.now().isoformat(timespec="seconds")
        meta["giong"] = cai_dat.get("giong")
        ghi(thu_muc, "08_metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))
        if not cai_dat.get("giu_file_tam"):
            shutil.rmtree(os.path.join(thu_muc, "_tam"), ignore_errors=True)
