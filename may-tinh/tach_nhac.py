"""Tách nhạc nền khỏi giọng người (AI MDX-Net của Ultimate Vocal Remover, giấy phép MIT).

Cùng mô hình và cách tính với dich-video/tach-nhac.js (app trên điện thoại), viết lại cho máy tính.
Nhận: âm thanh 2 kênh 44.100 mẫu/giây → Trả: (nhạc nền, giọng người).
"""
import os

import requests

TAN_SO = 44100
HOP, DIM_T = 1024, 256
CHUNK = HOP * (DIM_T - 1)

MO_HINH = {
    "tep": "UVR-MDX-NET-Inst_HQ_4.onnx", "co": 59074342, "nfft": 5120, "dim_f": 2560, "bu": 1.019,
    "nguon": [
        "https://phamduycuong1604-spec.github.io/app-cua-toi/dich-video/mo-hinh/UVR-MDX-NET-Inst_HQ_4.onnx",
        "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_4.onnx",
    ],
}


def co_the_dung():
    try:
        import numpy  # noqa: F401
        import onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


def tai_mo_hinh(thu_muc, log):
    """Tải mô hình 1 lần (~56MB), cất cạnh app cho lần sau."""
    os.makedirs(thu_muc, exist_ok=True)
    p = os.path.join(thu_muc, MO_HINH["tep"])
    if os.path.isfile(p) and os.path.getsize(p) == MO_HINH["co"]:
        return p
    loi = ""
    for url in MO_HINH["nguon"]:
        try:
            log("   Tải AI tách giọng (chỉ lần đầu, ~56MB) …")
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(p + ".tai", "wb") as f:
                    for manh in r.iter_content(1 << 20):
                        f.write(manh)
            if os.path.getsize(p + ".tai") == MO_HINH["co"]:
                os.replace(p + ".tai", p)
                return p
            loi = "tải không đủ dung lượng"
        except Exception as e:
            loi = str(e)[:150]
    raise RuntimeError("Không tải được AI tách giọng: " + loi)


def tach(am_thanh, duong_dan_mo_hinh, log=print, dung=lambda: False):
    """am_thanh: mảng numpy float32 dạng (2, N). Trả về (nhạc nền, giọng) cùng dạng."""
    import numpy as np
    import onnxruntime as ort

    nfft, dim_f, bu = MO_HINH["nfft"], MO_HINH["dim_f"], MO_HINH["bu"]
    tc = ort.SessionOptions()
    tc.intra_op_num_threads = max(1, min(8, (os.cpu_count() or 2)))
    phien = ort.InferenceSession(duong_dan_mo_hinh, tc, providers=["CPUExecutionProvider"])
    ten_vao, ten_ra = phien.get_inputs()[0].name, phien.get_outputs()[0].name

    nua = nfft // 2
    cua_so = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(nfft) / nfft)).astype(np.float64)
    vi_tri = np.arange(DIM_T)[:, None] * HOP + np.arange(nfft)[None, :]
    tong_w = np.zeros(CHUNK + nfft)
    np.add.at(tong_w, vi_tri.ravel(), np.tile(cua_so ** 2, DIM_T))
    tong_w = tong_w[nua:nua + CHUNK]
    tong_w[tong_w < 1e-11] = np.inf

    def stft(x):
        dem = np.pad(x, (nua, nua), mode="reflect")
        pho = np.fft.rfft(dem[vi_tri] * cua_so, axis=1)[:, :dim_f]  # (DIM_T, dim_f)
        return pho.T  # (dim_f, DIM_T)

    def istft(re, im):
        pho = np.zeros((DIM_T, nfft // 2 + 1), dtype=np.complex128)
        pho[:, :dim_f] = (re + 1j * im).T
        khung = np.fft.irfft(pho, n=nfft, axis=1) * cua_so
        tong = np.zeros(CHUNK + nfft)
        for t in range(DIM_T):  # cộng chồng các khung (nhanh hơn np.add.at nhiều)
            tong[t * HOP:t * HOP + nfft] += khung[t]
        return tong[nua:nua + CHUNK] / tong_w

    n = am_thanh.shape[1]
    trim = nfft // 2
    gen = CHUNK - 2 * trim
    pad = gen - (n % gen)
    vao = np.zeros((2, trim + n + pad + trim), dtype=np.float32)
    vao[:, trim:trim + n] = am_thanh
    nen = np.zeros((2, n + pad), dtype=np.float32)
    so_khuc = (n + pad) // gen
    dau_vao = np.zeros((1, 4, dim_f, DIM_T), dtype=np.float32)
    for k in range(so_khuc):
        if dung():
            raise InterruptedError()
        o = k * gen
        for c in range(2):
            p = stft(vao[c, o:o + CHUNK])
            dau_vao[0, 2 * c], dau_vao[0, 2 * c + 1] = p.real, p.imag
        ra = phien.run([ten_ra], {ten_vao: dau_vao})[0][0]
        for c in range(2):
            nen[c, o:o + gen] = istft(ra[2 * c], ra[2 * c + 1])[trim:trim + gen] * bu
        if k % 10 == 0 or k == so_khuc - 1:
            log(f"   Tách giọng: {round((k + 1) / so_khuc * 100)}%")
    nen = nen[:, :n]
    return nen, (am_thanh - nen).astype(np.float32)
