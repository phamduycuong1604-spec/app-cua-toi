import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './phaha-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});const h=harness();h.eval("tepVideo=new File(['source'],'tên-video.mp4');videoKetQua=new File(['completed'],'PHA-ket-qua.mp4',{type:'video/mp4'});resultURL='blob:result';");return h;}
const click=h=>h.get('nut-luu').events.click[0]();

test('Save video catches canShare failures rather than rejecting the click without a log',async t=>{
 const h=fixture(t);h.context.navigator.canShare=()=>{throw new DOMException('not readable','NotReadableError')};h.context.navigator.share=async()=>{};
 await assert.doesNotReject(click(h));assert.match(h.get('o-nhat-ky').textContent,/Lưu video/);
});
test('Save video creates the share call synchronously in the actual tap, before any awaited storage read',async t=>{
 const h=fixture(t);let asked=0;h.context.PHAVideoDownload={openFile:()=>assert.fail('Do not await a disk read before native share')};h.context.navigator.canShare=()=>true;h.context.navigator.share=({files})=>{asked++;assert.equal(files[0].name,'tên-video-tieng-viet.mp4');return Promise.resolve()};
 const pending=click(h);assert.equal(asked,1);await pending;
});
test('Save video keeps a native attached Files link when Web Share is unavailable',async t=>{
 const h=fixture(t);h.eval('capNhatLinkLuuVideo()');const link=h.get('nut-tai-tep');let clicks=0;link.click=()=>clicks++;
 await click(h);assert.equal(clicks,1);assert.equal(link.tagName,'A');assert.equal(link.href,'blob:result');assert.equal(link.download,'tên-video-tieng-viet.mp4');assert.equal(link.target,'_blank');assert.equal(link.classList.contains('an'),false);assert.match(h.get('tt-luu-video').textContent,/Tệp/);assert.equal(h.revoked.includes('blob:result'),false);
});
test('Save video reports a denied share and leaves a direct link for a second explicit tap',async t=>{
 const h=fixture(t);h.context.navigator.canShare=()=>true;h.context.navigator.share=async()=>{throw new DOMException('blocked','NotAllowedError')};
 await click(h);assert.equal(h.get('nut-luu').disabled,false);assert.equal(h.get('nut-tai-tep').href,'blob:result');assert.match(h.get('tt-luu-video').textContent,/Tải về Tệp/);assert.match(h.get('o-nhat-ky').textContent,/NotAllowedError/);
});
test('Save video cancellation is logged and does not start a surprise download',async t=>{
 const h=fixture(t);let downloads=0;h.get('nut-tai-tep').click=()=>downloads++;h.context.navigator.canShare=()=>true;h.context.navigator.share=async()=>{throw new DOMException('cancel','AbortError')};
 await click(h);assert.equal(downloads,0);assert.equal(h.get('nut-luu').disabled,false);assert.match(h.get('tt-luu-video').textContent,/đóng bảng chia sẻ/);
});
test('Save video reopens a stale disk file and requires a fresh tap to preserve iPhone activation',async t=>{
 const h=fixture(t);const original=h.eval('videoKetQua');let shares=0,reads=0;h.context.PHAVideoDownload={openFile:async file=>{reads++;assert.equal(file,original);return new Blob(['completed'],{type:'video/mp4'})}};
 h.context.navigator.canShare=()=>true;h.context.navigator.share=async()=>{shares++;if(shares===1)throw new DOMException('The object can not be found here.','NotFoundError')};
 await click(h);assert.equal(shares,1);assert.equal(reads,1);assert.match(h.get('tt-luu-video').textContent,/Bấm Lưu video lần nữa/);assert.notEqual(h.get('nut-tai-tep').href,'blob:result');assert.ok(h.revoked.includes('blob:result'));
 await click(h);assert.equal(shares,2);assert.equal(reads,1);
});
test('Save video catches File constructor errors and still exposes Files download',async t=>{
 const h=fixture(t);h.context.File=class{constructor(){throw new DOMException('stale file','NotFoundError')}};
 await assert.doesNotReject(click(h));assert.equal(h.get('nut-tai-tep').href,'blob:result');assert.match(h.get('o-nhat-ky').textContent,/NotFoundError/);assert.match(h.get('tt-luu-video').textContent,/Tải về Tệp/);
});
test('Save video bounds stale-file recovery and unlocks the button on failure',async t=>{
 const h=fixture(t);h.context.PHAVideoDownload={openFile:()=>new Promise(()=>{})};h.context.navigator.canShare=()=>true;h.context.navigator.share=async()=>{throw new DOMException('stale','NotFoundError')};
 const p=click(h);await flush();t.mock.timers.tick(10001);await p;assert.equal(h.get('nut-luu').disabled,false);assert.match(h.get('o-nhat-ky').textContent,/mở lại file.*TimeoutError/);assert.equal(h.get('nut-tai-tep').href,'blob:result');
});
test('Save video cannot restore an old result or link after a new video is selected',async t=>{
 const h=fixture(t);let finish;h.context.PHAVideoDownload={openFile:()=>new Promise(resolve=>finish=resolve)};h.context.navigator.canShare=()=>true;h.context.navigator.share=async()=>{throw new DOMException('stale','NotFoundError')};
 const p=click(h);await flush();h.eval('invalidateResult()');finish(new Blob(['completed']));await p;assert.equal(h.eval('videoKetQua'),null);assert.equal(h.get('nut-tai-tep').href,undefined);assert.equal(h.get('nut-tai-tep').classList.contains('an'),true);
});
test('Save video ignores duplicate taps while a native share is pending but keeps Files available',async t=>{
 const h=fixture(t);let finish,shares=0;h.context.navigator.canShare=()=>true;h.context.navigator.share=()=>{shares++;return new Promise(resolve=>finish=resolve)};
 const first=click(h);await click(h);assert.equal(shares,1);assert.equal(h.get('nut-tai-tep').href,'blob:result');finish();await first;assert.equal(h.get('nut-luu').disabled,false);
});
test('Save video controls are enabled as soon as output is ready even while rendered-file cleanup waits',async t=>{
 const h=fixture(t);h.eval(`videoKetQua=null;thoiLuong=10;cacCau=[{start:0,end:1,vi:'Đèn chính'}];caiDat.tachNhac=false;caiDat.lop.phuDe.bat=false;caiDat.lop.che.bat=false;caiDat.lop.logo.bat=false;
 taiFfmpeg=async()=>{ff={}};ganVideo=async()=>({width:3840,height:2160,coTieng:false,qua1080:true});longTieng=async()=>new Uint8Array([1]);xuatHinh=async()=>({blob:new File(['rendered'],'image.mp4'),W:1920,H:1080,codec:'avc'});xuatVideo=async()=>new File(['finished'],'result.mp4');PHAVideoDownload={release:()=>new Promise(resolve=>globalThis.finishCleanup=resolve)};`);
 const p=h.eval('chay(false)');await flush();assert.ok(h.eval('videoKetQua'));assert.equal(h.get('nut-luu').disabled,false);assert.equal(h.get('nut-phu-de').disabled,false);assert.ok(h.get('nut-tai-tep').href);h.eval('finishCleanup()');await p;
});
