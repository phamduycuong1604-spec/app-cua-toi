// Gemini quota, recovery and per-request key tracking shared by the modular app.
import {API_GEMINI,caiDat,nhat,cho,docLuu,ghiLuu,demDung,daDung,ngayMy,vanTayMa,assertRunning,runSignal} from './nen.js';
import {createTtsScheduler,TTS_MODELS} from './gemini-tts.js';
let moHinhDocCoDinh=null;
export const moHinhDocDaChot=()=>moHinhDocCoDinh;
export const chotMoHinhDoc=mh=>{moHinhDocCoDinh=mh;tts.prefer(mh);};
export function batDauLanMoiGemini(){daBaoNghi=new Set();moHinhDocCoDinh=null;tts.reset();napMoHinhNghi();}
export function quenGhiNhoGemini(caHanMuc=false){
 moHinhNghi.clear();lyDoNghiGemini.clear();localStorage.removeItem('phaha-dv-gemini-nghi');localStorage.removeItem('phaha-dv-gemini-nghi-loai');
 if(caHanMuc){const d=docLuu('phaha-dv-dung');for(const k of Object.keys(d))if(/^(max|het):gm:/.test(k))delete d[k];ghiLuu('phaha-dv-dung',d);}
}
const MO_HINH = {
  nghe: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  doc: ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"],
};
const moHinhDung = {}; // mô hình đã chạy được
const moHinhNghi = new Set(); // mô hình đang quá tải hoặc hết lượt hôm nay → bỏ qua
const lyDoNghiGemini = new Map();
// Lưu trên máy: mô hình nào hết lượt tới lúc nào / đã ngừng → lần sau khỏi thử lại
function napMoHinhNghi() {
  moHinhNghi.clear();lyDoNghiGemini.clear();
  // Bản trước gộp cả lỗi 503/429 tạm thời vào "hết ngày". Chỉ xoá ghi nhớ lỗi cũ một lần;
  // giữ nguyên mã API, cài đặt, số lượt đã dùng và các câu đã đọc.
  try{if(!localStorage.getItem('phaha-gemini-r2')){
    localStorage.removeItem('phaha-dv-gemini-nghi');localStorage.removeItem('phaha-dv-gemini-nghi-loai');
    const used=docLuu('phaha-dv-dung');for(const k of Object.keys(used))if(k.startsWith('het:gm:'))delete used[k];
    localStorage.setItem('phaha-dv-dung',JSON.stringify(used));localStorage.setItem('phaha-gemini-r2','1');
    nhat('GEMINI-R2 · xoá ghi nhớ lỗi cũ có thể nhầm hạn mức; giữ nguyên mã và cài đặt');
  }}catch{}
  // Bản cũ ghi nhầm lỗi "Google chặn theo vị trí mạng" thành "mô hình đã ngừng" (bỏ qua 30 ngày) → xoá 1 lần các ghi nhớ dài hạn
  try {
    if (!localStorage.getItem("phaha-sua-gemini-vi-tri")) {
      const cu = docLuu("phaha-dv-gemini-nghi");
      for (const k of Object.keys(cu)) if (cu[k] > Date.now() + 2 * 86400000) delete cu[k];
      localStorage.setItem("phaha-dv-gemini-nghi", JSON.stringify(cu));
      localStorage.setItem("phaha-sua-gemini-vi-tri", "1");
    }
  } catch {}
  const d = docLuu("phaha-dv-gemini-nghi"),reasons=docLuu('phaha-dv-gemini-nghi-loai');
  for (const [m, han] of Object.entries(d)) if (han > Date.now()) {moHinhNghi.add(m);lyDoNghiGemini.set(m,{until:han,reason:reasons[m]||'legacy'});}
}
function luuMoHinhNghi(m, giay, reason='legacy') {
  const d = docLuu("phaha-dv-gemini-nghi");
  const reasons=docLuu('phaha-dv-gemini-nghi-loai');
  for (const k of Object.keys(d)) if (d[k] < Date.now()) {delete d[k];delete reasons[k];}
  d[m] = Date.now() + giay * 1000;
  reasons[m]=reason;moHinhNghi.add(m);lyDoNghiGemini.set(m,{until:d[m],reason});
  try { localStorage.setItem("phaha-dv-gemini-nghi", JSON.stringify(d));localStorage.setItem('phaha-dv-gemini-nghi-loai',JSON.stringify(reasons)); } catch {}
}
function nghiGemini(id){
  if(!moHinhNghi.has(id))return null;
  const detail=lyDoNghiGemini.get(id);
  if(detail&&detail.until<=Date.now()){moHinhNghi.delete(id);lyDoNghiGemini.delete(id);return null;}
  return detail||{reason:'legacy',until:0};
}
const tenLoiGemini=reason=>({'quota-day':'hết hạn mức ngày','quota-minute':'giới hạn mỗi phút','quota-other':'giới hạn tạm thời','key-rejected':'mã sai, hết hiệu lực hoặc thiếu quyền','not-found':'mô hình không có/quyền truy cập chưa cho phép','empty-audio':'chưa trả âm thanh','overload':'dịch vụ quá tải',legacy:'ghi nhớ lỗi trước đó'}[reason]||'lỗi tạm thời');

