"""PhaHa Tool – cửa sổ chính. Chạy: python phaha_tool.py"""
import json
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

import xu_ly

THU_MUC_APP = os.path.dirname(os.path.abspath(__file__))
FILE_CAI_DAT = os.path.join(THU_MUC_APP, "cai-dat.json")
FILE_NHAT_KY = os.path.join(THU_MUC_APP, "nhat-ky.txt")

MAC_DINH = {
    "gemini": "", "giong": "vi-VN-HoaiMyNeural", "toc_do": "+10%", "am_luong_goc": 0.15,
    "co_chu": 14, "thu_muc_luu": os.path.join(os.path.expanduser("~"), "PhaHa-ket-qua"),
    "linh_vuc": "", "cookie_trinh_duyet": "", "cookie_file": "", "sheet_link": "",
    "sheet_webhook": "", "tg_token": "", "tg_chat": "",
    "phu_de": True, "chen_phu_de": True, "long_tieng": True, "viet_content": True,
}


def doc_cai_dat():
    cd = dict(MAC_DINH)
    try:
        with open(FILE_CAI_DAT, encoding="utf-8") as f:
            cd.update(json.load(f))
    except (OSError, ValueError):
        pass
    return cd


def mo_file(p):
    if sys.platform == "win32":
        os.startfile(p)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", p])
    else:
        subprocess.Popen(["xdg-open", p])


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PhaHa Tool – Dịch video Trung → Việt + viết content")
        self.geometry("980x680")
        self.minsize(820, 560)
        self.cd = doc_cai_dat()
        self.hang_doi = queue.Queue()
        self.viec = []  # [{url, ten, nen_tang, noi_dung, trang_thai, thu_muc}]
        self.dang_chay = False
        self.lenh_dung = threading.Event()

        so = ttk.Notebook(self)
        so.pack(fill="both", expand=True, padx=8, pady=8)
        self.tab_chinh = ttk.Frame(so, padding=8)
        self.tab_cd = ttk.Frame(so, padding=12)
        so.add(self.tab_chinh, text="  🎬 Làm video  ")
        so.add(self.tab_cd, text="  ⚙️ Cài đặt  ")
        self._tab_chinh()
        self._tab_cai_dat()
        self.after(150, self._doc_hang_doi)
        if not self.cd["gemini"]:
            so.select(self.tab_cd)

    # ------------------------------------------------------------ tab chính
    def _tab_chinh(self):
        f = self.tab_chinh
        o = ttk.LabelFrame(f, text="1. Thêm video (dán link, mỗi dòng 1 link — Douyin, TikTok, YouTube, Bilibili…)", padding=6)
        o.pack(fill="x")
        self.o_link = tk.Text(o, height=3, wrap="none")
        self.o_link.pack(fill="x")
        hang = ttk.Frame(o)
        hang.pack(fill="x", pady=(6, 0))
        ttk.Button(hang, text="➕ Thêm link", command=self.them_link).pack(side="left")
        ttk.Button(hang, text="📂 Chọn video trên máy", command=self.them_file).pack(side="left", padx=6)
        ttk.Label(hang, text="  hoặc Google Sheet:").pack(side="left")
        self.o_sheet = ttk.Entry(hang)
        self.o_sheet.insert(0, self.cd.get("sheet_link", ""))
        self.o_sheet.pack(side="left", fill="x", expand=True, padx=4)
        ttk.Button(hang, text="📥 Lấy dòng NEW", command=self.lay_sheet).pack(side="left")

        g = ttk.LabelFrame(f, text="2. Danh sách (bấm đúp 1 dòng để mở thư mục kết quả)", padding=6)
        g.pack(fill="both", expand=True, pady=6)
        cot = ("ten", "url", "tt")
        self.bang = ttk.Treeview(g, columns=cot, show="headings", height=6)
        for c, chu, rong in (("ten", "Tên bài", 180), ("url", "Link / file", 480), ("tt", "Trạng thái", 160)):
            self.bang.heading(c, text=chu)
            self.bang.column(c, width=rong, anchor="w")
        self.bang.pack(fill="both", expand=True)
        self.bang.bind("<Double-1>", self.mo_ket_qua)
        hang = ttk.Frame(g)
        hang.pack(fill="x", pady=(6, 0))
        ttk.Button(hang, text="🗑 Xoá dòng chọn", command=self.xoa_dong).pack(side="left")
        ttk.Button(hang, text="🧹 Xoá hết", command=self.xoa_het).pack(side="left", padx=6)
        ttk.Button(hang, text="📁 Mở thư mục lưu", command=lambda: self._mo_thu_muc_luu()).pack(side="right")

        t = ttk.LabelFrame(f, text="3. Làm gì", padding=6)
        t.pack(fill="x")
        self.v_phu_de = tk.BooleanVar(value=self.cd["phu_de"])
        self.v_chen = tk.BooleanVar(value=self.cd["chen_phu_de"])
        self.v_long = tk.BooleanVar(value=self.cd["long_tieng"])
        self.v_content = tk.BooleanVar(value=self.cd["viet_content"])
        for chu, v in (("Phụ đề tiếng Việt", self.v_phu_de), ("Chèn chữ vào hình", self.v_chen),
                       ("Lồng tiếng Việt", self.v_long), ("Viết 3 bản content", self.v_content)):
            ttk.Checkbutton(t, text=chu, variable=v).pack(side="left", padx=(0, 14))
        self.nut_dung = ttk.Button(t, text="⏹ Dừng", command=self.dung, state="disabled")
        self.nut_dung.pack(side="right")
        self.nut_chay = ttk.Button(t, text="▶ Bắt đầu", command=self.bat_dau)
        self.nut_chay.pack(side="right", padx=6)

        n = ttk.LabelFrame(f, text="Tiến trình", padding=4)
        n.pack(fill="both", expand=True, pady=(6, 0))
        self.nhat_ky = ScrolledText(n, height=9, state="disabled", font=("Consolas", 9))
        self.nhat_ky.pack(fill="both", expand=True)

    # ------------------------------------------------------------ tab cài đặt
    def _tab_cai_dat(self):
        f = self.tab_cd
        self.o = {}
        f.columnconfigure(1, weight=1)
        hang = [0]

        def dong(nhan, khoa, goi_y="", an=False, nut=None):
            r = hang[0]
            ttk.Label(f, text=nhan).grid(row=r, column=0, sticky="w", pady=3, padx=(0, 8))
            e = ttk.Entry(f, show="•" if an else "")
            e.insert(0, str(self.cd.get(khoa, "")))
            e.grid(row=r, column=1, sticky="ew", pady=3)
            self.o[khoa] = e
            if nut:
                ttk.Button(f, text=nut[0], command=nut[1]).grid(row=r, column=2, padx=4)
            if goi_y:
                ttk.Label(f, text=goi_y, foreground="#777").grid(row=r + 1, column=1, sticky="w")
                hang[0] += 1
            hang[0] += 1

        dong("Mã Gemini (bắt buộc)", "gemini", "Lấy miễn phí: aistudio.google.com/apikey → Create API key → dán vào đây",
             an=True, nut=("Kiểm tra", self.kiem_tra_ma))
        ttk.Label(f, text="Giọng đọc").grid(row=hang[0], column=0, sticky="w", pady=3)
        self.o_giong = ttk.Combobox(f, values=list(xu_ly.GIONG_DOC), state="readonly")
        ten = [k for k, v in xu_ly.GIONG_DOC.items() if v == self.cd["giong"]]
        self.o_giong.set(ten[0] if ten else list(xu_ly.GIONG_DOC)[0])
        self.o_giong.grid(row=hang[0], column=1, sticky="w")
        ttk.Button(f, text="🔊 Nghe thử", command=self.nghe_thu).grid(row=hang[0], column=2, padx=4)
        hang[0] += 1
        dong("Tốc độ đọc", "toc_do", "Ví dụ +10% (nhanh hơn), -10% (chậm hơn), +0% (bình thường)")
        dong("Âm lượng tiếng gốc", "am_luong_goc", "0 = tắt hẳn tiếng Trung, 0.15 = giữ nhạc nền nhỏ, 1 = giữ nguyên")
        dong("Cỡ chữ phụ đề", "co_chu", "Mặc định 14")
        dong("Ngành / chủ đề", "linh_vuc", "Ví dụ: mỹ phẩm, đồ gia dụng, nấu ăn… để dịch đúng thuật ngữ")
        dong("Thư mục lưu kết quả", "thu_muc_luu",
             "Mẹo: chọn thư mục Google Drive trên máy → file tự đưa lên Drive", nut=("Chọn…", self.chon_thu_muc))
        dong("Lấy cookie từ trình duyệt", "cookie_trinh_duyet",
             "Khi tải Douyin bị chặn: gõ chrome / edge / firefox (trình duyệt đã mở trang đó), hoặc để trống")
        dong("Hoặc file cookies.txt", "cookie_file", "", nut=("Chọn…", self.chon_cookie))
        dong("Link Google Sheet", "sheet_link", "Sheet có cột URL, Tên, Trạng thái, Nội dung. Chia sẻ: ai có link đều xem được")
        dong("Link cập nhật Sheet (tuỳ chọn)", "sheet_webhook", "Để ghi DONE/ERROR ngược vào Sheet — xem HUONG-DAN.md")
        dong("Telegram bot token (tuỳ chọn)", "tg_token", "Báo tin khi xong/lỗi — xem HUONG-DAN.md", an=True)
        dong("Telegram chat ID", "tg_chat")
        ttk.Button(f, text="💾 Lưu cài đặt", command=self.luu_cai_dat).grid(row=hang[0], column=1, sticky="w", pady=12)

    def _lay_cai_dat_tu_o(self):
        for k, e in self.o.items():
            self.cd[k] = e.get().strip()
        for k, kieu in (("am_luong_goc", float), ("co_chu", int)):
            try:
                self.cd[k] = kieu(self.cd[k])
            except ValueError:
                self.cd[k] = MAC_DINH[k]
        self.cd["giong"] = xu_ly.GIONG_DOC.get(self.o_giong.get(), MAC_DINH["giong"])
        self.cd["phu_de"] = self.v_phu_de.get()
        self.cd["chen_phu_de"] = self.v_chen.get()
        self.cd["long_tieng"] = self.v_long.get()
        self.cd["viet_content"] = self.v_content.get()
        self.cd["sheet_link"] = self.o_sheet.get().strip() or self.cd.get("sheet_link", "")

    def luu_cai_dat(self, im_lang=False):
        self._lay_cai_dat_tu_o()
        with open(FILE_CAI_DAT, "w", encoding="utf-8") as f:
            json.dump(self.cd, f, ensure_ascii=False, indent=2)
        if self.o_sheet.get().strip() != self.cd["sheet_link"]:
            self.o_sheet.delete(0, "end")
            self.o_sheet.insert(0, self.cd["sheet_link"])
        if not im_lang:
            messagebox.showinfo("Đã lưu", "Đã lưu cài đặt.")

    def chon_thu_muc(self):
        p = filedialog.askdirectory()
        if p:
            self.o["thu_muc_luu"].delete(0, "end")
            self.o["thu_muc_luu"].insert(0, p)

    def chon_cookie(self):
        p = filedialog.askopenfilename(filetypes=[("cookies", "*.txt"), ("Tất cả", "*.*")])
        if p:
            self.o["cookie_file"].delete(0, "end")
            self.o["cookie_file"].insert(0, p)

    def kiem_tra_ma(self):
        self._lay_cai_dat_tu_o()

        def chay():
            try:
                xu_ly.goi_gemini(self.cd["gemini"], [{"text": 'Trả về JSON {"ok": true}'}])
                self.hang_doi.put(("hop", "✅ Mã Gemini dùng được."))
            except Exception as e:
                self.hang_doi.put(("hop", f"❌ {e}"))
        threading.Thread(target=chay, daemon=True).start()

    def nghe_thu(self):
        self._lay_cai_dat_tu_o()

        def chay():
            p = os.path.join(THU_MUC_APP, "nghe-thu.mp3")
            try:
                xu_ly.doc_giong("Xin chào, đây là giọng đọc thử của PhaHa Tool.", self.cd["giong"], self.cd["toc_do"], p)
                mo_file(p)
            except Exception as e:
                self.hang_doi.put(("hop", f"❌ {e}"))
        threading.Thread(target=chay, daemon=True).start()

    # ------------------------------------------------------------ danh sách
    def _them(self, url, ten="", nen_tang="", noi_dung=""):
        v = {"url": url, "ten": ten, "nen_tang": nen_tang, "noi_dung": noi_dung, "trang_thai": "NEW", "thu_muc": ""}
        v["id"] = self.bang.insert("", "end", values=(ten, url, "NEW"))
        self.viec.append(v)

    def them_link(self):
        for d in self.o_link.get("1.0", "end").splitlines():
            d = d.strip()
            if d:
                self._them(d)
        self.o_link.delete("1.0", "end")

    def them_file(self):
        for p in filedialog.askopenfilenames(filetypes=[("Video", "*.mp4 *.mov *.mkv *.webm *.avi"), ("Tất cả", "*.*")]):
            self._them(p, os.path.basename(p))

    def lay_sheet(self):
        link = self.o_sheet.get().strip()
        if not link:
            messagebox.showwarning("Thiếu link", "Dán link Google Sheet vào ô bên cạnh.")
            return

        def chay():
            try:
                ds = xu_ly.tai_google_sheet(link)
                self.hang_doi.put(("sheet", ds))
            except Exception as e:
                self.hang_doi.put(("hop", f"❌ {e}"))
        threading.Thread(target=chay, daemon=True).start()

    def xoa_dong(self):
        if self.dang_chay:
            return
        chon = set(self.bang.selection())
        self.viec = [v for v in self.viec if v["id"] not in chon]
        for i in chon:
            self.bang.delete(i)

    def xoa_het(self):
        if self.dang_chay:
            return
        self.viec.clear()
        self.bang.delete(*self.bang.get_children())

    def mo_ket_qua(self, _):
        for v in self.viec:
            if v["id"] in self.bang.selection() and v["thu_muc"]:
                mo_file(v["thu_muc"])

    def _mo_thu_muc_luu(self):
        p = self.cd.get("thu_muc_luu") or MAC_DINH["thu_muc_luu"]
        os.makedirs(p, exist_ok=True)
        mo_file(p)

    # ------------------------------------------------------------ chạy
    def bat_dau(self):
        self.luu_cai_dat(im_lang=True)
        cho = [v for v in self.viec if v["trang_thai"] in ("NEW", "ERROR", "ĐÃ DỪNG")]
        if not cho:
            messagebox.showinfo("Chưa có video", "Thêm link hoặc chọn video trước đã.")
            return
        if not self.cd["gemini"]:
            messagebox.showwarning("Thiếu mã", "Vào tab ⚙️ Cài đặt dán mã Gemini trước.")
            return
        self.dang_chay = True
        self.lenh_dung.clear()
        self.nut_chay.config(state="disabled")
        self.nut_dung.config(state="normal")
        cd = dict(self.cd)
        threading.Thread(target=self._chay_nen, args=(cho, cd), daemon=True).start()

    def dung(self):
        self.lenh_dung.set()
        self.log("⏹ Đang dừng sau bước hiện tại …")

    def _chay_nen(self, cho, cd):
        log = lambda m: self.hang_doi.put(("log", m))
        for i, v in enumerate(cho, 1):
            if self.lenh_dung.is_set():
                break
            log(f"\n===== [{i}/{len(cho)}] {v['ten'] or v['url']} =====")
            self.hang_doi.put(("tt", v, "ĐANG LÀM…"))
            try:
                v["thu_muc"] = xu_ly.xu_ly_mot(v, cd, log, self.lenh_dung.is_set)
                self.hang_doi.put(("tt", v, "DONE ✅"))
            except xu_ly.DaDung:
                self.hang_doi.put(("tt", v, "ĐÃ DỪNG"))
                break
            except Exception as e:
                log(f"❌ Lỗi: {e}")
                self.hang_doi.put(("tt", v, "ERROR"))
        self.hang_doi.put(("xong", None))

    def log(self, m):
        self.nhat_ky.config(state="normal")
        self.nhat_ky.insert("end", m + "\n")
        self.nhat_ky.see("end")
        self.nhat_ky.config(state="disabled")
        try:
            with open(FILE_NHAT_KY, "a", encoding="utf-8") as f:
                f.write(m + "\n")
        except OSError:
            pass

    def _doc_hang_doi(self):
        try:
            while True:
                loai, *du_lieu = self.hang_doi.get_nowait()
                if loai == "log":
                    self.log(du_lieu[0])
                elif loai == "tt":
                    v, tt = du_lieu
                    v["trang_thai"] = tt.split()[0]
                    self.bang.set(v["id"], "tt", tt)
                elif loai == "hop":
                    messagebox.showinfo("PhaHa Tool", du_lieu[0])
                elif loai == "sheet":
                    for d in du_lieu[0]:
                        self._them(d["url"], d["ten"], d["nen_tang"], d["noi_dung"])
                    messagebox.showinfo("Google Sheet", f"Đã lấy {len(du_lieu[0])} dòng trạng thái NEW.")
                elif loai == "xong":
                    self.dang_chay = False
                    self.nut_chay.config(state="normal")
                    self.nut_dung.config(state="disabled")
                    self.log("— Hết danh sách —")
        except queue.Empty:
            pass
        self.after(150, self._doc_hang_doi)


if __name__ == "__main__":
    App().mainloop()
