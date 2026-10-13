import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const files=await Promise.all(['dub-client.js','site-bridge.js','du-phong.js','lop-phu.js','dong-bo.js','dub.html'].map(n=>readFile(new URL('../web/'+n,import.meta.url),'utf8')));
const [source,bridgeSource,fallbackSource,overlays,sync,html]=files;
const plain=s=>s.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'').replaceAll('import.meta.url',JSON.stringify('https://site.test/dub/app.js'));
export class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.type='text';this.value='';this.dataset={};this.children=[];this.events={};this.selectors={};this.disabled=false;this.checked=false;this.duration=0;this.videoWidth=0;this.videoHeight=0;this.readyState=0;this.files=[];this.textContent='';this.classes=new Set();this.classList={add:(...x)=>x.forEach(c=>this.classes.add(c)),remove:(...x)=>x.forEach(c=>this.classes.delete(c)),toggle:(c,v)=>{if(v===undefined)v=!this.classes.has(c);v?this.classes.add(c):this.classes.delete(c);},contains:c=>this.classes.has(c)};}
 addEventListener(k,f){(this.events[k]??=[]).push(f);}removeEventListener(k,f){this.events[k]=(this.events[k]||[]).filter(x=>x!==f);}
 append(...items){items.forEach(x=>{if(x instanceof Element)x.parent=this;this.children.push(x);});}appendChild(x){this.append(x);return x;}replaceChildren(...x){this.children=[];this.append(...x);}
 querySelector(s){return this.selectors[s]??=new Element(s==='textarea'?'textarea':'div');}querySelectorAll(){return [];}
 closest(){return this.parent||this;}setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}pause(){}load(){}play(){return Promise.resolve();}click(){}scrollIntoView(){}showModal(){this.open=true;}close(){this.open=false;}add(e){this.append(e);}
}
export function harness({stored={},nativeFetch=async()=>new Response(JSON.stringify({edge:true,cloudflare:false,sync:true}))}={}){
 const elements=new Map(),events=new Map(),revoked=[],store=new Map(Object.entries(stored));let busy=false,file=null,urlId=0;
 for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[1]);e.id=m[3];e.type=/type="([^"]+)"/.exec(m[2])?.[1]||'text';elements.set(e.id,e);}
 const get=id=>{if(!elements.has(id))throw Error('Missing real HTML control: '+id);return elements.get(id);};
 const document={getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t}),querySelector:s=>s.includes('data-buoc')?get('cac-buoc').querySelector(s):null,querySelectorAll:s=>s.startsWith('#videoStudio input')?[...elements.values()].filter(e=>['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.tagName)):[],body:new Element('body')};
 const context=vm.createContext({document,location:{origin:'https://site.test',href:'https://site.test/',reload(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:nativeFetch,Request,Response,Headers,FormData,URL:class extends URL{static createObjectURL(){return 'blob:test-'+(++urlId);}static revokeObjectURL(u){revoked.push(u);}},navigator:{userAgent:"Test desktop",hardwareConcurrency:4},performance,crypto:webcrypto,Blob,File,TextEncoder,TextDecoder,Uint8Array,Int16Array,Float32Array,AbortController,AbortSignal,DOMException,btoa,atob,CompressionStream,DecompressionStream,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},error(){}},alert(){},confirm:()=>false,Image:class{},Option:class extends Element{},FFmpeg:class{on(){}async load(){}terminate(){}},addEventListener:(k,f)=>events.set(k,f),PHADownload:{getVideoFile:()=>file,getProfile:()=>({id:'pha_color',label:'Pha Color Grading',description:'Photoshop, ACR',glossary:{'肤色':'màu da'}}),getRules:()=> 'Giữ tên Curves',isBusy:()=>busy,lock:v=>{busy=v;},setVideo:f=>{file=f;}}});context.window=context;
 vm.runInContext(plain(bridgeSource),context);vm.runInContext('const fetch=siteFetch;',context);
 for(const s of [fallbackSource,overlays,sync,source])vm.runInContext(plain(s),context);
 return {context,get,events,revoked,store,eval:s=>vm.runInContext(s,context),busy:v=>{busy=v;},setFile:f=>{file=f;},file:f=>{context.testFile=f;}};
}