// Mã Gemini dùng cho từng việc: đọc giọng có thể dùng mã riêng (dự án khác → lượt miễn phí riêng)
// Ô "Gemini riêng cho giọng đọc" nhận tối đa 10 mã (cách nhau bằng dấu phẩy, khoảng trắng hoặc xuống dòng):
// mã đang dùng hết lượt hôm nay thì tự chuyển sang mã kế tiếp
const TOI_DA_MA_DOC = 10;
const dsKhoaDoc = () => [...new Set(String(caiDat.khoaDoc || "").split(/[\s,;]+/).filter(Boolean))].slice(0, TOI_DA_MA_DOC);
let soMaDoc = 0; // vị trí mã đọc đang dùng trong danh sách
const khoaGemini = (loai) => (loai === "doc" && dsKhoaDoc()[soMaDoc]) || (loai === "doc" && dsKhoaDoc()[0]) || caiDat.khoa;
// Ghi nhớ "hết lượt" theo TỪNG MÃ (dấu vân tay ngắn của mã, không lưu mã): đổi mã là có sổ ghi nhớ mới

const tenNghi = (m, loai, key=khoaGemini(loai)) => vanTayMa(key || "") + ":" + m;
let daBaoNghi = new Set(); // đã ghi nhật ký "bỏ qua vì ghi nhớ" (mỗi lần chạy 1 lần)

async function goiGemini(loai, noiDung) {
  if(loai==='doc'){
    const result=await tts.request(noiDung);moHinhDocCoDinh=result.moHinh;return result;
  }
  return goiGeminiMotMa(loai,noiDung,{khoa:khoaGemini(loai),maDoc:0});
}

