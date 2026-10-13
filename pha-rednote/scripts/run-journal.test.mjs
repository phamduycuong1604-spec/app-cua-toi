import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../web/run-journal.js',import.meta.url),'utf8');
function journal(saved={},failCopy=false){
 const store=new Map(Object.entries(saved)),elements=new Map(),events=new Map();let copied='';
 const get=id=>{if(!elements.has(id))elements.set(id,{tagName:id==='o-nhat-ky'?'PRE':'TEXTAREA',value:'',textContent:'',focus(){},select(){this.selected=true;},setSelectionRange(){}});return elements.get(id);};
 const context=vm.createContext({document:{getElementById:get},URL,Date,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{clipboard:{writeText:async s=>{if(failCopy)throw Error('clipboard blocked');copied=s;}}},addEventListener:(k,fn)=>events.set(k,fn)});vm.runInContext(source,context);
 return {api:context.PHARunLog,store,get,events,copied:()=>copied};
}
test('Journal persists failures without keys, bearer credentials or Rednote share parameters',()=>{
 const j=journal();j.api.add('Lỗi','https://www.rednote.com/explore/abc?xsec_token=private-share Bearer private-bearer api_key=secret-key my-private-key',['my-private-key']);
 const stored=j.store.get('pha-app-run-log-v1');assert.match(stored,/explore\/abc/);assert.doesNotMatch(stored,/private-share|private-bearer|secret-key|my-private-key/);assert.equal(j.get('runLog').value,j.get('o-nhat-ky').textContent);
});
test('Clear removes shared and old video history, retains settings, and never resurrects old entries',()=>{
 const j=journal({'phaha-dv-nhat-ky':'previous error','phaha-dv-cai-dat':'keep-keys-and-settings'});assert.match(j.api.getText(),/previous error/);
 j.api.add('Tải','old run');j.api.clear();assert.equal(j.api.getText(),'');assert.equal(j.get('runLog').value,'');assert.equal(j.store.has('phaha-dv-nhat-ky'),false);assert.equal(j.store.has('pha-app-run-log-v1'),false);assert.equal(j.store.get('phaha-dv-cai-dat'),'keep-keys-and-settings');
 j.api.add('Tải','new run');assert.doesNotMatch(j.api.getText(),/old run|previous error/);assert.match(j.api.getText(),/new run/);
});
test('Clipboard receives all stages; blocked clipboard selects text on Safari',async()=>{
 const j=journal();j.api.add('Tải','done');j.api.add('Caption','failed');assert.equal(await j.api.copy('runLog','runLogFeedback'),true);assert.equal(j.copied(),j.api.getText());
 const blocked=journal({},true);blocked.api.add('Lỗi','reason');assert.equal(await blocked.api.copy('runLog','runLogFeedback'),false);assert.equal(blocked.get('runLog').selected,true);assert.match(blocked.get('runLogFeedback').textContent,/Safari/);
});
test('Clear from another tab empties the visible log and bounded history remains writable',()=>{
 const j=journal();for(let n=0;n<32;n++)j.api.add('Bước','a'.repeat(8000));assert.ok(j.api.getText().length<=180000);
 j.store.delete('pha-app-run-log-v1');j.events.get('storage')({key:'pha-app-run-log-v1'});assert.equal(j.api.getText(),'');assert.equal(j.get('runLog').value,'');j.api.add('Mới','next');assert.match(j.api.getText(),/next/);
});
test('Reload restores a complete multi-step history beyond one message limit',()=>{
 const saved=Array.from({length:100},(_,n)=>'Step '+n+' '+'.'.repeat(100)).join('\n');const j=journal({'pha-app-run-log-v1':saved});assert.equal(j.api.getText(),saved);assert.match(j.get('runLog').value,/Step 99/);
});
