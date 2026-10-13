// Shared, device-local diagnostics. Never persist request bodies or API keys.
(() => {
  const KEY='pha-app-run-log-v1',LIMIT=180000,EMPTY='Chưa có nhật ký.',areas=['runLog','o-nhat-ky','log'];
  const get=id=>document.getElementById(id);let text='';
  function safe(value,secrets=[],maxLength=8000){
    let s=String(value??'');for(const key of secrets.filter(k=>typeof k==='string'&&k.length>=8))s=s.split(key).join('[đã ẩn]');
    s=s.replace(/https?:\/\/[^\s<>"']+/gi,raw=>{try{const u=new URL(raw);return u.origin+u.pathname+(u.search?'?[đã ẩn tham số]':'');}catch{return '[đã ẩn link]';}});
    return s.replace(/\b(?:Bearer\s+)(?!\[đã ẩn\])[^\s,;]+/gi,'Bearer [đã ẩn]').replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|AIza[a-zA-Z0-9_-]{20,})\b/g,'[đã ẩn]').replace(/\b(api[_-]?key|xsec_token|password|secret|access_token)\s*["']?\s*[:=]\s*["']?[^"'\s,;]+/gi,'$1=[đã ẩn]').slice(0,maxLength);
  }
  function render(){for(const id of areas){const o=get(id);if(!o)continue;if(o.tagName==='TEXTAREA')o.value=text;else o.textContent=text||EMPTY;o.scrollTop=o.scrollHeight;}}
  function persist(){try{if(text)localStorage.setItem(KEY,text);else localStorage.removeItem(KEY);}catch{}}
  try{text=safe((localStorage.getItem(KEY)||localStorage.getItem('phaha-dv-nhat-ky')||'').slice(-LIMIT),[],LIMIT);}catch{}
  function add(stage,message,secrets=[]){const line='['+new Date().toLocaleString('vi-VN')+'] '+safe(stage)+' · '+safe(message,secrets);text=(text?text+'\n':'')+line;while(text.length>LIMIT&&text.includes('\n'))text=text.slice(text.indexOf('\n')+1);persist();render();}
  function clear(){text='';for(const key of [KEY,'phaha-dv-nhat-ky'])try{localStorage.removeItem(key);}catch{}render();for(const id of ['runLogFeedback','copyStatus'])if(get(id))get(id).textContent='Đã xóa toàn bộ nhật ký trên máy này.';if(get('nut-chep-nhat-ky'))get('nut-chep-nhat-ky').textContent='📋 Sao chép nhật ký';}
  async function copy(areaId,feedbackId){const feedback=get(feedbackId);if(!text){if(feedback)feedback.textContent='Chưa có nhật ký để sao chép.';return false;}
    try{await navigator.clipboard.writeText(text);if(feedback)feedback.textContent='Đã sao chép nhật ký. Dán vào cuộc trò chuyện để gửi.';return true;}
    catch{const o=get(areaId);if(o?.tagName==='TEXTAREA'){o.focus();o.select();o.setSelectionRange(0,o.value.length);}else if(o){const r=document.createRange();r.selectNodeContents(o);getSelection().removeAllRanges();getSelection().addRange(r);}if(feedback)feedback.textContent='Đã chọn nhật ký. Nhấn Sao chép trong menu của Safari.';return false;}
  }
  globalThis.PHARunLog={add,clear,copy,safe,getText:()=>text};render();
  if(get('copyRunLog'))get('copyRunLog').onclick=()=>copy('runLog','runLogFeedback');
  if(get('clearRunLog'))get('clearRunLog').onclick=clear;
  globalThis.addEventListener?.('storage',e=>{if(e.key===KEY||e.key===null){try{text=localStorage.getItem(KEY)||'';}catch{text='';}render();}});
})();