async function goiGeminiMotMa(loai, noiDung, tuyChon = {}) {
  const key=tuyChon.khoa??khoaGemini(loai),options={...tuyChon,khoa:key};
  const tuChon = loai === "nghe" ? caiDat.mhNghe : caiDat.mhDoc;
  const fixed=loai==="doc"?moHinhDocCoDinh:null;
  let ds = fixed?[fixed]:[...new Set([tuChon, moHinhDung[loai], ...MO_HINH[loai]].filter(Boolean))];
  let daHoi = false, loiCuoi = null, hetNgay = null,temporary=false,quotaWaited=false;
  if(!ds.length)throw Error("Chưa bật giọng đọc nào dùng được. Mở Cài đặt để bật và chọn giọng.");
  for (let i = 0; ; i++) {
    assertRunning();
    if(i===ds.length){if(daHoi)break;daHoi=true;ds=ds.concat((await timMoHinh(loai,key)).filter(m=>!ds.includes(m)));if(i===ds.length)break;}
    const id=tenNghi(ds[i],loai,key);let cooldown=nghiGemini(id);
    if(loai==='doc'&&cooldown&&['quota-minute','quota-other'].includes(cooldown.reason)&&cooldown.until>Date.now()&&cooldown.until-Date.now()<=180000){
      const state=nhipMoHinh(ds[i]);state.until=Math.max(state.until,cooldown.until+1000);
      nhat('GEMINI-R3 · '+ds[i]+' · chờ hạn mức phút đã ghi nhớ rồi thử tiếp cùng mã');
      moHinhNghi.delete(id);lyDoNghiGemini.delete(id);cooldown=null;
    }
    if (cooldown) {
      if(cooldown.reason==='quota-day')hetNgay=Object.assign(Error('HET_NGAY'),{status:429,reason:'quota-day',doiMoHinh:true});
      else if(cooldown.reason!=='not-found')temporary=true;
      if (!daBaoNghi.has(id)) {
        daBaoNghi.add(id);
        nhat(`GEMINI-R2 · bỏ qua ${ds[i]} · mã ${options.maDoc||'chính'} · ${tenLoiGemini(cooldown.reason)}${cooldown.until?' · thử lại sau '+Math.max(1,Math.ceil((cooldown.until-Date.now())/1000))+'s':''}`);
      }
      continue;
    }
    try {
      let kq,payload=noiDung;
      for(let empty=0;empty<2;empty++){
        kq=await goiMoHinh(ds[i],payload,loai,options);
        if(loai!=='doc'||kq?.candidates?.some(c=>c.content?.parts?.some(p=>p.inlineData?.data)))break;
        nhat('GEMINI-R2 · '+ds[i]+' chưa trả âm thanh · '+(kq?.candidates?.[0]?.finishReason||kq?.promptFeedback?.blockReason||'không có nội dung')+' · lần '+(empty+1));
        if(empty)throw Object.assign(Error('Gemini không trả âm thanh.'),{status:502,doiMoHinh:true,reason:'empty-audio',choGiay:60});
        payload={...noiDung,contents:noiDung.contents?.map(c=>({...c,parts:c.parts?.map(p=>p.text?{...p,text:p.text.replace(/^Đọc bằng tiếng Việt, giọng tự nhiên, tốc độ hơi nhanh: /,'')}:p)}))};
      }
      if(loai==='doc'){
        if(moHinhDocCoDinh&&moHinhDocCoDinh!==ds[i])return goiGeminiMotMa(loai,noiDung,options);
        moHinhDocCoDinh=ds[i];Object.defineProperty(kq,'moHinh',{value:ds[i]});
      }
      moHinhDung[loai] = ds[i];
      return kq;
    } catch (loi) {
      if (loi.status !== 404 && !loi.doiMoHinh) throw loi;
      loiCuoi = loi;
      quotaWaited ||= !!loi.quotaWaited;
      if (loi.status === 404) luuMoHinhNghi(id,30*86400,'not-found');
      if (loi.goiY && !ds.includes(loi.goiY)&&(loai!=='doc'||/tts/.test(loi.goiY))) {
        ds.splice(i + 1, 0, loi.goiY);
        nhat(`↪️ ${ds[i]} đã ngừng, Google gợi ý dùng ${loi.goiY} → thử ngay`);
      }
      if (loi.message === "HET_NGAY") hetNgay = loi;
      if (loi.doiMoHinh) {
        const reason=loi.reason||(loi.message==='HET_NGAY'?'quota-day':'overload');
        if(reason!=='quota-day')temporary=true;
        luuMoHinhNghi(id,Math.max(1,Math.min(loi.choGiay||60,86400)),reason);
        if (moHinhDung[loai] === ds[i]) delete moHinhDung[loai];
        nhat(`GEMINI-R2 · ${ds[i]} · mã ${options.maDoc||'chính'} · ${tenLoiGemini(reason)} → thử mô hình khác`);
      }
    }
  }
  // Có loại Gemini báo hết lượt hôm nay (các loại khác ngừng/không có) → coi là mã này hết lượt, để xoay sang mã kế tiếp.
  // Trước đây chỉ xét lỗi CUỐI: loại cuối báo "không tìm thấy" là app tưởng không có mô hình, không đổi mã.
  if (hetNgay&&!temporary) { ghiHetGemini(loai,key); throw hetNgay; }
  if(temporary)throw Object.assign(Error('Gemini tạm chưa tạo được giọng (giới hạn, quá tải hoặc chưa trả âm thanh). Xem các dòng GEMINI-R2/GEMINI-R3 để biết mô hình và mã gặp lỗi.'),{status:loiCuoi?.status||503,reason:loiCuoi?.reason||'overload',doiMa:!quotaWaited,quotaWaited});
  throw Object.assign(new Error("Không tìm thấy mô hình Gemini phù hợp. Vào Cài đặt → Nâng cao để nhập tên mô hình."),{status:404,reason:'not-found',doiMa:true});
}

