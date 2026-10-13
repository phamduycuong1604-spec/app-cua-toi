import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from '../worker/index.js';

test('Raw HTTPS export preserves all nine source files and the complete combined text',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../worker/source-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.files.length,9);
 const combined=await worker.fetch(new Request('https://site.test/source/tai-video.txt'),{});
 assert.equal(combined.status,200);
 assert.equal(combined.headers.get('content-type'),'text/plain; charset=utf-8');
 assert.match(combined.headers.get('content-disposition'),/^inline;/);
 assert.equal(combined.headers.get('x-content-type-options'),'nosniff');
 assert.match(combined.headers.get('content-security-policy'),/default-src 'none'/);
 const all=await combined.text();
 assert.ok(all.includes(manifest.commit_sha));
 for(const item of manifest.files){
  const response=await worker.fetch(new Request('https://site.test/source/'+item.file),{});
  assert.equal(response.status,200,item.file);
  const body=await response.text();
  assert.equal(createHash('sha256').update(body).digest('hex'),item.sha256,item.file);
  assert.ok(all.includes(body),item.file+' must be complete in combined export');
 }
});

test('Source export rejects unlisted files and mutations; HEAD returns only headers',async()=>{
 for(const path of ['.env','__proto__','constructor','worker/dub.js','%2e%2e%2f.env']){
  const response=await worker.fetch(new Request('https://site.test/source/'+path),{});
  assert.equal(response.status,404,path);
 }
 for(const method of ['POST','PUT','DELETE']){
  const response=await worker.fetch(new Request('https://site.test/source/tai-video.txt',{method}),{});
  assert.equal(response.status,405);
  assert.equal(response.headers.get('allow'),'GET, HEAD');
 }
 const head=await worker.fetch(new Request('https://site.test/source/tai-video.txt',{method:'HEAD'}),{});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});
