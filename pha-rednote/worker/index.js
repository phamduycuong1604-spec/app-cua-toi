import dubAssets from './assets.generated.js';
import {handleSource} from './source.js';
import {APP_RELEASE,APP_RELEASES} from '../web/release-info.js';
import {handleDub} from './dub.js';
import {handleVideoSource} from './video-server.js';
const PAGE_HOSTS = ['xiaohongshu.com','xhslink.com','rednote.com'];
const MEDIA_HOSTS = ['xhscdn.com','xhsimg.com','xiaohongshu.com'];
const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const MAX_FILE_BYTES=256*1024*1024;
const ORIGINAL_LIGHT_BYTES=700*1024*1024;// (không còn dùng: nay luôn ưu tiên bản 1080p khi nhẹ hơn bản gốc)// Bản gốc nhẹ hơn mức này thì lấy bản gốc; nặng hơn thì lấy bản 1080p Rednote có sẵn, để video 1–15 phút đều vào app được.
const SOURCE_BUDGET_MS=60000;// Đọc bài Rednote tối đa 60 giây: app chỉ chờ 90 giây, chừa thời gian cho bước kiểm tra video.
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
class AppError extends Error {constructor(message,status=422){super(message);this.status=status}}
export function validUrl(value,hosts=PAGE_HOSTS){
 let u;try{u=new URL(value)}catch{throw new AppError('Link không hợp lệ. Hãy dán link chia sẻ Rednote.',400)}
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new AppError('Chỉ hỗ trợ link HTTPS từ Rednote / Xiaohongshu / xhslink.',400);
 return u;
}
export function shareUrl(text){const link=String(text).match(/https?:\/\/[^\s<>"\u3000]+/i)?.[0]?.replace(/[，。！!）)]+$/,'');if(!link)throw new AppError('Chưa tìm thấy link. Có thể dán cả đoạn chia sẻ từ Rednote.',400);return validUrl(link.replace(/^http:/i,'https:')).href}
async function fetchAllowed(value,hosts,init={},timeoutMs=20000,deadline=Infinity){
 let url=validUrl(value,hosts).href,publicNoteUrl=null;
 for(let i=0;i<6;i++){
  if(/\/(?:explore|item)\/[a-f0-9]{24}/i.test(new URL(url).pathname))publicNoteUrl=url;
  const wait=Math.min(timeoutMs,deadline-Date.now());if(wait<=0)throw new AppError('Rednote phản hồi quá chậm. Hãy thử lại sau ít phút.',504);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),wait);
  let response;try{response=await fetch(url,{...init,redirect:'manual',signal:controller.signal})}finally{clearTimeout(timeout)}
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw new AppError('Nguồn trả về chuyển hướng không hợp lệ.');url=validUrl(new URL(location,url).href,hosts).href;await response.body?.cancel();continue}
  return {response,url,publicNoteUrl};
 }
 throw new AppError('Link chuyển hướng quá nhiều lần.');
}
async function limitedText(response,max=4_000_000){
 if(Number(response.headers.get('content-length'))>max)throw new AppError('Nội dung nguồn quá lớn.');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new AppError('Nội dung nguồn quá lớn.')}chunks.push(value)}}finally{reader.releaseLock()}
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}return new TextDecoder().decode(all);
}
// Rednote embeds JSON with bare undefined; replace only outside quoted strings.
export function parseState(source){
 const start=source.indexOf('window.__INITIAL_STATE__');if(start<0)return null;
 const equal=source.indexOf('=',start);let pos=equal+1;while(/\s/.test(source[pos]||''))pos++;
 if(source[pos]!=='{')return null;
 let depth=0,quoted=false,escape=false,end=pos;
 for(;end<source.length;end++){const c=source[end];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end++;break}}
 const raw=source.slice(pos,end);let clean='';quoted=false;escape=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue}if(c==='"'){quoted=true;clean+=c}else if(raw.slice(i,i+9)==='undefined'){clean+='null';i+=8}else clean+=c}
 try{return JSON.parse(clean)}catch{return null}
}
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
function meta(html,name){const tags=html.match(/<meta\s[^>]*>/gi)||[];for(const tag of tags){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))attrs[m[1].toLowerCase()]=decode(m[3]);if(attrs.property===name||attrs.name===name)return attrs.content||''}return ''}
export function extractNote(html,url){
 const state=parseState(html);const map=state?.note?.noteDetailMap||{};
 const id=new URL(url).pathname.match(/(?:explore|item)\/([a-f0-9]{24})/i)?.[1];
 const entry=map[id]||Object.values(map).find(x=>x?.note);const note=entry?.note||state?.noteData?.data?.noteData;
 const title=note?.title||meta(html,'og:title');const caption=note?.desc||meta(html,'description')||meta(html,'og:description');
 const streams=note?.video?.media?.stream||{};const videos=[];
 for(const type of ['h264','h265','av1'])for(const stream of streams[type]||[]){const src=stream.masterUrl||stream.master_url||stream.backupUrls?.[0];if(src)videos.push({url:src,backups:stream.backupUrls||stream.backup_urls||[],width:stream.width||0,height:stream.height||0,bitrate:stream.avgBitrate||0,size:stream.size||null,codec:type})}
 videos.sort((a,b)=>((b.codec==='h264')-(a.codec==='h264'))||b.width*b.height-a.width*a.height||b.bitrate-a.bitrate);
 let video=videos[0]?.url||note?.video?.url||meta(html,'og:video')||meta(html,'og:video:url');
 if(video?.startsWith('//'))video='https:'+video;
 if(video?.startsWith('http:'))video=video.replace(/^http:/,'https:');
 if(video){try{video=validUrl(video,MEDIA_HOSTS).href}catch{video=null}}
 if(!note&&!caption&&!video)throw new AppError('Rednote chưa cho đọc bài này. Hãy mở bài trong Rednote, chọn Chia sẻ → Sao chép liên kết rồi thử lại. Bạn cũng có thể nhập caption gốc để giữ lại.');
 if(!note&&!video&&/登录|验证|访问|安全|小红书.*生活指南/.test(title+' '+caption))throw new AppError('Rednote đang yêu cầu đăng nhập hoặc xác minh. Hãy thử link chia sẻ đầy đủ; caption đã nhập vẫn được giữ nguyên.');
 const originKey=note?.video?.consumer?.originVideoKey;
 const originalVideoUrl=originKey&&/^[a-zA-Z0-9/_-]+$/.test(originKey)?'https://sns-video-bd.xhscdn.com/'+originKey:null;
 const variants=videos.map(v=>({codec:v.codec,width:v.width,height:v.height,bitrate:v.bitrate,urls:[v.url,...v.backups].map(u=>{try{return validUrl(String(u).replace(/^\/\//,'https://').replace(/^http:/,'https:'),MEDIA_HOSTS).href}catch{return null}}).filter((u,i,a)=>u&&a.indexOf(u)===i)})).filter(s=>s.urls.length);
 return {originalVideoUrl,variants,streamSize:videos[0]?.size||null,id:note?.noteId||id||'rednote',title:title||'Video Rednote',caption:caption||'',author:note?.user?.nickname||note?.user?.nickName||'',cover:note?.imageList?.[0]?.urlDefault||meta(html,'og:image'),videoUrl:video||null,sourceUrl:url,width:videos[0]?.width||null,height:videos[0]?.height||null};
}
const GLOSSARY={
 general:{'感光度':'độ nhạy sáng ISO','光圈':'khẩu độ','快门速度':'tốc độ màn trập','焦距':'tiêu cự'},
 lighting:{'主光':'đèn chính (key light)','辅光':'đèn bù (fill light)','补光':'bù sáng','轮廓光':'đèn viền (rim light)','背景光':'đèn nền','柔光箱':'softbox','柔光':'ánh sáng mềm','硬光':'ánh sáng cứng','色温':'nhiệt độ màu','白平衡':'cân bằng trắng','逆光':'ngược sáng','布光':'bố trí ánh sáng','反光板':'tấm hắt sáng','光比':'tỉ lệ ánh sáng','蜂巢':'lưới tổ ong'},
 retouch:{'磨皮':'làm mịn da','双曲线':'dodge & burn bằng hai đường cong','中性灰':'dodge & burn trên lớp xám trung tính','频率分离':'tách tần số','液化':'Liquify','调色':'chỉnh màu','肤色':'màu da','色调':'tông màu','色相':'sắc độ (hue)','饱和度':'độ bão hòa','明度':'độ sáng','高光':'vùng sáng (highlights)','阴影':'vùng tối (shadows)','曲线':'đường cong (Curves)','蒙版':'mặt nạ (mask)','锐化':'tăng độ sắc nét','纹理':'kết cấu'},
 film:{'运镜':'chuyển động máy quay','分镜':'phân cảnh','调色':'chỉnh màu','帧率':'tốc độ khung hình','快门速度':'tốc độ màn trập','景深':'độ sâu trường ảnh','转场':'chuyển cảnh','剪辑':'dựng phim','慢动作':'chuyển động chậm','焦距':'tiêu cự'},
 makeup:{'底妆':'lớp nền trang điểm','修容':'tạo khối','腮红':'má hồng','眼影':'phấn mắt','遮瑕':'che khuyết điểm','定妆':'cố định lớp trang điểm'},
 diy:{'花泥':'xốp cắm hoa','花艺':'nghệ thuật cắm hoa','热熔胶':'keo nến','铁丝':'dây kẽm','布景':'dựng bối cảnh','道具':'đạo cụ','手工':'thủ công','插花':'cắm hoa','花束':'bó hoa','丝带':'ruy băng'},
 photography:{'人像摄影':'nhiếp ảnh chân dung','人像':'chân dung','构图':'bố cục','景深':'độ sâu trường ảnh','对焦':'lấy nét','曝光':'phơi sáng','直出':'ảnh xuất trực tiếp từ máy','机位':'vị trí máy','等效焦距':'tiêu cự tương đương','测光':'đo sáng','逆光':'ngược sáng','虚化':'làm mờ hậu cảnh','原片':'ảnh gốc','连拍':'chụp liên tiếp'},
 lab:{'预设':'preset','查找表':'bảng tra màu (LUT)','配置文件':'profile màu','色彩空间':'không gian màu','色彩分级':'color grading','色彩校准':'hiệu chuẩn màu','降噪':'khử nhiễu','动态范围':'dải tương phản động','高光恢复':'khôi phục vùng sáng','阴影恢复':'khôi phục vùng tối','白平衡':'cân bằng trắng'},
 parenting:{'育儿':'nuôi dạy con','亲子':'cha mẹ và con','孕期':'thai kỳ','孕妇':'mẹ bầu','新生儿':'trẻ sơ sinh','宝宝':'bé','母乳':'sữa mẹ','辅食':'ăn dặm','家庭':'gia đình','陪伴':'đồng hành'},
 edit:{'关键帧':'keyframe (khung hình chính)','时间线':'timeline (dòng thời gian)','画中画':'hình trong hình (PiP)','遮罩':'mask (mặt nạ)','调色':'chỉnh màu','蒙版':'mask (mặt nạ)','速度曲线':'đường cong tốc độ','补帧':'nội suy khung hình','镜面滑行':'hiệu ứng trượt gương','素材':'tư liệu dựng','配音':'lồng tiếng','字幕':'phụ đề','镜头':'cảnh quay'}
};
export const CHANNEL_PROFILES={
 pha_story:{label:'Pha Chuyện Ảnh',description:'Kiến thức nhiếp ảnh và hậu kỳ; ngắn gọn, dễ hiểu, đủ ý.',glossaries:['general','photography','lighting','retouch'],rules:'Dùng thuật ngữ nhiếp ảnh và hậu kỳ nhất quán. Diễn đạt ngắn gọn, dễ hiểu nhưng giữ đủ ý nguồn. Hashtag đúng ngách. Khi biên tập thành bài đăng, các nền tảng mặc định là TikTok, Instagram và Threads; bản dịch trong app giữ một nội dung để copy.',footer:'ĐÂY LÀ VIDEO REUP ĐƯỢC WS BỞI PHA'},
 pha_color:{label:'Pha Color Grading',description:'Chỉnh màu và retouch ảnh; Photoshop, ACR, Lightroom, Capture One.',glossaries:['general','photography','retouch','lab'],rules:'Giữ chính xác workflow, chất liệu da, sắc da, vùng sáng và vùng tối. Phân biệt màu ảnh, độ bão hòa, hue và luminance. Không bịa thông số hoặc biến suy đoán thành thao tác của tác giả.'},
 pha_lab:{label:'Pha Lab',description:'Preset, ACR, Capture One, LUT và tài nguyên nhiếp ảnh.',glossaries:['general','photography','retouch','lab'],rules:'Dịch sát nguồn. Không thêm công thức, thông số, kiến thức, claims, lời hứa hoặc diễn giải ngoài nguồn. Giữ đúng tên phần mềm, tên công cụ, định dạng XMP/DNG/CUBE và từng bước workflow. Không khẳng định tương thích phần mềm khi nguồn chưa nói.',footer:'Mình cũng đang tự học, gặp workflow nào hay từ các “pháp sư” Trung Quốc thì Việt hóa và chia sẻ lại để anh em cùng nghiên cứu. 📸\n\n— Pha Lab'},
 pha_edit:{label:'Pha Edit',description:'Quay dựng, hậu kỳ và chỉnh màu video.',glossaries:['general','film','edit'],rules:'Dịch đúng ngữ cảnh quay dựng: cảnh quay, chuyển động máy, keyframe, timeline, mask, phụ đề và color grading video. Giữ thứ tự thao tác, tên phần mềm, thông số và thời lượng. Không tự thêm cảnh, lời thoại hoặc thông số xuất.'},
 phaha_oi:{label:'PhaHa Ơi',description:'DIY, handmade, decor, hoa và đạo cụ concept.',glossaries:['general','diy'],rules:'Dịch sát các bước thủ công, vật liệu, hoa, trang trí và đạo cụ. Giọng gần gũi, rõ ràng. Không tự thêm vật liệu, kích thước, định lượng hoặc bước thiếu trong nguồn. Giữ lời kêu gọi có trong nguồn; hashtag đúng chủ đề.'},
 nha_phaha:{label:'Nhà PhaHa',description:'Nuôi dạy con, mẹ bầu và gia đình.',glossaries:['general','parenting'],rules:'Giọng ấm áp, dễ hiểu, đúng ngữ cảnh cha mẹ, trẻ nhỏ, mẹ bầu và gia đình. Không biến chia sẻ cá nhân thành lời khuyên y tế đã xác minh; không tự thêm khuyến cáo, liều lượng hay khẳng định sức khỏe. Ghi chú điểm cần xác minh ngoài bản dịch.'},
 phaha:{label:'Phaha',description:'Kênh tổng hợp của hệ sinh thái PhaHa.',glossaries:['general','photography','lighting','retouch','lab','film','edit','makeup','diy','parenting'],rules:'Đây là kênh tổng hợp, không mặc định là studio. Chọn ngữ cảnh và thuật ngữ phù hợp nội dung nguồn trong hệ sinh thái PhaHa; giọng rõ, gần gũi. Không tự gán bài cho một thương hiệu, thêm dịch vụ, giá hoặc cam kết ngoài nguồn.'},
 pha_light:{label:'Pha Light',description:'Lighting nhiếp ảnh; key, fill, rim, màu da và cảm xúc.',glossaries:['general','photography','lighting'],rules:'Dịch đúng hướng sáng, độ mềm, đèn chính, đèn bù, đèn viền, nhiệt độ màu và cân bằng trắng. Giữ phần suy đoán là suy đoán. Không tự suy ra công suất, khoảng cách đèn, tiêu cự hoặc tỉ lệ ánh sáng. Không nhận tác phẩm nguồn là do PHA tự sản xuất.'},
 general:{label:'Nội dung thông thường',description:'Dịch sát nghĩa nội dung thông thường.',glossaries:['general'],rules:''},
 lighting:{label:'Lighting / Ánh sáng',description:'Ánh sáng nhiếp ảnh.',glossaries:['general','lighting'],rules:''},
 retouch:{label:'Retouch / Chỉnh màu',description:'Retouch chân dung và chỉnh màu ảnh.',glossaries:['general','retouch'],rules:''},
 film:{label:'Quay & dựng phim',description:'Quay phim, dựng phim và color grading.',glossaries:['general','film','edit'],rules:''},
 makeup:{label:'Makeup / Trang điểm',description:'Trang điểm chụp ảnh.',glossaries:['general','makeup'],rules:''},
 diy:{label:'DIY / Đạo cụ & decor',description:'Thủ công, đạo cụ và trang trí.',glossaries:['general','diy'],rules:''}
};
export function translationProfile(domain){
 const id=Object.hasOwn(CHANNEL_PROFILES,domain)?domain:'general';const profile=CHANNEL_PROFILES[id];
 return {...profile,id,glossary:Object.assign({},...profile.glossaries.map(name=>GLOSSARY[name]))};
}
async function readSourceNote(source,{requireVideo=true}={}){
 const shared=shareUrl(source),deadline=Date.now()+SOURCE_BUDGET_MS;let last,resolved;
 const attempts=[{url:shared,agent:UA},{url:shared,agent:DESKTOP_UA}];
 for(let index=0;index<attempts.length;index++){
  const attempt=attempts[index];
  if(index>0&&Date.now()>=deadline)break;// Hết giờ: báo lỗi của lần thử gần nhất thay vì để app tự hết giờ.
  try{
   const {response,url,publicNoteUrl}=await fetchAllowed(attempt.url,PAGE_HOSTS,{headers:{'user-agent':attempt.agent,'accept':'text/html','accept-language':'zh-CN,zh;q=0.9','referer':'https://www.xiaohongshu.com/'}},20000,deadline);
   resolved=publicNoteUrl||resolved||url;
   if(!response.ok){await response.body?.cancel();throw new AppError('Rednote chưa cho đọc bài ('+response.status+'). Hãy thử link chia sẻ mới.',502)}
   const html=await limitedText(response);let note;
   try{note=extractNote(html,url)}catch(error){
    error.sourceDetails={host:new URL(url).hostname,path:new URL(url).pathname,status:response.status,bytes:html.length,title:html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.slice(0,120)||'',stateKeys:Object.keys(parseState(html)||{}),hasState:html.includes('window.__INITIAL_STATE__')};
    if(/\/(?:login|website-login)(?:\/|$)/i.test(new URL(url).pathname)||error.sourceDetails.stateKeys.includes('login')){error.message='Rednote yêu cầu máy chủ app đăng nhập để đọc bài này. App chưa lấy được video gốc. Bạn có thể thử link chia sẻ mới hoặc chọn video từ máy.';error.code='REDNOTE_LOGIN_REQUIRED'}
    console.warn('rednote_source_unreadable',JSON.stringify(error.sourceDetails));
    throw error;
   }
   if(requireVideo&&!note.videoUrl&&!note.originalVideoUrl)throw new AppError('Bài này không có video công khai; có thể là bài ảnh hoặc đang bị khóa.',422);
   return note;
  }catch(e){last=e}
  if(index===1&&resolved){
   const full=new URL(resolved);const id=full.pathname.match(/(?:explore|item)\/([a-f0-9]{24})/i)?.[1];
   if(id){
    // Both official domains serve public note pages. Preserve signed access parameters;
    // remove app-specific presentation flags from canonical page requests.
    for(const host of ['www.rednote.com','www.xiaohongshu.com'])for(const path of ['/discovery/item/'+id,'/explore/'+id]){
     const alternate=new URL(full);alternate.hostname=host;alternate.pathname=path;
     for(const name of [...alternate.searchParams.keys()])if(!name.startsWith('xsec_'))alternate.searchParams.delete(name);
     for(const agent of [UA,DESKTOP_UA])if(!attempts.some(a=>a.url===alternate.href&&a.agent===agent))attempts.push({url:alternate.href,agent});
    }
   }
  }
 }
 throw last?.name==='AbortError'?new AppError('Rednote phản hồi quá chậm. Hãy thử lại sau ít phút.',504):last;
}
export function sniffVideo(bytes){
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp')return 'video/mp4';
 if(bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'video/webm';
 return null;
}
async function verifiedVideo(media,{probeOnly=false}={}){
 const {response}=await fetchAllowed(media,MEDIA_HOSTS,{headers:{'user-agent':UA,'referer':'https://www.xiaohongshu.com/','range':probeOnly?'bytes=0-65535':'bytes=0-'}},25000);
 if(!response.ok){await response.body?.cancel();throw new AppError('Nguồn không cho tải file video ('+response.status+').',502)}
 const range=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
 const size=Number(range?.[3])||Number(response.headers.get('content-length'))||0;
 if(size>MAX_FILE_BYTES&&!probeOnly){await response.body?.cancel();throw new AppError('File vượt 256 MB nên chưa thể nhận vào bộ nhớ app trên điện thoại. Hãy dùng bản MP4 nhỏ hơn.',413)}
 if(range&&!probeOnly&&(Number(range[1])!==0||Number(range[2])+1!==Number(range[3]))){await response.body?.cancel();throw new AppError('Nguồn trả về video chưa đầy đủ. Hãy thử lại.',502)}
 const reader=response.body.getReader();const beginning=[];let bytes=0;
 try{
  while(bytes<12){const part=await reader.read();if(part.done)break;beginning.push(part.value);bytes+=part.value.length}
  const first=new Uint8Array(Math.min(bytes,12));let offset=0;for(const part of beginning){const take=part.slice(0,12-offset);first.set(take,offset);offset+=take.length;if(offset>=12)break}
  const type=sniffVideo(first);if(!type){await reader.cancel();throw new AppError('Nguồn trả về trang web hoặc file khác, không phải MP4 / WebM.',502)}
  let sent=bytes;
  const stream=new ReadableStream({start(controller){for(const part of beginning)controller.enqueue(part)},async pull(controller){try{const part=await reader.read();if(part.done){controller.close();return}sent+=part.value.length;if(sent>MAX_FILE_BYTES&&!probeOnly){await reader.cancel();controller.error(new Error('Video quá lớn'));return}controller.enqueue(part.value)}catch(error){controller.error(error)}},cancel(reason){return reader.cancel(reason)}});
  return {stream,size,type};
 }catch(error){try{await reader.cancel()}catch{}throw error}
}
// Bản nhẹ cho video nặng: bản Rednote ≤1080p phát trên web (không phải bản "lưu video" có logo); cho lệch tới 1088 (vd. 1428×1088).
// H.264 trước (iPhone đọc tốt nhất), rồi H.265. Trả kèm ghi chú từng bản để nhật ký cho biết vì sao không dùng được.
async function pick1080(note){
 const rank={h264:0,h265:1},sized=s=>s.width>0&&s.height>0,fits=s=>sized(s)&&Math.min(s.width,s.height)<=1088;
 const name=s=>s.codec+' '+(sized(s)?s.width+'×'+s.height:'chưa rõ cỡ');
 const notes=[],all=note.variants||[];
 for(const s of all)if(!Object.hasOwn(rank,s.codec))notes.push(name(s)+': iPhone khó đọc');else if(!fits(s))notes.push(name(s)+(sized(s)?': lớn hơn 1080p':''));
 const list=all.filter(s=>Object.hasOwn(rank,s.codec)&&fits(s)).sort((a,b)=>rank[a.codec]-rank[b.codec]||b.width*b.height-a.width*a.height||b.bitrate-a.bitrate);
 let tries=0;
 for(const s of list)for(const url of s.urls){
  if(++tries>4){notes.push('đã thử 4 link, dừng');return {notes}}
  try{const probe=await verifiedVideo(url,{probeOnly:true});await probe.stream.cancel();if(probe.size>0)return {url,size:probe.size,width:s.width,height:s.height,codec:s.codec,notes};notes.push(name(s)+': không đọc được dung lượng')}
  catch(error){notes.push(name(s)+': '+String(error?.message||error).replace(/\.$/,''))}
 }
 if(!all.length)notes.push('Rednote không gửi kèm bản phát trên web');
 return {notes};
}
function videoAttachment(note,media,size,mode,extra={}){
 const downloadUrl='/api/download?url='+encodeURIComponent(media)+'&id='+encodeURIComponent(note.id)+'&kind='+mode+'&source='+encodeURIComponent(note.sourceUrl);
 return json({delivery:'attachment',title:note.title,caption:[note.title,note.caption].filter(Boolean).join('\n\n'),author:note.author,sourceUrl:note.sourceUrl,size,downloadUrl,previewUrl:downloadUrl+'&inline=1',mode,...extra});
}
async function fetchVideoFile(body){
 const note=await readSourceNote(body.url||body.text);let file,mode;
 if(!note.originalVideoUrl)throw new AppError('Không tìm được bản gốc cho bài này. App không tự thay bằng bản chia sẻ có thể dính logo Rednote.',422);
 const probe=await verifiedVideo(note.originalVideoUrl,{probeOnly:true});await probe.stream.cancel();
 // Điện thoại báo ghi được xuống bộ nhớ app → mọi video (kể cả dưới 256 MB) đều tải từng phần xuống đó, không giữ trong RAM.
 let media=note.originalVideoUrl,size=probe.size,extra={};mode='original';
 // Luôn ưu tiên bản ≤1080p Rednote phát trên web (không phải bản "lưu video" có logo) khi nó nhẹ hơn bản gốc:
 // video vốn được xuất tối đa 1080p, nên điện thoại khỏi tải và thu nhỏ bản 2K/4K (nhanh hơn nhiều).
 const lite=await pick1080(note),MB=n=>Math.round(n/1e6),seen=lite.notes.length?' ('+lite.notes.join('; ')+')':'';
 if(lite.url&&(!(size>0)||lite.size<size)){extra={originalSize:size||null,width:lite.width,height:lite.height,codec:lite.codec,reason:size?'Bản gốc '+MB(size)+' MB, bản Rednote '+MB(lite.size)+' MB nhẹ hơn':'Không đọc được dung lượng bản gốc'};media=lite.url;size=lite.size;mode='p1080';}
 else if(lite.url)extra={reason:'Bản Rednote '+lite.codec+' '+lite.width+'×'+lite.height+' nặng '+MB(lite.size)+' MB, không nhẹ hơn bản gốc '+MB(size)+' MB, dùng bản gốc'};
 else extra={reason:'Không có bản 1080p của Rednote dùng được, dùng bản gốc'+seen};
 if(size>MAX_FILE_BYTES||body.delivery==='attachment'&&size>0)return videoAttachment(note,media,size,mode,extra);
 file=await verifiedVideo(media);
 const extension=file.type==='video/webm'?'webm':'mp4';
 const filename=(note.title||'PHA-Rednote').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,' ').trim().slice(0,100)+'.'+extension;
 const resultHeaders=new Headers({...headers,'content-type':file.type,'content-disposition':'attachment; filename="PHA-Rednote.'+extension+'"; filename*=UTF-8\'\''+encodeURIComponent(filename),'x-video-name':encodeURIComponent(filename),'x-video-mode':mode,'x-rednote-title':encodeURIComponent(note.title),'x-rednote-author':encodeURIComponent(note.author),'x-rednote-source':encodeURIComponent(note.sourceUrl)});
 const caption=[note.title,note.caption].filter(Boolean).join('\n\n');
 const encoded=encodeURIComponent(caption);
 if(encoded.length<=6500){resultHeaders.set('x-rednote-caption',encoded);resultHeaders.set('x-caption-complete','1')}else resultHeaders.set('x-caption-complete','0');
 if(file.size)resultHeaders.set('content-length',String(file.size));
 return new Response(file.stream,{status:200,headers:resultHeaders});
}
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function downloadError(request,error){
 const u=new URL(request.url);let direct='',source='';
 try{direct=validUrl(u.searchParams.get('url'),MEDIA_HOSTS).href}catch{}
 try{source=shareUrl(u.searchParams.get('source'))}catch{}
 const message=error instanceof AppError?error.message:'Nguồn video chưa phản hồi kịp. Hãy thử lại hoặc mở video trực tiếp để lưu.';
 const retry=new URL(u);retry.searchParams.set('retry',String(Date.now()));
 const page='<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PHA · Thử lại tải video</title><style>body{font:16px system-ui;background:#f9faf5;color:#193c34;margin:0;padding:36px 24px;line-height:1.7}main{max-width:480px;margin:auto}a{display:block;background:#193c34;color:white;text-decoration:none;border-radius:12px;padding:14px;margin:14px 0}a.alt{background:#e6f1e8;color:#193c34}p{color:#64766c}</style><main><h2>Video chưa tải được</h2><p>'+escapeHtml(message)+'</p><a href="'+escapeHtml(retry.href)+'">Thử tải lại</a>'+(direct?'<a class="alt" href="'+escapeHtml(direct)+'">Mở video trực tiếp để lưu</a>':'')+'<a class="alt" href="/">Quay về PHA Rednote</a><p>Trên iPhone: mở video, chọn Chia sẻ → Lưu vào Tệp. Nếu file gốc quá lớn, quay về app và chọn MP4 cho điện thoại.</p>'+(source?'<a class="alt" href="'+escapeHtml(source)+'">Mở bài Rednote gốc</a>':'')+'</main></html>';
 return new Response(page,{status:error.status||502,headers:{...headers,'content-type':'text/html; charset=utf-8'}});
}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}})}
export default {async fetch(request,env){
 try{
  const url=new URL(request.url);
  const sourceResponse=handleSource(request);if(sourceResponse)return sourceResponse;
  const videoResponse=await handleVideoSource(request,env);if(videoResponse)return videoResponse;
  if(url.pathname.startsWith('/dub/')&&request.method==='GET'){
   if(Object.hasOwn(dubAssets,url.pathname)){if(url.pathname.endsWith('.ttf'))return new Response(Uint8Array.from(atob(dubAssets[url.pathname]),c=>c.charCodeAt(0)),{headers:{'content-type':'font/ttf','cache-control':'private, max-age=31536000, immutable'}});const type=url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.html')?'text/html':'text/javascript';return new Response(dubAssets[url.pathname],{headers:{'content-type':type+'; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});}
   const remote={'/dub/remote/ffmpeg-core.js':'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js','/dub/remote/ffmpeg-core.wasm':'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm','/dub/remote/NotoSans.ttf':'https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans/NotoSans-Regular.ttf'}[url.pathname];
   if(remote){const response=await fetch(remote,{signal:AbortSignal.timeout(60000)});if(!response.ok)return json({error:'Chưa tải được bộ xử lý.'},502);return new Response(response.body,{headers:{'content-type':url.pathname.endsWith('.wasm')?'application/wasm':url.pathname.endsWith('.ttf')?'font/ttf':'text/javascript','cache-control':'private, max-age=31536000, immutable','x-content-type-options':'nosniff'}});}
  }
  const dubResponse=await handleDub(request,env,translationProfile);if(dubResponse)return dubResponse;
  if(request.method==='GET'&&url.pathname==='/')return new Response(HTML,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.xhscdn.com https://*.xhsimg.com; media-src 'self' blob:; connect-src 'self' blob: https://generativelanguage.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co; font-src 'self' blob: https://fonts.gstatic.com; base-uri 'self'; form-action 'self'"}});
  if(url.pathname==='/api/download'&&request.method==='GET'){
   let media=validUrl(url.searchParams.get('url'),MEDIA_HOSTS);const range=request.headers.get('range');
   let response,lastError;
   for(let attempt=0;attempt<2;attempt++){
    try{
     if(attempt&&url.searchParams.get('source')){
      const refreshed=await readSourceNote(url.searchParams.get('source'));
      const kind=url.searchParams.get('kind');
      const fresh=kind==='original'?refreshed.originalVideoUrl:kind==='p1080'?(await pick1080(refreshed)).url:refreshed.videoUrl;
      if(fresh)media=validUrl(fresh,MEDIA_HOSTS);
     }
     ({response}=await fetchAllowed(media.href,MEDIA_HOSTS,{headers:{'user-agent':UA,'referer':'https://www.xiaohongshu.com/','range':range||'bytes=0-'}},25000));
     if(response.ok)break;
     const code=response.status;await response.body?.cancel();response=null;
     lastError=new AppError('Nguồn từ chối tải video ('+code+'). Hãy thử lại hoặc mở video trực tiếp.',502);
    }catch(e){lastError=e;response=null}
   }
   if(!response)throw lastError||new AppError('Link video đã hết hạn. Hãy lấy lại link bài.',502);
   const type=response.headers.get('content-type')||'video/mp4';if(!/video|octet-stream/i.test(type))throw new AppError('Nguồn chưa trả về file video.',502);
   const resultHeaders=new Headers({...headers,'content-type':type,'content-disposition':(url.searchParams.get('inline')?'inline':'attachment')+'; filename="PHA-Rednote-'+(url.searchParams.get('id')||'video').replace(/[^a-z0-9-]/gi,'').slice(0,40)+'.mp4"'});
   for(const h of ['content-length','content-range','accept-ranges'])if(response.headers.has(h))resultHeaders.set(h,response.headers.get(h));
   return new Response(response.body,{status:response.status,headers:resultHeaders});
  }
  if(request.method==='POST'&&['/api/extract','/api/dub/fetch-video'].includes(url.pathname)){
   // Prevent cross-origin use of the private app's endpoints.
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw new AppError('Yêu cầu không hợp lệ.',403);
   if(Number(request.headers.get('content-length'))>100000)throw new AppError('Dữ liệu quá lớn.',413);
   const bodyText=await limitedText(request,100000);let body;try{body=JSON.parse(bodyText)}catch{throw new AppError('Dữ liệu không hợp lệ.',400)}
   if(url.pathname==='/api/dub/fetch-video')return await fetchVideoFile(body);
   const source=shareUrl(body.url);const note=await readSourceNote(source,{requireVideo:false});
   note.caption=[note.title,note.caption].filter(Boolean).join('\n\n');
   note.videoKind='stream';note.streamVideoUrl=note.videoUrl;note.videoSize=note.streamSize;
   if(note.originalVideoUrl){try{const {response:probe}=await fetchAllowed(note.originalVideoUrl,MEDIA_HOSTS,{headers:{range:'bytes=0-1023','referer':'https://www.xiaohongshu.com/'}});const accessible=probe.ok&&/video|octet-stream/i.test(probe.headers.get('content-type')||'');const total=probe.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]||probe.headers.get('content-length');await probe.body?.cancel();if(accessible){note.videoUrl=note.originalVideoUrl;note.videoKind='original';note.videoSize=Number(total)||null;note.width=null;note.height=null}}catch{}}
   const context='&source='+encodeURIComponent(source);
   const download=note.videoUrl?'/api/download?url='+encodeURIComponent(note.videoUrl)+'&id='+encodeURIComponent(note.id)+'&kind='+note.videoKind+context:null;
   const small=note.streamVideoUrl?'/api/download?url='+encodeURIComponent(note.streamVideoUrl)+'&id='+encodeURIComponent(note.id)+'-mobile&kind=mobile'+context:null;
   return json({...note,downloadUrl:download,smallDownloadUrl:small,previewUrl:small?small+'&inline=1':download?download+'&inline=1':null});
  }
  return json({error:'Không tìm thấy trang.'},404);
 }catch(error){if(new URL(request.url).pathname==='/api/download'&&!new URL(request.url).searchParams.has('inline'))return downloadError(request,error);if(error instanceof AppError)return json({error:error.message,...(error.code?{code:error.code}:{}),...(request.headers.get('x-pha-diagnostic')==='1'?{sourceDetails:error.sourceDetails}:{})},error.status);return json({error:'Chưa kết nối được dịch vụ nguồn. Hãy thử lại sau; caption đã dán vẫn được giữ nguyên.'},502)}
}};
const HTML=String.raw`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#183c34"><meta name="description" content="Tải video Rednote và Việt hóa caption theo chuyên môn cùng PHA."><title>PHA Rednote — Lưu cảm hứng. Hiểu đúng nghĩa.</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"><style>

:root{--ink:#193c34;--green:#306854;--mint:#e6f1e8;--muted:#6d7b70;--paper:#f9faf5;--pink:#f9e5e5;--line:#dfe7dd}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:'Be Vietnam Pro',system-ui,sans-serif;font-size:14px;line-height:1.6}button,input,textarea,select{font:inherit}button,a,input,textarea,select{-webkit-tap-highlight-color:transparent}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid #85c6aa;outline-offset:4px}a{color:inherit}header{border-bottom:1px solid var(--line);background:#fbfcf7}nav{max-width:1200px;margin:auto;padding:22px 32px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:12px}.brandmark{width:40px;height:40px;background:var(--ink);color:#e4f1d5;display:grid;place-items:center;border-radius:13px;font-size:22px;font-weight:800;line-height:1}.brand strong{font-size:18px;letter-spacing:-.7px}.brand small{color:var(--muted);border-left:1px solid #bbc9bb;padding-left:12px;margin-left:12px;font-size:12px}.navright{display:flex;align-items:center;gap:18px}.private{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:7px}.dot{width:6px;height:6px;border-radius:50%;background:#70a98b}.settings{background:none;border:1px solid var(--line);border-radius:9px;padding:7px 12px;color:var(--ink);font-size:12px}.shell{max-width:1200px;margin:auto;padding:0 32px 30px}.hero{display:flex;justify-content:space-between;align-items:center;padding:46px 0 33px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;display:flex;align-items:center;gap:8px;color:var(--green)}.eyebrow:before{content:'';height:1px;width:20px;background:var(--green)}h1{font-size:clamp(32px,4vw,47px);letter-spacing:-2px;line-height:1.22;margin:15px 0 13px;font-weight:700}h1 span{color:#7b9c78}p{margin:0}.lead{color:var(--muted);max-width:490px;font-size:13px}.stamp{width:120px;height:120px;border-radius:50%;border:1px solid #c8d8c8;display:flex;flex-direction:column;justify-content:center;align-items:center;transform:rotate(10deg);background:var(--mint);font-size:10px;letter-spacing:2px;box-shadow:inset 0 0 0 7px var(--paper),inset 0 0 0 8px #c8d8c8}.stamp strong{font-size:35px;letter-spacing:-2px;line-height:1.3}.stamp span{font-size:9px;letter-spacing:1px}.workspace{display:grid;grid-template-columns:340px minmax(0,1fr);gap:24px}.panel{border:1px solid var(--line);border-radius:18px;background:white;overflow:hidden}.inputpanel{padding:24px}.titleline{display:flex;gap:10px;align-items:center;margin-bottom:20px}.step{background:var(--mint);color:var(--green);width:25px;height:25px;border-radius:8px;display:grid;place-items:center;font-size:11px;font-weight:700}h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.4px}label.field{display:block;font-size:11px;font-weight:600;margin:17px 0 8px}.urlwrap{position:relative}textarea,input,select{border:1px solid var(--line);border-radius:10px;background:#fbfcf8;outline:none;color:var(--ink)}textarea:focus,input:focus,select:focus{border-color:#73a88c;box-shadow:0 0 0 3px #e9f2e9}#url{width:100%;height:114px;padding:14px;resize:vertical;font-size:12px;line-height:1.7}textarea::placeholder{color:#94a195}.paste{position:absolute;bottom:12px;right:12px;border:1px solid var(--line);background:white;border-radius:6px;padding:3px 9px;font-size:10px;color:var(--muted)}select{width:100%;padding:11px 12px;font-size:12px;appearance:auto}.helper{font-size:10px;color:var(--muted);margin-top:7px}.toggleline{display:flex;align-items:center;justify-content:space-between;font-size:11px;margin:20px 0;gap:8px}.toggle{appearance:none;width:32px;height:19px;border:0;border-radius:12px;background:#cbd5ca;position:relative;margin:0;cursor:pointer;flex-shrink:0}.toggle:checked{background:var(--green)}.toggle:before{content:'';position:absolute;width:13px;height:13px;border-radius:50%;background:white;top:3px;left:3px;transition:.2s}.toggle:checked:before{left:16px}.primary{width:100%;background:var(--ink);color:white;border:0;padding:13px 16px;border-radius:10px;font-weight:500;font-size:12px;display:flex;align-items:center;justify-content:center;gap:10px}.primary:hover{background:#285749}.tipbox{background:var(--mint);border-radius:13px;padding:18px 19px;margin-top:18px;font-size:11px;color:#557158}.tipbox strong{display:block;color:var(--ink);margin-bottom:7px;font-size:11px}.tipbox ol{padding-left:17px;margin:0}.tipbox li{padding:3px 0}.underlink{font-size:10px;color:var(--muted);text-align:center;margin:15px 0 0}.underlink button{border:0;background:none;text-decoration:underline;font-size:10px;color:var(--green)}.results{min-height:474px;display:flex;flex-direction:column}.resulttop{display:flex;align-items:center;justify-content:space-between;padding:19px 23px;border-bottom:1px solid var(--line)}.resulttop .titleline{margin:0}.tag{font-size:9px;color:var(--muted);background:#f3f5ef;padding:4px 8px;border-radius:5px;letter-spacing:.2px}.empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:36px;position:relative;background:radial-gradient(ellipse at center,#f5f8f0 0,white 60%)}.illustration{width:170px;height:140px;position:relative;margin:14px 0 23px}.cardback{position:absolute;width:88px;height:111px;background:var(--pink);border:1px solid #e4d4d0;border-radius:10px;left:15px;top:17px;transform:rotate(-13deg);padding:12px}.cardback .line{height:4px;margin:6px 0;background:#d9b6b5;border-radius:2px}.cardfront{position:absolute;width:94px;height:123px;background:#edf4e4;border:1px solid #c6d8b9;border-radius:10px;left:66px;top:7px;transform:rotate(9deg);display:grid;place-items:center;box-shadow:0 9px 22px #27423412}.play{border-radius:50%;width:35px;height:35px;background:#c9deba;display:grid;place-items:center;font-size:14px;padding-left:3px}.spark{position:absolute;right:-6px;top:-10px;color:#819966;font-size:28px}.smallflag{position:absolute;bottom:0;left:28px;font-size:10px;background:white;border:1px solid var(--line);border-radius:20px;padding:5px 10px;transform:rotate(-4deg)}.empty h3{font-size:16px;letter-spacing:-.5px;margin:0 0 7px}.empty p{max-width:320px;color:var(--muted);font-size:11px;line-height:1.8}.flow{display:flex;gap:12px;align-items:center;margin-top:30px;font-size:9px;color:#7d897c}.flow b{background:#f3f6ee;font-weight:500;padding:5px 9px;border-radius:5px}.flow i{font-style:normal;color:#b1bcac}.features{display:grid;grid-template-columns:repeat(3,1fr);gap:25px;padding:30px 5px 27px}.feature{display:flex;gap:12px}.featureicon{background:#eaf1e5;border:1px solid #dce7d5;border-radius:10px;flex-shrink:0;width:34px;height:34px;display:grid;place-items:center;font-size:16px}.feature:nth-child(2) .featureicon{background:var(--pink);border-color:#efdbd8}.feature h3{font-size:11px;margin:0 0 3px;font-weight:600}.feature p{font-size:10px;color:var(--muted)}footer{border-top:1px solid var(--line);padding-top:17px;display:flex;justify-content:space-between;font-size:9px;color:#899484}footer b{color:var(--green);letter-spacing:1px;font-size:10px}.status{padding:12px 16px;margin-top:14px;border-radius:9px;background:#edf4e8;font-size:11px;line-height:1.7}.status.error{background:#fff0eb;color:#93523d}.hidden,[hidden]{display:none!important}.resultbody{padding:22px}.videohead{display:flex;gap:16px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px;align-items:center}.videohead video{width:118px;height:150px;border-radius:10px;object-fit:contain;background:#162c25;flex-shrink:0}.videoinfo{min-width:0}.videoinfo h3{font-size:14px;line-height:1.6;margin:0 0 6px;overflow-wrap:anywhere}.videoinfo p{font-size:10px;color:var(--muted)}.download{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:white;text-decoration:none;padding:9px 13px;border-radius:8px;font-size:11px;margin:12px 0 5px}.secondary{border:1px solid var(--line);border-radius:7px;padding:6px 10px;background:white;color:var(--ink);font-size:10px}.tabs{display:flex;gap:7px;margin-bottom:12px}.tab{border:1px solid var(--line);background:#fbfcf8;border-radius:7px;padding:7px 12px;font-size:11px;color:var(--muted)}.tab.active{background:var(--mint);border-color:#c3d9c7;color:var(--ink)}.captionhead{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:10px;color:var(--muted);margin:10px 0}.captionarea{width:100%;min-height:185px;padding:15px;resize:vertical;font-size:12px;line-height:1.9;background:#fbfcf8}.captionfoot{display:flex;gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap}.captionfoot .primary{width:auto;flex:1;min-width:130px;padding:10px}.notes{font-size:10px;color:#855f39;margin-top:10px}.engine{font-size:9px;margin-top:10px;color:var(--muted)}.manualhint{font-size:11px;color:var(--muted);margin-bottom:16px}.busy .step{animation:pulse 1s infinite}@keyframes pulse{50%{opacity:.35}}.toast{position:fixed;bottom:calc(25px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:var(--ink);color:white;padding:10px 20px;border-radius:30px;font-size:11px;z-index:50;box-shadow:0 4px 20px #0002;max-width:90vw;text-align:center}dialog{border:1px solid var(--line);padding:25px;border-radius:18px;width:min(440px,90vw);background:var(--paper);color:var(--ink)}dialog::backdrop{background:#10291f60;backdrop-filter:blur(3px)}dialog h2{margin-bottom:12px}dialog p{font-size:11px;color:var(--muted);margin-bottom:12px}dialog input{width:100%;padding:12px;font-size:12px}dialog .actions{display:flex;gap:10px;margin-top:18px}dialog .actions button{flex:1}svg{width:16px;height:16px;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
@media(min-width:1400px){.shell,nav{max-width:1250px}.hero{padding-top:60px}.workspace{grid-template-columns:360px 1fr}.results{min-height:495px}}
@media(max-width:800px){.shell{padding:0 22px 25px}nav{padding:17px 22px}.brand small{display:none}.private{display:none}.hero{padding:32px 0 25px}.stamp{width:90px;height:90px;flex-shrink:0;margin-left:15px}.stamp strong{font-size:27px}.stamp span{font-size:7px}.stamp{font-size:8px}h1{font-size:35px}.workspace{grid-template-columns:290px minmax(0,1fr);gap:16px}.inputpanel{padding:18px}.resulttop{padding:19px 16px}.resultbody{padding:16px}.features{gap:15px}}
@media(max-width:650px){nav{padding:15px 20px}.shell{padding:0 20px 24px}.brand strong{font-size:16px}.brandmark{width:34px;height:34px;font-size:19px}.settings{padding:6px 9px;font-size:10px}.hero{padding-top:29px}.eyebrow{font-size:8px;letter-spacing:1.6px}h1{font-size:33px;letter-spacing:-1.5px;margin:12px 0}.lead{font-size:11px;max-width:280px}.stamp{display:none}.workspace{grid-template-columns:1fr;gap:18px}.inputpanel{padding:21px}.results{min-height:370px}.empty{padding:26px 20px}.empty p{font-size:11px}.illustration{margin-top:0;height:128px}.features{grid-template-columns:1fr;padding:25px 3px;gap:18px}.feature p{font-size:11px}.feature h3{font-size:12px}footer{gap:14px;font-size:9px}.videohead{align-items:flex-start}.videohead video{width:102px;height:138px}.captionarea{font-size:16px}#url,input,select{font-size:16px}.paste{font-size:10px}.helper{font-size:10px}.tipbox{font-size:11px}.captionfoot .secondary{padding:9px 12px}.resulttop .tag{font-size:8px}}
nav{flex-wrap:wrap;gap:12px}.release-menu{position:relative}.release-badge{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:2px;background:var(--mint);border:1px solid #c3d9c7;border-radius:10px;padding:8px 12px;max-width:250px;line-height:1.4;color:var(--ink);font-size:11px}.release-badge::-webkit-details-marker{display:none}.release-badge b:after{content:' ▾';font-size:10px}.release-badge:focus-visible{outline:3px solid #85c6aa;outline-offset:3px}.release-history{position:absolute;right:0;top:calc(100% + 8px);width:min(340px,calc(100vw - 40px));background:white;border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 8px 30px #193c3420;z-index:40;font-size:12px;line-height:1.6}.release-history ol{padding:0;list-style:none;margin:12px 0}.release-history li+li{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}.release-history time{display:block;color:var(--muted);font-size:10px;margin:4px 0}.release-history small{display:inline-block;color:var(--green);font-size:10px}.release-history p{color:var(--muted);font-size:11px}.release-note{border-top:1px solid var(--line);padding-top:10px}@media(max-width:650px){.release-badge{max-width:170px;font-size:10px;padding:7px 10px}.navright{margin-left:auto}}
${dubAssets['/dub/dub.css']}
</style><script type="importmap">{"imports":{"onnxruntime-web":"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.mjs","onnxruntime-web/wasm":"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs"}}</script></head><body>
<header><nav><div class="brand"><div class="brandmark">p.</div><div><strong>PHA <span style="font-weight:400">rednote</span></strong><small>CREATIVE TOOLKIT</small></div></div><div class="navright"><span class="private"><i class="dot"></i> Không lưu nội dung trên máy chủ</span><details class="release-menu" data-app-release="${APP_RELEASE.version}"><summary class="release-badge"><b>Bản ${APP_RELEASE.version}</b><span>${escapeHtml(APP_RELEASE.name)}</span></summary><div class="release-history"><strong>Lịch sử cập nhật</strong><ol>${APP_RELEASES.map((release,index)=>'<li><b>Bản '+release.version+' · '+escapeHtml(release.name)+(index===0?' <small>Đang dùng</small>':'')+'</b><time>'+release.date+'</time><p>'+escapeHtml(release.description)+'</p></li>').join('')}</ol><p class="release-note">Phần tải video: bản 27 · phần sửa 08, 09 và 10.</p></div></details></div></nav></header>
<main class="shell"><section class="hero"><div><div class="eyebrow">TỪ REDNOTE ĐẾN WORKFLOW CỦA BẠN</div><h1>Lưu cảm hứng.<br><span>Hiểu đúng nghĩa.</span></h1><p class="lead">Một đường link. Video nguồn và caption gốc.<br>Lưu video, giữ nguyên nội dung của bài viết.</p></div><div class="stamp" aria-hidden="true">CREATED FOR<strong>PHA</strong><span>YOUR CREATIVE FLOW</span></div></section>
<div class="workspace"><aside><section class="panel inputpanel" data-download-version="27-sua10"><div class="titleline"><span class="step">01</span><h2>Dán link Rednote</h2></div><p class="helper"><b>Tải video · Bản 27 · Phần sửa 08, 09 và 10</b> Lưu video vào app, kiểm tra lại dung lượng và đưa sang Dịch &amp; lồng tiếng.</p><form id="extractForm"><label class="field" for="url">Link video hoặc đoạn chia sẻ</label><div class="urlwrap"><textarea id="url" placeholder="Dán link xhslink.com hoặc xiaohongshu.com vào đây…" required maxlength="5000" spellcheck="false"></textarea><button type="button" class="paste" id="pasteBtn">Dán clipboard</button></div><label class="field" for="domain">Chuyên môn dịch video</label><select id="domain"><optgroup label="Hệ sinh thái PhaHa">${Object.entries(CHANNEL_PROFILES).slice(0,8).map(([id,p])=>'<option value="'+id+'"'+(id==='pha_light'?' selected':'')+'>'+p.label+'</option>').join('')}</optgroup><optgroup label="Chuyên môn khác">${Object.entries(CHANNEL_PROFILES).slice(8).map(([id,p])=>'<option value="'+id+'">'+p.label+'</option>').join('')}</optgroup></select><p class="helper" id="profileHint"></p><details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px">Quy tắc dịch video của kênh</summary><p class="helper" id="profileRules" style="white-space:pre-line"></p><label class="field" for="customRules">Quy tắc riêng bổ sung</label><textarea id="customRules" maxlength="3000" style="width:100%;min-height:110px;padding:12px;font-size:16px" placeholder="Ví dụ: giữ nguyên tên công cụ Photoshop; dùng cách xưng hô anh em…"></textarea><p class="helper">Lưu riêng từng kênh trên thiết bị này. Áp dụng cho bước dịch và lồng tiếng video.</p><button id="clearRules" class="secondary" type="button" style="margin-top:8px">Xóa quy tắc bổ sung</button><p class="helper">Đã cấu hình theo quy tắc PHA hiện có. Quy tắc riêng được lưu trên thiết bị này.</p></details><p class="helper"><b>Ưu tiên bản 1080p của Rednote (bản phát trên web, không logo) nếu nhẹ hơn bản gốc; không có thì lấy bản gốc.</b> Khi xuất, app tự hạ 2K/4K xuống 1080p, giữ tỉ lệ và tiếng gốc, không thêm logo. Logo đã có trong nội dung nguồn có thể vẫn còn.</p><button type="submit" class="primary" id="extractBtn"><span>↓</span> Lấy video → Dịch & lồng tiếng <span>↗</span></button></form><div id="status" class="status hidden" role="status" aria-live="polite"></div><input id="fileInput" type="file" accept="video/mp4,video/webm,video/*" hidden><button id="chooseFile" type="button" class="secondary" style="width:100%;margin-top:12px">Chọn video từ máy</button><p class="underlink">Đã có nội dung? <button id="manualBtn">Nhập caption gốc ↗</button></p></section><div class="tipbox"><strong>✧ Lấy link đúng, thao tác nhanh</strong><ol><li>Mở video trong ứng dụng Rednote.</li><li>Chọn <b>Chia sẻ → Sao chép liên kết</b>.</li><li>Dán vào đây và để PHA xử lý.</li></ol><p style="margin-top:10px;font-size:10px">iPhone: tải về Tệp; để lưu vào Ảnh, mở video → Chia sẻ → Lưu video nếu thiết bị hỗ trợ.</p></div></aside>
<section class="panel results" id="results"><div class="resulttop"><div class="titleline"><span class="step">02</span><h2>Video & caption của bạn</h2></div><span class="tag" id="resultTag">SẴN SÀNG</span></div><div class="empty" id="empty"><div class="illustration" aria-hidden="true"><div class="cardback"><div style="font-size:15px;margin-bottom:13px">文</div><div class="line"></div><div class="line"></div><div class="line" style="width:60%"></div></div><div class="cardfront"><div class="play">▶</div><span class="spark">✧</span></div><div class="smallflag">Caption gốc</div></div><h3>Cảm hứng tiếp theo đang chờ bạn</h3><p>Dán link Rednote để lấy video, đọc caption gốc<br>và copy nguyên nội dung tại đây.</p><div class="flow"><b>Dán link</b><i>→</i><b>Lấy nội dung</b><i>→</i><b>Tải & copy</b></div></div><div id="resultbody" class="resultbody hidden"><div class="videohead hidden" id="videohead"><video id="video" controls playsinline preload="none"></video><div class="videoinfo"><h3 id="videoTitle"></h3><p id="author"></p><a id="download" class="download" download>↓ Lưu video về máy</a><br><a id="smallDownload" class="secondary hidden" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;margin:5px 0">↓ Tải MP4 cho điện thoại</a><br><button id="openVideo" class="secondary hidden" type="button" style="margin:8px 0">Chia sẻ / Lưu vào Tệp</button><p id="videoMessage"></p><a class="download" href="#videoStudio">→ Dịch & lồng tiếng video</a><a id="sourceLink" target="_blank" rel="noopener noreferrer" style="font-size:10px">Mở bài gốc ↗</a></div></div><p class="manualhint hidden" id="manualhint">Caption gốc được giữ tại đây để copy hoặc lưu.</p><div class="captionhead"><label for="original">Caption gốc · Có thể chỉnh sửa</label><button class="secondary" id="copyOriginal">⧉ Copy caption gốc</button></div><textarea class="captionarea" id="original" placeholder="Caption gốc của bài viết sẽ hiện ở đây…" maxlength="16000"></textarea><div class="captionfoot"><button class="secondary" id="saveTxt">↓ Lưu caption gốc .txt</button><button class="secondary" id="resetBtn">Làm mới</button></div></div></section></div>
<section class="panel" style="padding:22px;margin-top:20px"><details open><summary style="cursor:pointer;font-weight:600">📋 Nhật ký xử lý</summary><p class="helper">Ghi lại tải video, lấy caption gốc và lồng tiếng trên máy này. Sao chép để gửi hỗ trợ; xóa log khi đã xử lý xong.</p><textarea id="runLog" class="captionarea" style="min-height:220px;font-family:monospace;font-size:12px" readonly spellcheck="false" aria-label="Nhật ký xử lý"></textarea><div class="captionfoot"><button type="button" id="copyRunLog" class="secondary">📋 Sao chép nhật ký</button><button type="button" id="clearRunLog" class="secondary">🗑 Xóa toàn bộ nhật ký</button></div><p id="runLogFeedback" class="helper" role="status"></p></details></section>
${dubAssets['/dub/dub.html']}
<section class="features"><div class="feature"><div class="featureicon">↓</div><div><h3>Giữ file từ nguồn</h3><p>Lấy bản video nguồn truy cập được, không nén lại.</p></div></div><div class="feature"><div class="featureicon">文</div><div><h3>Giữ caption gốc</h3><p>Lấy nguyên nội dung bài viết, không tự dịch.</p></div></div><div class="feature"><div class="featureicon">⧉</div><div><h3>Sẵn sàng cho workflow</h3><p>Copy nhanh hoặc lưu caption gốc .txt.</p></div></div></section><footer><b>PHA LAB / TOOLS</b><span>Chỉ tải nội dung bạn có quyền sử dụng. Tôn trọng tác giả.</span></footer></main>
<div id="toast" class="toast hidden" role="status"></div>
<script src="/dub/run-journal.js"></script><script src="/dub/video-download.js"></script>
<script>
try{for(const k of ['pha-caption-chatgpt-job-v1','pha-caption-chatgpt-result-v1','pha-caption-chatgpt-config-v1'])localStorage.removeItem(k)}catch{}
const $=id=>document.getElementById(id);let note=null,busy=false,toastTimer,videoFile=null,localVideoUrl=null,savedVideo=null,savedVideoUrl=null;
function logRun(stage,message){globalThis.PHARunLog?.add(stage,message);}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500)}
function status(text,error=false){$('status').textContent=text;$('status').classList.remove('hidden');$('status').classList.toggle('error',error)}
function setBusy(value){busy=value;for(const id of ['extractBtn','resetBtn','domain','original','manualBtn','chooseFile','customRules','clearRules']){const control=$(id);if(control)control.disabled=value;}$('results').classList.toggle('busy',value);$('resultTag').textContent=value?'ĐANG XỬ LÝ':videoFile||note?.delivery==='attachment'?'VIDEO SẴN SÀNG':'SẴN SÀNG'}
async function api(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);try{logRun('Gọi dịch vụ',path);const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});logRun('Gọi dịch vụ',path+' → HTTP '+r.status);const data=await r.json();if(!r.ok)throw Error(data.error||'Chưa xử lý được yêu cầu.');return data}catch(e){logRun('Lỗi dịch vụ',path+' · '+e.message);if(e.name==='AbortError')throw Error('Dịch vụ phản hồi quá lâu. Hãy thử lại.');throw e}finally{clearTimeout(timer)}}
function showResults(){$('empty').classList.add('hidden');$('resultbody').classList.remove('hidden')}
function keepCaption(){try{localStorage.setItem('pha-original-caption-v1',$('original').value)}catch{}}
$('original').addEventListener('input',keepCaption);
try{const text=localStorage.getItem('pha-original-caption-v1');if(text){$('original').value=text;showResults();$('manualhint').classList.remove('hidden')}}catch{}

const browserProfiles=${JSON.stringify(Object.fromEntries(Object.keys(CHANNEL_PROFILES).map(id=>[id,translationProfile(id)])))};
let channelSettings={selected:'pha_light',rules:{},footers:{}};
try{const saved=JSON.parse(localStorage.getItem('pha-rednote-channel-settings-v1')||'null');if(saved&&typeof saved==='object'){if(Object.hasOwn(browserProfiles,saved.selected))channelSettings.selected=saved.selected;for(const id of Object.keys(browserProfiles)){if(typeof saved.rules?.[id]==='string')channelSettings.rules[id]=saved.rules[id].slice(0,3000);if(typeof saved.footers?.[id]==='boolean')channelSettings.footers[id]=saved.footers[id];}}}catch{}
function persistChannelSettings(){try{localStorage.setItem('pha-rednote-channel-settings-v1',JSON.stringify(channelSettings))}catch{toast('Trình duyệt chưa cho lưu quy tắc. Quy tắc vẫn dùng được trong tab này.')}}
function currentProfile(){return browserProfiles[$('domain').value]||browserProfiles.general}
function updateProfile(){const p=currentProfile();$('profileHint').textContent=p.description;$('profileRules').textContent=p.rules||'Giữ sát nghĩa nguồn; không thêm thông số hoặc kiến thức ngoài nguồn.';$('customRules').value=channelSettings.rules[p.id]||'';}
$('domain').value=channelSettings.selected;updateProfile();
function clearSavedVideo(){if(savedVideoUrl)URL.revokeObjectURL(savedVideoUrl);if(savedVideo&&savedVideo!==videoFile)globalThis.PHAVideoDownload?.release(savedVideo);savedVideo=null;savedVideoUrl=null;}
function loadFile(file,title){
 clearSavedVideo();
 logRun('Video sẵn sàng',file.name+' · '+file.size+' byte · đã nhận vào app');
 if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);
 const previous=videoFile;videoFile=file;if(previous!==file)globalThis.PHAVideoDownload?.release(previous);localVideoUrl=URL.createObjectURL(file);showResults();
 $('videohead').classList.remove('hidden');$('video').classList.remove('hidden');$('video').src=localVideoUrl;
 $('videoTitle').textContent=title||file.name;$('download').classList.remove('hidden');$('download').href='#';$('download').removeAttribute('download');$('download').removeAttribute('target');
 $('download').textContent='↓ Chuẩn bị bản lưu 1080p';
 $('openVideo').classList.add('hidden');$('smallDownload').classList.add('hidden');
 $('videoMessage').textContent='Video gốc đã vào phần Dịch & lồng tiếng. Hạ xuống 1080p khi xuất hoặc khi chuẩn bị bản lưu.';
 if(globalThis.dispatchEvent)globalThis.dispatchEvent(new Event('pha-video-loaded'));
}
async function prepareVideo(file,signal){
 try{
  const processor=globalThis.PHAVideo1080||await import('/dub/video-1080.js');let last=-1;
  const result=await processor.normalise(file,{signal,onProgress:p=>{status('Đang chuẩn bị video 1080p: '+Math.round(p*100)+'%');const step=Math.floor(p*10);if(step!==last){last=step;logRun('Video 1080p',Math.round(p*100)+'%')}}});
  logRun('Video 1080p',result.sourceWidth+'×'+result.sourceHeight+' → '+result.width+'×'+result.height+' · '+(result.converted?'đã hạ độ phân giải, giữ tiếng gốc':'giữ độ phân giải nguồn')+' · '+result.file.size+' byte');
  return result.file;
 }catch(error){throw error;}
}
async function pullLink(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1800000);
 try{
  // Ghi được xuống bộ nhớ app thì xin máy chủ trả kiểu tải từng phần cho mọi kích thước (không giữ video trong RAM).
  const disk=await globalThis.PHAVideoDownload?.canUseDisk?.().catch(()=>false);
  logRun('Tải Rednote',disk?'Ghi video thẳng xuống bộ nhớ app, không giữ trong RAM':'Trình duyệt chưa cho ghi xuống bộ nhớ app → nhận video vào RAM (tối đa 256 MB)');
  const r=await fetch('/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:$('url').value,preferOriginal:true,delivery:disk?'attachment':'stream'}),signal:controller.signal});
  logRun('Tải Rednote','/api/dub/fetch-video → HTTP '+r.status);if(!r.ok){let error;try{error=await r.json()}catch{}throw Error(error?.error||'Máy chủ chưa lấy được video. Hãy thử lại.')}
  if((r.headers.get('content-type')||'').includes('application/json')){
   const data=await r.json();if(data.delivery!=='attachment')throw Error(data.error||'Chưa lấy được video.');
   const label=data.mode==='original'?'gốc':data.mode==='p1080'?'1080p':'bản chia sẻ';
   if(data.reason)logRun('Tải Rednote',data.reason+(data.mode==='p1080'?' → dùng bản 1080p của Rednote ('+data.width+'×'+data.height+' · '+(data.codec||'')+')':''));
   logRun('Tải Rednote',(data.mode==='original'?'Bản gốc ':data.mode==='p1080'?'Bản 1080p ':'Bản chia sẻ ')+data.size+' byte · tải từng phần vào bộ lưu trữ app');note={...data,videoUrl:data.mode};showResults();$('videohead').classList.remove('hidden');$('videoTitle').textContent=data.title;$('author').textContent=data.author?'Tác giả: '+data.author:'Rednote';
   $('video').classList.remove('hidden');$('video').removeAttribute('src');$('download').classList.add('hidden');$('download').href=data.downloadUrl;$('download').removeAttribute('download');$('download').target='_blank';$('download').rel='noopener';$('download').textContent='↓ Tải video '+label+' · '+Math.round(data.size/1e6)+' MB';
   $('openVideo').classList.add('hidden');$('smallDownload').classList.add('hidden');$('sourceLink').href=data.sourceUrl;$('sourceLink').classList.remove('hidden');$('original').value=data.caption;
   $('videoMessage').textContent='Đang tải video vào app…';
   try{
    if(!globalThis.PHAVideoDownload)throw Error('Chưa tải được bộ lưu video. Hãy mở lại app.');
    logRun('Tải vào app','Tải song song tối đa '+globalThis.PHAVideoDownload.CONCURRENCY+' luồng; ghi từng phần vào bộ lưu trữ');
    let logged=0,loggedStorageRetries=0;const file=await globalThis.PHAVideoDownload.attachment(data,{signal:controller.signal,onProgress:(received,total,stats={})=>{if((stats.storageRetries||0)>loggedStorageRetries){loggedStorageRetries=stats.storageRetries;logRun('Tải vào app','Safari lỗi ghi tạm thời → ghi lại phần đang lưu · lần '+loggedStorageRetries);}const speed=stats.bytesPerSecond||0,remaining=speed?Math.ceil((total-received)/speed):0;status('Đang tải vào app: '+Math.round(received/1e6)+' / '+Math.round(total/1e6)+' MB · '+Math.floor(received/total*100)+'%'+(speed?' · '+(speed/1e6).toFixed(1)+' MB/s · còn khoảng '+Math.floor(remaining/60)+' phút '+remaining%60+' giây':''));if(received-logged>=32*1048576||received===total&&logged!==total){logged=received;logRun('Tải vào app','Đã lưu '+received+' / '+total+' byte · '+(speed/1e6).toFixed(1)+' MB/s · '+(stats.concurrency||1)+' luồng'+(stats.retries?' · đã tải lại '+stats.retries+' phần bị đứng/lỗi':''));}}});
    loadFile(file,data.title);logRun('Tải vào app','Hoàn tất · '+file.size+' byte'+(file.phaStorage?' · cách ghi: '+file.phaStorage.kind+(file.phaStorage.trimmed?' · đã cắt '+file.phaStorage.trimmed+' byte thừa':''):'')+' · đưa bản '+label+' sang Dịch & lồng tiếng ngay');if(data.mode==='p1080')$('videoMessage').textContent='Bản gốc quá nặng nên app dùng bản 1080p của Rednote. Video đã vào phần Dịch & lồng tiếng.';return file;
   }catch(error){logRun('Lỗi tải vào app',(error.name||'Error')+' · '+error.message);
    // Không để người dùng kẹt: bản gốc luôn còn nút tải thẳng về Tệp (không qua bộ nhớ app), kể cả video trên 2 GB.
    const offer=data.mode==='original'||data.mode==='p1080';if(offer){$('download').classList.remove('hidden');$('download').textContent='↓ Tải video '+label+' về Tệp · '+Math.round(data.size/1e6)+' MB';logRun('Tải vào app','Đã hiện nút tải video '+label+' thẳng về Tệp');}
    $('videoMessage').textContent='Chưa tải vào app: '+error.message+(offer?' Bạn vẫn có thể bấm nút ở trên để tải video '+label+' về Tệp.':' Hãy thử lại hoặc mở app bằng Safari đã cập nhật.');return null;}

  }
  const total=Number(r.headers.get('content-length'));if(total>256*1024*1024){await r.body.cancel();throw Error('File quá lớn để nhận trên điện thoại.')}
  logRun('Tải Rednote','Nhận file · dự kiến '+(total||'chưa biết')+' byte');const reader=r.body.getReader(),parts=[];let received=0,lastLogged=0;
  for(;;){const part=await reader.read();if(part.done)break;parts.push(part.value);received+=part.value.length;if(received-lastLogged>=8*1024*1024){lastLogged=received;logRun('Tải Rednote','Đã nhận '+received+' / '+(total||'?')+' byte');}if(received>256*1024*1024){await reader.cancel();throw Error('File quá lớn để nhận trên điện thoại.')}status('Đang nhận video: '+Math.round(received/1e6)+' MB'+(total?' / '+Math.round(total/1e6)+' MB · '+Math.floor(received/total*100)+'%':''))}
  if(total&&received!==total)throw Error('Video tải chưa đủ. Hãy nhấn Lấy video để thử lại.');
  const readHeader=name=>{try{return decodeURIComponent(r.headers.get(name)||'')}catch{return ''}};
  let file=new File(parts,readHeader('x-video-name')||'PHA-Rednote.mp4',{type:r.headers.get('content-type')||'video/mp4'});
  note={title:readHeader('x-rednote-title'),caption:readHeader('x-rednote-caption'),author:readHeader('x-rednote-author'),sourceUrl:readHeader('x-rednote-source'),videoUrl:'local',mode:readHeader('x-video-mode')};
  $('original').value=note.caption;loadFile(file,note.title);$('author').textContent=note.author?'Tác giả: '+note.author:'Rednote';
  $('sourceLink').href=note.sourceUrl;$('sourceLink').classList.remove('hidden');
  if(r.headers.get('x-caption-complete')!=='1'){try{const data=await api('/api/extract',{url:$('url').value});note.caption=data.caption}catch{toast('Đã nhận video; chưa lấy được caption. Có thể nhập caption gốc.')}}
  $('original').value=note.caption;return file;
 }catch(error){logRun('Lỗi tải video',error.message);if(error.name==='AbortError')throw Error('Video tải quá lâu. Hãy thử lại khi mạng ổn định.');throw error}finally{clearTimeout(timer)}
}
// Một đường tải duy nhất: nút chính và ô link trong phần Dịch video đều gọi hàm này.
async function runExtract(){
 if(busy)return {ok:false,message:'Đang xử lý video khác, đợi xong rồi thử lại.'};logRun('Bắt đầu tải','Link: '+($('url').value.match(/https?:[^\s]+/)?.[0]||'chưa có link')+' · '+$('domain').value+' · ưu tiên bản 1080p Rednote, không có thì bản gốc · đưa thẳng sang dịch · hạ 1080p lúc xuất');logRun('Thiết bị',globalThis.navigator?.userAgent||'chưa đọc được UA');setBusy(true);status('Máy chủ đang đọc link và lấy file video…');note=null;$('original').value='';clearSavedVideo();globalThis.PHAVideoDownload?.release(videoFile);videoFile=null;if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);localVideoUrl=null;$('video').pause();$('video').removeAttribute('src');$('videohead').classList.add('hidden');if(globalThis.dispatchEvent)globalThis.dispatchEvent(new Event('pha-video-reset'));
 try{
  await pullLink();$('manualhint').classList.add('hidden');status(videoFile?'Video ('+(note?.mode==='p1080'?'bản 1080p của Rednote':'bản gốc')+') đã sẵn sàng trong phần Dịch & lồng tiếng.':'Chưa tải được video vào app. Caption gốc vẫn giữ nguyên.',!videoFile);
  // Downloading into Studio does not start a separate save or encode job.
  keepCaption();logRun('Caption gốc',String($('original').value.length)+' ký tự · giữ nguyên · không gọi dịch vụ dịch');
 }catch(error){status(error.message,true)}finally{keepCaption();setBusy(false);if(videoFile)$('videoStudio')?.scrollIntoView?.({behavior:'smooth',block:'start'})}
 return {ok:!!videoFile,message:$('status').textContent};
}
$('extractForm').addEventListener('submit',e=>{e.preventDefault();return runExtract();});
$('video').addEventListener('loadedmetadata',()=>logRun('Thông tin video',$('video').duration.toFixed(2)+' giây · '+$('video').videoWidth+'×'+$('video').videoHeight));
$('video').addEventListener('error',()=>{const e=$('video').error;if(e)logRun('Lỗi xem trước','mã '+e.code+' · '+(e.message||'Safari chưa phát được video'));});
$('download').addEventListener('click',async event=>{
 if(savedVideo){logRun('Lưu video','Đã yêu cầu Safari mở/tải bản tối đa 1080p; chưa xác nhận đã lưu vào Tệp.');return;}
 event.preventDefault();if(!videoFile||busy)return;setBusy(true);const source=videoFile;
 try{
  const file=await prepareVideo(source,AbortSignal.timeout(1800000));savedVideo=file;savedVideoUrl=URL.createObjectURL(file);
  $('download').href=savedVideoUrl;$('download').download=file.name;$('download').textContent='↓ Lưu video 1080p · '+Math.round(file.size/1e6)+' MB';$('openVideo').classList.remove('hidden');
  status('Bản lưu tối đa 1080p đã sẵn sàng. Chạm Lưu video hoặc Chia sẻ.');
 }catch(error){logRun('Lỗi chuẩn bị bản lưu',error.message);status(error.message,true)}finally{setBusy(false)}
});
$('chooseFile').onclick=()=>$('fileInput').click();
$('fileInput').onchange=()=>{const file=$('fileInput').files[0];if(!file||busy)return;if(file.size>2*1024*1024*1024)return status('File vượt hai GB. Hãy chọn video nhỏ hơn.',true);note=null;$('original').value='';loadFile(file);$('author').textContent='Video chọn từ máy';$('sourceLink').classList.add('hidden');status('Đã chọn video. Bạn có thể nhập caption gốc.');$('fileInput').value=''};
$('openVideo').onclick=async()=>{if(!savedVideo)return;try{if(navigator.canShare?.({files:[savedVideo]})){await navigator.share({files:[savedVideo],title:note?.title||savedVideo.name});return}if(!window.open(savedVideoUrl,'_blank'))toast('Chạm Lưu video để tải file.')}catch(error){if(error.name!=='AbortError')toast('Chạm Lưu video để tải hoặc mở app bằng Safari.')}};
$('manualBtn').onclick=()=>{showResults();$('manualhint').classList.remove('hidden');$('original').focus();$('resultbody').scrollIntoView({behavior:'smooth',block:'start'})};
for(const id of ['domain','customRules'])$(id).addEventListener(id==='domain'?'change':'input',()=>{if(id==='domain'){channelSettings.selected=$('domain').value;updateProfile();persistChannelSettings();if(globalThis.dispatchEvent)globalThis.dispatchEvent(new Event('pha-profile-changed'))}else{channelSettings.rules[$('domain').value]=$('customRules').value;persistChannelSettings()}});
$('clearRules').onclick=()=>{delete channelSettings.rules[$('domain').value];$('customRules').value='';persistChannelSettings();toast('Đã xóa quy tắc bổ sung của kênh.')};
async function copy(id){const text=$(id).value;if(!text.trim())return toast('Chưa có nội dung để copy.');try{await navigator.clipboard.writeText(text);toast('Đã sao chép caption.')}catch{$(id).focus();$(id).select();if(document.execCommand('copy'))toast('Đã sao chép caption.');else toast('Giữ vào phần chữ và chọn Sao chép.')}}
$('copyOriginal').onclick=()=>copy('original');
$('pasteBtn').onclick=async()=>{try{$('url').value=await navigator.clipboard.readText();toast('Đã dán link.')}catch{$('url').focus();toast('Giữ ô nhập rồi chọn Dán trên điện thoại.')}};
$('saveTxt').onclick=()=>{const text=$('original').value;if(!text.trim())return toast('Chưa có caption gốc để lưu.');const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=currentProfile().label.replace(/[^a-zA-Z0-9À-ỹ -]/g,'').trim()+'-caption-goc.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)};
$('resetBtn').onclick=()=>{try{localStorage.removeItem('pha-original-caption-v1')}catch{}note=null;clearSavedVideo();globalThis.PHAVideoDownload?.release(videoFile);videoFile=null;if(localVideoUrl)URL.revokeObjectURL(localVideoUrl);localVideoUrl=null;$('url').value='';$('original').value='';$('video').pause();$('video').removeAttribute('src');$('video').load();$('videohead').classList.add('hidden');$('resultbody').classList.add('hidden');$('empty').classList.remove('hidden');$('status').classList.add('hidden');$('url').focus();if(globalThis.dispatchEvent)globalThis.dispatchEvent(new Event('pha-video-reset'))};
globalThis.PHADownload={fetchLink:text=>{$('url').value=String(text||'');return runExtract();},getVideoFile:()=>videoFile,prepareVideo,isBusy:()=>busy,getProfile:currentProfile,getProfiles:()=>browserProfiles,getRules:()=>$('customRules').value,lock:setBusy,setVideo:(file,metadata)=>{note=metadata||null;$('original').value=metadata?.caption||'';keepCaption();loadFile(file,metadata?.title);$('author').textContent=metadata?.author||'Video chọn từ máy';if(metadata?.sourceUrl){$('sourceLink').href=metadata.sourceUrl;$('sourceLink').classList.remove('hidden')}else $('sourceLink').classList.add('hidden')}};
</script><script type="module" src="/dub/app.js"></script></body></html>`;