// Hết lượt cả ngày: ghi lại số lượt đã dùng được hôm nay = hạn mức thật của mã này
function ghiHetGemini(loai,key=khoaGemini(loai)) {
  const vt = vanTayMa(key), ngay = ngayMy();
  const d = docLuu("phaha-dv-dung"), da = daDung(`gm:${vt}:${loai}`, ngay);
  if (da > 0) d[`max:gm:${vt}:${loai}`] = { n: da };
  d[`het:gm:${vt}:${loai}`] = { ngay };
  try { localStorage.setItem("phaha-dv-dung", JSON.stringify(d)); } catch {}
}

async function timMoHinh(loai,key=khoaGemini(loai)) {
  try {
    const r = await fetch(`${API_GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name.replace("models/", ""))
      .filter((t) => (loai === "doc" ? /tts/.test(t) : /flash/.test(t) && !/tts|image|live|audio|lite/.test(t)))
      .sort((a, b) => /flash/.test(b) - /flash/.test(a));
  } catch {
    return [];
  }
}

// các mô hình không nhận tuỳ chọn tắt "suy nghĩ" (lưu trên máy để lần sau khỏi thử)
const khongTatSuyNghi = new Set(Array.isArray(docLuu("phaha-dv-khong-tat-suy-nghi")) ? docLuu("phaha-dv-khong-tat-suy-nghi") : []);
// Quota thường dùng chung theo dự án, không theo từng mã API. Sau một lỗi phút,
// mọi luồng/mã của cùng mô hình dùng chung thời điểm chờ và nhịp Google công bố.
const nhipGemini=new Map();
function giayGemini(value){
  let total=0;for(const m of String(value||'').matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi))total+=Number(m[1])*(/^h/i.test(m[2])?3600:/^m/i.test(m[2])?60:1);
  return total;
}
function geminiRetrySeconds(error,response){
  const details=Array.isArray(error?.error?.details)?error.error.details:[],delay=details.find(d=>d.retryDelay)?.retryDelay;
  if(giayGemini(delay)>0)return giayGemini(delay);
  const header=response?.headers?.get('retry-after');
  if(header){const seconds=Number(header);if(Number.isFinite(seconds))return Math.max(0,seconds);const until=Date.parse(header);if(Number.isFinite(until))return Math.max(0,(until-Date.now())/1000);}
  const match=/(?:retry|try again)\s+(?:in|after)\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+)/i.exec(error?.error?.message||'');
  return giayGemini(match?.[1]);
}
function nhipMoHinh(model){let state=nhipGemini.get(model);if(!state){state={until:0,next:0,interval:0,logged:0};nhipGemini.set(model,state)}return state;}
function choHanMucGemini(model,seconds,error){
  const state=nhipMoHinh(model),text=error?.error?.message||'',details=Array.isArray(error?.error?.details)?error.error.details:[];
  const reported=Number(/limit:\s*(\d+)\s*requests?\s*per\s*minute/i.exec(text)?.[1])||Number(details.flatMap(d=>d.violations||[]).find(v=>/perminute/i.test(v.quotaId||''))?.quotaValue);
  if(reported>0)state.interval=Math.max(state.interval,Math.ceil(60000/reported)+1000);
  state.until=Math.max(state.until,Date.now()+(seconds+1)*1000);
  nhat('GEMINI-R3 · '+model+' · Google yêu cầu chờ '+Math.ceil(seconds)+'s'+(reported?' · '+reported+' lượt/phút':'')+' · các luồng dùng chung lịch chờ');
}
async function doiLuotGemini(model){
  const state=nhipMoHinh(model);
  for(;;){
    assertRunning();const now=Date.now(),due=Math.max(state.until,state.next);
    if(due<=now){state.next=now+state.interval;return;}
    const seconds=Math.max(1,Math.ceil((due-now)/1000));
    if(state.logged!==due){state.logged=due;nhat('GEMINI-R3 · '+model+' · chờ '+seconds+'s rồi đọc tiếp, giữ các đoạn đã đọc');}
    await cho(seconds,'long');
  }
}
async function goiMoHinh(moHinh, noiDung, loai, tuyChon = {}) {
  const key=tuyChon.khoa??khoaGemini(loai);
  let quaLau = 0,quotaRetries=0,quotaWait=0;
  for (let lan = 0; ; lan++) {
    assertRunning();
    if(loai==='doc'){await doiLuotGemini(moHinh);assertRunning();}
    // Nghe & dịch: tắt chế độ "suy nghĩ" của Gemini để trả lời nhanh hơn nhiều
    const guiDi = loai === "nghe" && !khongTatSuyNghi.has(moHinh)
      ? { ...noiDung, generationConfig: { ...noiDung.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
      : noiDung;
    // Chờ quá lâu thì huỷ, gửi lại (tránh treo mãi khi mạng chập chờn)
    const huy = new AbortController();
    const hen = setTimeout(() => huy.abort(), (loai === "nghe" ? 180 : 60) * 1000);
    let r;
    const bd = Date.now();
    const thoiGian = () => ((Date.now() - bd) / 1000).toFixed(1) + " giây";
    nhat('GEMINI-R2 · gửi '+(loai==='doc'?'tạo giọng':'nghe/dịch')+' · '+moHinh+' · mã '+(tuyChon.maDoc||'chính')+' · lần '+(lan+1));
    try {
      const interaction=loai==='doc'&&moHinh.startsWith('gemini-3.8-');
      const text=(noiDung.contents?.[0]?.parts?.[0]?.text||'').replace(/^Đọc bằng tiếng Việt, giọng tự nhiên, tốc độ hơi nhanh: /,'');
      const payload=interaction?{model:moHinh,input:[{type:'user_input',content:[{type:'text',text,annotations:[{type:'speech_metadata',style:'Natural, clear Vietnamese narration'}]}]}],response_format:{type:'audio'},generation_config:{speech_config:[{voice:caiDat.giong||'Kore'}]},store:false}:guiDi;
      r = await fetch(interaction?`${API_GEMINI}/interactions`:`${API_GEMINI}/models/${moHinh}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
        signal: huy.signal,
      });
      if (r.ok) {
        const j = await r.json();
        demDung(`gm:${vanTayMa(key)}:${loai}`, 1, ngayMy());
        if (loai === "nghe" || Date.now() - bd > 8000) {
          const u = j?.usageMetadata;
          nhat(`Gemini ${moHinh} (${loai === "nghe" ? "nghe & dịch" : "đọc"}): xong sau ${thoiGian()}${u ? ` · ${u.promptTokenCount || 0}→${u.candidatesTokenCount || 0} token${u.thoughtsTokenCount ? `, suy nghĩ ${u.thoughtsTokenCount}` : ""}` : ""}`);
        }
        if(interaction){const a=(Array.isArray(j?.steps)?j.steps:[]).flatMap(s=>s.type==='model_output'?s.content||[]:[]).filter(p=>p.type==='audio').at(-1);return {candidates:[{content:{parts:a?[{inlineData:{data:a.data,mimeType:a.mime_type||a.mimeType||'audio/wav'}}]:[]}}]};}
        return j;
      }
    } catch (loiMang) {
      assertRunning();
      clearTimeout(hen);
      if(loiMang.name==='SyntaxError')throw Object.assign(Error('Gemini trả nội dung không đọc được.'),{status:502,doiMoHinh:true,reason:'empty-audio'});
      if (huy.signal.aborted) {
        nhat(`⏱️ Gemini ${moHinh} quá lâu (${thoiGian()}), huỷ và gửi lại (lần ${quaLau + 1})`);
        if (++quaLau <= 2) continue;
        throw new Error("Gemini trả lời quá lâu. Kiểm tra mạng rồi bấm Bắt đầu để thử lại.");
      }
      nhat(`⚠️ Gemini ${moHinh}: lỗi mạng sau ${thoiGian()} (${loiMang?.message || loiMang})`);
      if (lan < 3) { await cho(3); continue; }
      throw new Error("Mất kết nối mạng khi gọi Gemini.");
    } finally {
      clearTimeout(hen);
    }
    const rawError = await r.json().catch(() => ({}));
    const j=Array.isArray(rawError)?rawError[0]||{}:rawError;
    const thongBao = j.error?.message || r.statusText || 'Google trả HTTP '+r.status;
    nhat(`⚠️ Gemini ${moHinh}: mã ${r.status} sau ${thoiGian()} · ${String(thongBao).slice(0, 150)}`);
    if (r.status === 400 && guiDi !== noiDung && /thinking|invalid argument/i.test(thongBao)) {
      khongTatSuyNghi.add(moHinh);
      try { localStorage.setItem("phaha-dv-khong-tat-suy-nghi", JSON.stringify([...khongTatSuyNghi])); } catch {}
      nhat(`${moHinh} không nhận tuỳ chọn tắt suy nghĩ → gửi lại không kèm`);
      continue;
    }
    if (r.status === 429) {
      const chiTiet = JSON.stringify(j.error?.details || "");
      const giay=geminiRetrySeconds(j,r);
      const quota = /quotaId\":\"([^\"]+)/.exec(chiTiet)?.[1];
      if (quota) nhat(`Giới hạn bị chạm: ${quota}${giay ? `, Google bảo chờ ${giay} giây` : ""}`);
      // Chỉ kết luận hết ngày khi Google ghi rõ quota ngày; chờ >60s không có nghĩa là hết ngày.
      if (/per[ _-]?day|daily/i.test(thongBao + chiTiet)) {
        throw Object.assign(new Error("HET_NGAY"), {status:429,reason:'quota-day',chiTiet:thongBao,doiMoHinh:true,choGiay:giay||3600});
      }
      const reason=/per[ _-]?minute/i.test(thongBao+chiTiet)?'quota-minute':'quota-other';
      if(loai==='doc'){
        const seconds=giay||60;choHanMucGemini(moHinh,seconds,j);
        // Chờ quota phút trên cùng mô hình/mã trước; đổi mã không khắc phục quota chung dự án.
        if(quotaRetries>=3||quotaWait+seconds>180)throw Object.assign(new Error('Gemini vẫn bị giới hạn sau khi đã chờ Google.'),{status:429,reason,doiMoHinh:true,choGiay:seconds,quotaWaited:true});
        quotaRetries++;quotaWait+=seconds;continue;
      }
      if (tuyChon.doiMaKhiCho) throw Object.assign(new Error('Gemini bị giới hạn tạm thời.'), {status:429,reason,doiMa:true,choGiay:giay||60});
      if(!giay||giay>60||lan>=3)throw Object.assign(new Error('Gemini bị giới hạn tạm thời.'),{status:429,reason,doiMoHinh:true,choGiay:giay||60});
      await cho(giay + 1, loai === "nghe" ? "dich" : "long");
      continue;
    }
    // Quá tải (503): thử lại 1 lần, vẫn quá tải thì đổi loại Gemini khác
    if (r.status === 503) {
      if (lan < 1) { await cho(3); continue; }
      throw Object.assign(new Error("Gemini đang quá tải"), { status: 503, doiMoHinh: true,reason:'overload',choGiay:60 });
    }
    if (r.status >= 500 && lan < 3) { await cho(5); continue; }
    if(r.status>=500)throw Object.assign(Error('Gemini đang lỗi dịch vụ (HTTP '+r.status+').'),{status:r.status,doiMoHinh:true,reason:'overload',choGiay:60});
    // Google chặn theo vị trí mạng (VPN, mạng nước ngoài…) – không phải lỗi mô hình hay mã → dừng luôn, không ghi nhớ
    if (/location is not supported/i.test(thongBao))
      throw Object.assign(new Error("Google đang chặn Gemini theo vị trí mạng của bạn (thường do VPN/proxy hoặc mạng nước ngoài). Tắt VPN hoặc đổi mạng (wifi ↔ 4G) rồi thử lại. Mã Gemini vẫn đúng."), { status: 400, viTri: true });
    if([401,403].includes(r.status)||r.status===400&&/API_KEY_INVALID|API_KEY_EXPIRED|API key (?:not valid|expired|is not valid)/i.test(thongBao+JSON.stringify(j.error?.details||'')))
      throw Object.assign(Error('Google từ chối mã Gemini: mã sai, hết hiệu lực hoặc thiếu quyền (HTTP '+r.status+').'),{status:r.status,reason:'key-rejected',doiMa:true});
    const e = new Error(thongBao);
    e.status = r.status === 400 && /model.*(?:not found|not supported|is not)|(?:not found|not supported).*model/i.test(thongBao) ? 404 : r.status;
    // Google gợi ý mô hình thay thế, vd "use models/gemini-3.8-flash"
    e.goiY = /use models\/([\w.\-]+)/i.exec(thongBao)?.[1];
    throw e;
  }
}

