// =====================================================
// PHÁT GIỌNG NGHE THỬ
// iPhone chỉ cho phát tiếng NGAY lúc bấm. Giọng đọc phải chờ mạng vài giây nên có thể bị chặn:
// khi đó nút đổi thành ▶️, bấm lần nữa là phát ngay (đã đọc sẵn, không phải chờ).
// Phát bằng thẻ audio (như xem video) nên vẫn kêu khi iPhone để chế độ im lặng.
// Mỗi nút có 1 thanh phát (▶ có sẵn của iPhone) hiện ngay bên dưới sau khi đọc xong:
// tự phát được thì tốt, iPhone chặn thì bấm ▶ trên thanh đó (luôn được phép).
// =====================================================
import { nhat, TAN_SO_DOC } from "./nen.js";
import { taoWav } from "./am-thanh.js";
import { loiDeHieu } from "./loi.js";

let diaChiIm = null;
const choPhat = new WeakMap(); // nút → giọng đã đọc xong, chờ bấm để phát

function loaCua(nut) {
  if (!nut._loa) {
    const a = document.createElement("audio");
    a.controls = true;
    a.playsInline = true;
    a.preload = "auto";
    a.className = "loa-nghe an";
    (nut.closest(".hang-nut-giong, .cau-tren") || nut).after(a);
    nut._loa = a;
  }
  return nut._loa;
}

// Phát 0,2 giây im lặng ngay lúc bấm để iPhone "mở khoá" cái loa này
function moKhoaLoa(loa) {
  diaChiIm ||= URL.createObjectURL(new Blob([taoWav(new Float32Array(TAN_SO_DOC / 5), TAN_SO_DOC)], { type: "audio/wav" }));
  try { loa.src = diaChiIm; loa.play().catch(() => {}); } catch {}
}

function phat(mau, loa) {
  if (loa._diaChi) URL.revokeObjectURL(loa._diaChi);
  loa._diaChi = URL.createObjectURL(new Blob([taoWav(mau, TAN_SO_DOC)], { type: "audio/wav" }));
  loa.src = loa._diaChi;
  loa.classList.remove("an");
  return loa.play();
}

// layMau: hàm đọc giọng (trả về âm thanh); tienTo: tên dịch vụ để ghi nhật ký; chuCho/chuBam: chữ trên nút
export async function bamNghe(nut, layMau, tienTo, chuCho, chuBam) {
  nut.dataset.goc ||= nut.textContent;
  const loa = loaCua(nut);
  const san = choPhat.get(nut);
  if (san) {
    // bấm lần 2: phát ngay trong lúc bấm → iPhone cho phép
    choPhat.delete(nut);
    nut.textContent = nut.dataset.goc;
    phat(san, loa).catch((loi) => nhat(`🔊 Nghe thử ${tienTo}bấm lại vẫn bị chặn (${loi?.name || loi}) → bấm ▶ trên thanh phát`));
    return;
  }
  if (nut.disabled) return;
  moKhoaLoa(loa);
  nut.disabled = true;
  nut.textContent = chuCho;
  const bd = Date.now();
  let mau;
  try {
    mau = await layMau();
  } catch (loi) {
    nut.disabled = false;
    nut.textContent = nut.dataset.goc;
    nhat(`🔊 Nghe thử ${tienTo}lỗi khi đọc: ${loi?.message || loi}`);
    alert(tienTo + loiDeHieu(loi));
    return;
  }
  nut.disabled = false;
  const doDai = `đọc xong ${((Date.now() - bd) / 1000).toFixed(1)} giây, tiếng dài ${(mau.length / TAN_SO_DOC).toFixed(1)} giây`;
  try {
    await phat(mau, loa);
    nut.textContent = nut.dataset.goc;
    nhat(`🔊 Nghe thử ${tienTo}${doDai}, đang phát`);
  } catch (loi) {
    choPhat.set(nut, mau);
    nut.textContent = chuBam;
    nhat(`🔊 Nghe thử ${tienTo}${doDai}, iPhone chặn tự phát (${loi?.name || loi}) → chờ bấm ▶`);
  }
}
