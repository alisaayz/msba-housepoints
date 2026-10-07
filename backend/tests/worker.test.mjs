import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker.mjs';
function database() {
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql'))) db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
 return {prepare(sql){let params=[];return {bind(...args){params=args;return this;},async all(){return {results:db.prepare(sql).all(...params)};},async first(){return db.prepare(sql).get(...params)||null;},async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}};}};}};
}
const payload=()=>({id:crypto.randomUUID(),student:'Alisa',house:'M',points:5,reason:'Team activity'});
const request=data=>new Request('https://example.test/entries',{method:'POST',headers:{Origin:'https://alisaayz.github.io','Content-Type':'application/json'},body:JSON.stringify(data)});
test('a student can save without credentials and read the shared record',async()=>{
 const env={DB:database()},input=payload();const response=await worker.fetch(request(input),env);assert.equal(response.status,201);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://alisaayz.github.io');
 const saved=(await response.json()).entry;assert.equal(saved.student,'Alisa');
 const fresh=await worker.fetch(new Request('https://example.test/entries'),env);assert.equal((await fresh.json()).entries[0].id,input.id);
});
test('retrying a submission adds its points only once',async()=>{
 const env={DB:database()},input=payload();await worker.fetch(request(input),env);assert.equal((await worker.fetch(request(input),env)).status,200);
 const response=await worker.fetch(new Request('https://example.test/entries'),env);assert.equal((await response.json()).entries.length,1);
 assert.equal((await worker.fetch(request({...input,points:99}),env)).status,409);
});
test('invalid student inputs never change shared data',async()=>{
 const env={DB:database()};for(const change of [{student:' '},{house:'X'},{points:-5},{points:1.5},{reason:' '},{id:'not-an-id'}]) assert.equal((await worker.fetch(request({...payload(),...change}),env)).status,400);
 const response=await worker.fetch(new Request('https://example.test/entries'),env);assert.deepEqual((await response.json()).entries,[]);
});
test('browser preflight succeeds and unrelated origins are rejected',async()=>{
 const response=await worker.fetch(new Request('https://example.test/entries',{method:'OPTIONS',headers:{Origin:'https://alisaayz.github.io'}}),{});assert.equal(response.status,204);
 const wrong=new Request('https://example.test/entries',{method:'POST',headers:{Origin:'https://unrelated.test','Content-Type':'application/json'},body:JSON.stringify(payload())});assert.equal((await worker.fetch(wrong,{DB:database()})).status,403);
});