export function layChu(tl) {
  const ung = tl.candidates?.[0];
  if (!ung?.content?.parts) {
    if (ung?.finishReason === "SAFETY" || tl.promptFeedback?.blockReason) throw new Error("Gemini từ chối nội dung video này.");
    throw new Error("Gemini không trả lời. Bấm Bắt đầu để thử lại.");
  }
  return ung.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
}


const GM_UOC={nghe:250,doc:10};
// Mã Gemini đọc còn bao nhiêu lượt hôm nay (cộng mọi mã đọc). null = chưa biết (mã chưa từng hết lượt, có thể trả phí)
export function conLuotGeminiDoc() {
  return tts.remaining();
}
// Giờ (giờ Việt Nam) lúc Gemini làm mới lượt: 0 giờ ở Mỹ
export function gioLamMoiGemini() {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return new Date(Date.now() + (1440 - h * 60 - m) * 60000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
export function hanMuc(da, toiDa, donVi, uocTinh, lamMoi) {
  const con = Math.max(0, Math.round(100 * (1 - da / toiDa)));
  return `đã dùng ${da.toLocaleString("vi-VN")}/${toiDa.toLocaleString("vi-VN")} ${donVi}${uocTinh ? " (ước tính)" : ""} → còn ${con}%${lamMoi ? `, làm mới lúc ${lamMoi}` : ""}`;
}
export function hanMucGemini(khoa, loai) {
  if(loai==='doc')return 'đọc: '+ttsModels().map(model=>{const p=tts.snapshot(khoa,model);return model+': '+(p.exhausted?'hết lượt ngày':`còn khoảng ${p.remaining}/${p.limit} lượt/ngày (ước tính)`);}).join(' · ')+'; các mã cùng project có thể dùng chung quota';
  const vt = vanTayMa(khoa), d = docLuu("phaha-dv-dung");
  const da = daDung(`gm:${vt}:${loai}`, ngayMy());
  const hoc = d[`max:gm:${vt}:${loai}`];
  const toiDa = hoc?.n || GM_UOC[loai];
  const ten = loai === "nghe" ? "nghe & dịch" : "đọc";
  if (d[`het:gm:${vt}:${loai}`]?.ngay === ngayMy()) return `${ten}: đã hết lượt hôm nay → còn 0%, làm mới lúc ${gioLamMoiGemini()}`;
  return `${ten}: ${hanMuc(da, Math.max(toiDa, da), "lượt", !hoc, gioLamMoiGemini())}`;
}

const ttsModels=()=>[...new Set([caiDat.mhDoc,...TTS_MODELS].filter(Boolean))];
const tts=createTtsScheduler({
  keys:()=>dsKhoaDoc().length?dsKhoaDoc():[caiDat.khoa].filter(Boolean),models:ttsModels,
  fetch:(...args)=>fetch(...args),read:()=>docLuu('phaha-tts-quota-v1'),write:data=>ghiLuu('phaha-tts-quota-v1',data),
  day:ngayMy,fingerprint:vanTayMa,wait:seconds=>cho(seconds,'long'),signal:runSignal,log:nhat,api:API_GEMINI,
  usage:key=>demDung(`gm:${vanTayMa(key)}:doc`,1,ngayMy()),
});
export {goiGemini,dsKhoaDoc};
