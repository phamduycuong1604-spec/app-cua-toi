// Executes the current modular PhaHa entrypoint, not the removed monolithic
// client. Instrumentation is added only to this in-memory test build.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {webcrypto} from 'node:crypto';
const directory=new URL('../web/phaha/',import.meta.url).pathname;
const html=await readFile(new URL('../web/phaha/dub.html',import.meta.url),'utf8');
const bundle=await build({entryPoints:[directory+'app.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',external:['/dub/*'],plugins:[{name:'test-bindings',setup(b){
 b.onResolve({filter:/^\/dub\/ffmpeg\/index\.js$/},()=>({path:'ffmpeg',namespace:'test-only'}));
 b.onLoad({filter:/.*/,namespace:'test-only'},()=>({contents:'export const FFmpeg=globalThis.TestFFmpeg;',loader:'js'}));
 b.onLoad({filter:/\.js$/},async args=>{
  if(!args.path.startsWith(directory))return;
  const source=await readFile(args.path,'utf8'),names=[...source.matchAll(/^(?:export\s+)?(?:async\s+)?(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)];
  const fields=[...new Map(names.map(([,type,name])=>[name,`get ${name}(){return ${name}}${type==='function'||type==='let'?`,set ${name}(value){${name}=value}`:''}`])).values()];
  const contents=source.replaceAll('import.meta.url',JSON.stringify('https://site.test/dub/app.js'))+'\nglobalThis.__modules['+JSON.stringify(path.basename(args.path))+']={'+fields.join(',')+'};';
  return{contents,loader:'js',resolveDir:path.dirname(args.path)};
 });
}}]});
export class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.type='text';this.value='';this.dataset={};this.children=[];this.events={};this.selectors={};this.disabled=false;this.checked=false;this.duration=0;this.videoWidth=0;this.videoHeight=0;this.readyState=0;this.files=[];this.textContent='';this.classes=new Set();this.classList={add:(...x)=>x.forEach(c=>this.classes.add(c)),remove:(...x)=>x.forEach(c=>this.classes.delete(c)),toggle:(c,v)=>{if(v===undefined)v=!this.classes.has(c);v?this.classes.add(c):this.classes.delete(c)},contains:c=>this.classes.has(c)};}
 addEventListener(k,f){(this.events[k]??=[]).push(f)}removeEventListener(k,f){this.events[k]=(this.events[k]||[]).filter(x=>x!==f)}
 append(...items){items.forEach(x=>{if(x instanceof Element)x.parent=this;this.children.push(x)})}appendChild(x){this.append(x);return x}replaceChildren(...x){this.children=[];this.append(...x)}
 querySelector(s){return this.selectors[s]??=new Element(s==='textarea'?'textarea':'div')}querySelectorAll(){return[]}closest(){return this.parent||this}
 setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}pause(){}load(){}play(){return Promise.resolve()}click(){}scrollIntoView(){}showModal(){this.open=true}close(){this.open=false}add(e){this.append(e)}select(){}
 getContext(){return{clearRect(){},drawImage(){},fillRect(){},save(){},restore(){},measureText:()=>({width:10})}}
}
export function harness({stored={},nativeFetch=async()=>Response.json({edge:true,cloudflare:false,sync:true})}={}){
 const elements=new Map(),events=new Map(),revoked=[],store=new Map(Object.entries(stored));let busy=false,file=null,urlId=0;
 for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[1]);e.id=m[3];e.type=/type="([^"]+)"/.exec(m[2])?.[1]||'text';if(/class="[^"]*\ban\b/.test(m[2]))e.classList.add('an');elements.set(e.id,e)}
 const get=id=>{if(!elements.has(id))throw Error('Missing real HTML control: '+id);return elements.get(id)};
 const selectors=new Map(),document={getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t}),querySelector:s=>{if(!selectors.has(s))selectors.set(s,new Element());return selectors.get(s)},querySelectorAll:()=>[],body:new Element('body')};
 const context=vm.createContext({__modules:{},document,location:{origin:'https://site.test',href:'https://site.test/',reload(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},fetch:nativeFetch,Request,Response,Headers,FormData,URL:class extends URL{static createObjectURL(){return'blob:test-'+(++urlId)}static revokeObjectURL(u){revoked.push(u)}},navigator:{userAgent:'Test desktop',hardwareConcurrency:4,clipboard:{writeText:async()=>{}}},performance,crypto:webcrypto,Blob,File,TextEncoder,TextDecoder,Uint8Array,Int16Array,Float32Array,AbortController,AbortSignal,DOMException,btoa,atob,CompressionStream,DecompressionStream,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},error(){}},alert(){},confirm:()=>false,Image:class{},Option:class extends Element{},TestFFmpeg:class{on(){}async load(){}terminate(){}},addEventListener:(k,f)=>events.set(k,f),PHADownload:{getVideoFile:()=>file,getProfile:()=>({id:'pha_color',label:'Pha Color Grading',description:'Photoshop, ACR',glossary:{'肤色':'màu da'}}),getRules:()=>'Giữ tên Curves',isBusy:()=>busy,lock:v=>{busy=v},setVideo:f=>{file=f}}});context.window=context;
 vm.runInContext(bundle.outputFiles[0].text,context);
 const modules=context.__modules;
 for(const module of Object.values(modules))for(const name of Object.keys(module)){
  if(Object.hasOwn(context,name))continue;const descriptor=Object.getOwnPropertyDescriptor(module,name);
  Object.defineProperty(context,name,{get:()=>module[name],...(descriptor.set?{set:value=>{module[name]=value}}:{}),configurable:true});
 }
 const state=modules['nen.js'].S;
 for(const key of ['tepVideo','videoKetQua','thoiLuong','cacCau','dangChay','nhacNen'])Object.defineProperty(context,key,{get:()=>state[key],set:value=>state[key]=value,configurable:true});
 return{context,get,events,revoked,store,module:name=>modules[name],eval:s=>vm.runInContext(s,context),busy:v=>busy=v,setFile:f=>file=f,file:f=>context.testFile=f};
}
